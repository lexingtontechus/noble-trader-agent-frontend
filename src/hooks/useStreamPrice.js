"use client";
import { useEffect, useRef } from "react";
import {
  subscribeToPolling,
  pausePolling,
  resumePolling,
} from "@/lib/price-poll-coordinator";
import { notifyWarning } from "@/lib/notifications";

/**
 * useStreamPrice — subscribes to live price updates for a symbol.
 *
 * Architecture (v7.4 — Fluid Compute eliminated):
 *   - Uses coordinated polling only (15-60s adaptive intervals)
 *   - SSE BFF proxy removed — was causing Vercel Fluid Compute charges
 *   - Future: Supabase Realtime Broadcast for sub-second updates
 *
 * The poll coordinator batches all subscribed symbols into a single
 * timer cycle, reducing API calls by ~66% vs independent polling.
 */
export function useStreamPrice(symbol, updateStreamState, addAlert) {
  const mountedRef = useRef(true);
  const lastRegimeLabelRef = useRef(null);
  const lastTickPriceRef = useRef(null);
  const unsubPollRef = useRef(null);

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
      startPolling();
    }

    start();

    // Visibility-based pause/resume
    const handleVisibility = () => {
      if (document.hidden) {
        pausePolling();
      } else {
        if (mountedRef.current) {
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
      document.removeEventListener("visibilitychange", handleVisibility);
      updateStreamState(symbol, { connected: false, streaming: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, updateStreamState, addAlert]);
}
