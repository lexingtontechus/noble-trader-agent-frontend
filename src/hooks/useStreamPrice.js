"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// --- Polling interval constants (milliseconds) ---
const INTERVAL_FAST = 15000;   // 15s — after a failure
const INTERVAL_DEFAULT = 30000; // 30s — normal
const INTERVAL_SLOW = 60000;   // 60s — after 3 consecutive successes (market quiet)

const SSE_RETRY_INTERVAL = 300000; // 5 min — try reconnecting to SSE periodically
const CONSECUTIVE_SUCCESS_THRESHOLD = 3; // successes before slowing down

export function useStreamPrice(symbol, updateStreamState, addAlert) {
  // SSE disabled by default — no BFF SSE proxy wired up yet
  const [sseMode, setSseMode] = useState(false);
  const sseModeRef = useRef(false); // mirror state for use inside async callbacks

  const eventSourceRef = useRef(null);
  const tickTimeoutRef = useRef(null);   // setTimeout ref for adaptive polling
  const sseRetryRef = useRef(null);      // setTimeout ref for periodic SSE reconnect
  const mountedRef = useRef(true);

  // Adaptive polling state
  const intervalRef = useRef(INTERVAL_DEFAULT);
  const consecutiveSuccessRef = useRef(0);
  const lastTickPriceRef = useRef(null);
  const lastRegimeLabelRef = useRef(null);
  const pollingActiveRef = useRef(false);

  // ---- helpers ----

  const clearAllTimers = useCallback(() => {
    if (tickTimeoutRef.current) {
      clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = null;
    }
    if (sseRetryRef.current) {
      clearTimeout(sseRetryRef.current);
      sseRetryRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    pollingActiveRef.current = false;
  }, []);

  // ---- SSE connection (via BFF proxy) ----

  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      // Use BFF-proxied SSE route instead of direct FastAPI connection
      const es = new EventSource(`/api/stream/sse?symbol=${encodeURIComponent(symbol)}`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        consecutiveSuccessRef.current = 0;
        setSseMode(true);
        sseModeRef.current = true;
        // Stop polling — SSE is live
        if (tickTimeoutRef.current) {
          clearTimeout(tickTimeoutRef.current);
          tickTimeoutRef.current = null;
        }
        pollingActiveRef.current = false;
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

        // Fallback to polling
        if (!pollingActiveRef.current) {
          startPolling();
        }
      };
    } catch {
      if (!mountedRef.current) return;
      setSseMode(false);
      sseModeRef.current = false;
      if (!pollingActiveRef.current) {
        startPolling();
      }
    }
  }, [symbol, updateStreamState, addAlert]);

  // ---- Simplified pushTick ----
  // Only calls /api/stream/latest-price (one API call instead of two).
  // Detects regime changes locally from the tick data.

  async function pushTick() {
    if (!mountedRef.current) return;

    try {
      const res = await fetch(
        `/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`,
      );
      if (!res.ok) throw new Error(`Price fetch failed: ${res.status}`);

      const data = await res.json();
      if (!data.price || !mountedRef.current) return;

      // Build a lightweight tick object from price data
      const prevRegime = lastRegimeLabelRef.current;

      lastTickPriceRef.current = data.price;

      // Detect regime change locally if a regime_label comes back
      const regimeLabel = data.regime_label || null;
      const regimeChanged = regimeLabel && prevRegime && regimeLabel !== prevRegime;
      if (regimeLabel) lastRegimeLabelRef.current = regimeLabel;

      const tick = {
        symbol,
        price: data.price,
        timestamp: data.timestamp || Date.now(),
        regime_label: regimeLabel,
        regime_change: regimeChanged,
      };

      updateStreamState(symbol, { lastTick: tick, streaming: true, error: null });

      // Alert on regime change
      if (regimeChanged) {
        addAlert({
          symbol,
          type: "regime_change",
          message: `Regime changed to ${regimeLabel}`,
          severity: "warning",
          timestamp: Date.now(),
        });
      }

      // --- Adaptive interval: success path ---
      consecutiveSuccessRef.current += 1;

      if (consecutiveSuccessRef.current >= CONSECUTIVE_SUCCESS_THRESHOLD) {
        // Market is quiet — slow down
        intervalRef.current = INTERVAL_SLOW;
      } else {
        intervalRef.current = INTERVAL_DEFAULT;
      }
    } catch {
      // --- Adaptive interval: failure path ---
      consecutiveSuccessRef.current = 0;
      intervalRef.current = INTERVAL_FAST;

      if (mountedRef.current) {
        updateStreamState(symbol, { error: "Price fetch failed" });
      }
    }
  }

  // ---- Polling scheduler ----
  // Uses setTimeout instead of setInterval so each tick can adjust the delay.

  function scheduleNextTick() {
    if (!mountedRef.current || !pollingActiveRef.current) return;
    tickTimeoutRef.current = setTimeout(async () => {
      await pushTick();
      scheduleNextTick();
    }, intervalRef.current);
  }

  function startPolling() {
    pollingActiveRef.current = true;
    intervalRef.current = INTERVAL_DEFAULT;
    consecutiveSuccessRef.current = 0;
    updateStreamState(symbol, {
      connected: true,
      streaming: true,
      sseMode: false,
    });
    // Immediate first tick, then schedule
    pushTick().then(() => scheduleNextTick());
  }

  // ---- Periodic SSE reconnect attempt ----

  function scheduleSSERetry() {
    if (!mountedRef.current) return;
    sseRetryRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      // Only try SSE if we're currently in polling mode
      if (!sseModeRef.current) {
        connectSSE();
      }
      // Always schedule the next retry (will cancel if SSE succeeds)
      scheduleSSERetry();
    }, SSE_RETRY_INTERVAL);
  }

  // ---- Main effect ----

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
          // Seed data may contain regime info — cache it
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
      const seeded = await seed();
      if (!mountedRef.current) return;

      // Skip SSE for now — default straight to polling.
      // SSE code is preserved and will be attempted via scheduleSSERetry
      // once a BFF SSE proxy is confirmed working.
      startPolling();

      // Start periodic SSE reconnection attempts
      scheduleSSERetry();
    }

    start();

    return () => {
      mountedRef.current = false;
      clearAllTimers();
      updateStreamState(symbol, { connected: false, streaming: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, updateStreamState, addAlert]);
}
