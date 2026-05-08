"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  subscribeToPolling,
  pausePolling,
  resumePolling,
} from "@/lib/price-poll-coordinator";
import { notifyWarning, notifyInfo } from "@/lib/notifications";

const SSE_RETRY_INTERVAL = 300000; // 5 min

export function useStreamPrice(symbol, updateStreamState, addAlert) {
  const [sseMode, setSseMode] = useState(false);
  const sseModeRef = useRef(false);
  const eventSourceRef = useRef(null);
  const sseRetryRef = useRef(null);
  const mountedRef = useRef(true);
  const lastRegimeLabelRef = useRef(null);
  const lastTickPriceRef = useRef(null);
  const unsubPollRef = useRef(null);

  const clearSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (sseRetryRef.current) {
      clearTimeout(sseRetryRef.current);
      sseRetryRef.current = null;
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const es = new EventSource(
        `/api/stream/sse?symbol=${encodeURIComponent(symbol)}`,
      );
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setSseMode(true);
        sseModeRef.current = true;
        // Unsubscribe from polling since SSE is live
        if (unsubPollRef.current) {
          unsubPollRef.current();
          unsubPollRef.current = null;
        }
        updateStreamState(symbol, {
          connected: true,
          streaming: true,
          sseMode: true,
          error: null,
        });
      };

      es.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const tick = JSON.parse(event.data);
          updateStreamState(symbol, { lastTick: tick, streaming: true });

          if (tick.regime_change || tick.alert) {
            addAlert({
              symbol,
              type: tick.regime_change ? "regime_change" : "alert",
              message: tick.regime_change
                ? `Regime changed to ${tick.regime_label || "unknown"}`
                : tick.alert || "Stream alert",
              severity: tick.severity || "info",
              timestamp: Date.now(),
            });
            if (tick.regime_change) {
              notifyWarning(
                `🔄 ${symbol}: Regime changed to ${tick.regime_label || "unknown"}`,
                6000,
              );
            }
          }
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (!mountedRef.current) return;
        updateStreamState(symbol, {
          connected: false,
          streaming: false,
          sseMode: false,
        });
        setSseMode(false);
        sseModeRef.current = false;
        notifyInfo(`${symbol}: Switched to polling mode`, 3000);
        // Subscribe to polling
        if (!unsubPollRef.current) {
          startPolling();
        }
      };
    } catch {
      if (!mountedRef.current) return;
      setSseMode(false);
      sseModeRef.current = false;
      if (!unsubPollRef.current) startPolling();
    }
  }, [symbol, updateStreamState, addAlert]);

  function startPolling() {
    updateStreamState(symbol, {
      connected: true,
      streaming: true,
      sseMode: false,
    });
    unsubPollRef.current = subscribeToPolling(symbol, {
      onTick: (data) => {
        if (!mountedRef.current) return;
        const prevRegime = lastRegimeLabelRef.current;
        lastTickPriceRef.current = data.price;
        const regimeLabel = data.regime_label || null;
        const regimeChanged =
          regimeLabel && prevRegime && regimeLabel !== prevRegime;
        if (regimeLabel) lastRegimeLabelRef.current = regimeLabel;

        const tick = {
          symbol,
          price: data.price,
          timestamp: data.timestamp || Date.now(),
          regime_label: regimeLabel,
          regime_change: regimeChanged,
        };
        updateStreamState(symbol, { lastTick: tick, streaming: true, error: null });

        if (regimeChanged) {
          addAlert({
            symbol,
            type: "regime_change",
            message: `Regime changed to ${regimeLabel}`,
            severity: "warning",
            timestamp: Date.now(),
          });
          notifyWarning(
            `🔄 ${symbol}: Regime changed to ${regimeLabel}`,
            6000,
          );
        }
      },
      onError: (msg) => {
        if (!mountedRef.current) return;
        updateStreamState(symbol, { error: msg });
      },
    });
  }

  useEffect(() => {
    mountedRef.current = true;

    async function seed() {
      try {
        updateStreamState(symbol, { seeded: false, error: null });
        const res = await fetch("/api/stream/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
        const data = await res.json();
        if (mountedRef.current) {
          updateStreamState(symbol, { seeded: true, lastTick: data });
          if (data?.regime_label) lastRegimeLabelRef.current = data.regime_label;
          if (data?.price) lastTickPriceRef.current = data.price;
        }
        return true;
      } catch (err) {
        if (mountedRef.current) {
          updateStreamState(symbol, { seeded: false, error: err.message });
        }
        return false;
      }
    }

    async function start() {
      await seed();
      if (!mountedRef.current) return;
      // Default to polling; SSE will be attempted via retry
      startPolling();
      // Periodic SSE reconnect attempt
      scheduleSSERetry();
    }

    start();

    // Visibility-based pause/resume
    const handleVisibility = () => {
      if (document.hidden) {
        pausePolling();
      } else {
        if (!sseModeRef.current && mountedRef.current) {
          resumePolling();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      if (unsubPollRef.current) {
        unsubPollRef.current();
        unsubPollRef.current = null;
      }
      clearSSE();
      document.removeEventListener("visibilitychange", handleVisibility);
      updateStreamState(symbol, { connected: false, streaming: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, updateStreamState, addAlert]);

  function scheduleSSERetry() {
    if (!mountedRef.current) return;
    sseRetryRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (!sseModeRef.current) connectSSE();
      scheduleSSERetry();
    }, SSE_RETRY_INTERVAL);
  }
}
