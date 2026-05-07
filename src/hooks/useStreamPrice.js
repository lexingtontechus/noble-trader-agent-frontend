"use client";
import { useEffect, useRef, useState } from "react";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";
const TICK_INTERVAL = 30000; // 30 seconds

export function useStreamPrice(symbol, updateStreamState, addAlert) {
  const [sseMode, setSseMode] = useState(true);
  const eventSourceRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

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
        }
        return true;
      } catch (err) {
        if (mountedRef.current) {
          updateStreamState(symbol, { seeded: false, error: err.message });
        }
        return false;
      }
    }

    function connectSSE() {
      if (!mountedRef.current) return;

      try {
        const es = new EventSource(`${FASTAPI_BASE}/sse/${symbol}`);
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!mountedRef.current) return;
          reconnectAttempts.current = 0;
          setSseMode(true);
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

          // Fallback to polling mode
          startPolling();
        };
      } catch {
        if (mountedRef.current) {
          setSseMode(false);
          startPolling();
        }
      }
    }

    async function pushTick() {
      try {
        const priceRes = await fetch(
          `/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`,
        );
        if (!priceRes.ok) return;
        const priceData = await priceRes.json();
        const price = priceData.price;
        if (!price) return;

        const tickRes = await fetch("/api/stream/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, price }),
        });
        if (!tickRes.ok) return;
        const tickData = await tickRes.json();

        if (mountedRef.current) {
          updateStreamState(symbol, { lastTick: tickData, streaming: true });

          if (tickData.regime_change) {
            addAlert({
              symbol,
              type: "regime_change",
              message: `Regime changed to ${tickData.regime_label || "unknown"}`,
              severity: tickData.severity || "warning",
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        /* ignore tick errors */
      }
    }

    function startPolling() {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = setInterval(pushTick, TICK_INTERVAL);
      pushTick(); // immediate first tick
      if (mountedRef.current) {
        updateStreamState(symbol, {
          connected: true,
          streaming: true,
          sseMode: false,
        });
      }
    }

    async function start() {
      const seeded = await seed();
      if (seeded && mountedRef.current) {
        connectSSE();
      } else if (mountedRef.current) {
        startPolling();
      }
    }

    start();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      updateStreamState(symbol, { connected: false, streaming: false });
    };
  }, [symbol, updateStreamState, addAlert]);
}
