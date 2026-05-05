"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useStreamPrice — Hook for SSE streaming + tick pushing for a single symbol.
 *
 * Flow:
 * 1. Seed: POST /api/stream/seed → creates FastAPI session with Yahoo prices
 * 2. Connect: EventSource to FastAPI /sse/{symbol} for real-time regime snapshots
 * 3. Push ticks: Periodically fetch latest price from Yahoo and push as tick
 * 4. Receive: SSE delivers TickResponse with regime, sizing, risk on every tick
 *
 * If SSE fails (CORS), falls back to using tick response data directly.
 *
 * Improvements (Phase 3 rebuild):
 * - Proper reconnect delay with exponential backoff (EventSource doesn't auto-delay)
 * - Seed retry with backoff on transient failures
 * - Tick count tracking
 * - Connected timestamp tracking
 * - Stale closure fixes using refs for callbacks
 * - Clean teardown on unmount
 */

const TICK_INTERVAL = 30_000; // Push a tick every 30s
const SSE_RECONNECT_BASE = 2000; // Base reconnect delay (ms)
const SSE_RECONNECT_MAX = 30000; // Max reconnect delay (ms)
const SEED_MAX_RETRIES = 3; // Max seed retry attempts
const SEED_RETRY_BASE = 3000; // Base delay between seed retries (ms)

export default function useStreamPrice(symbol, options = {}) {
  const { enabled = false, onAlert, onTick } = options;

  const [isSeeded, setIsSeeded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastTick, setLastTick] = useState(null); // TickResponse from SSE
  const [error, setError] = useState(null);
  const [sseMode, setSseMode] = useState(null); // 'direct' | 'fallback' | null
  const [tickCount, setTickCount] = useState(0);
  const [connectedAt, setConnectedAt] = useState(null);

  const eventSourceRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const seedAttemptedRef = useRef(false);
  const seedRetryCountRef = useRef(0);
  const sseModeRef = useRef(null);

  // Keep sseMode in a ref so callbacks can read latest value without stale closures
  useEffect(() => {
    sseModeRef.current = sseMode;
  }, [sseMode]);

  // Cleanup helper — closes all connections and intervals
  const cleanup = useCallback(() => {
    // Close EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Clear tick interval
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    // Reset reconnect counter
    reconnectAttemptRef.current = 0;

    setIsConnected(false);
    setIsStreaming(false);
    setConnectedAt(null);
  }, []);

  // Push a tick via BFF → FastAPI
  const pushTick = useCallback(
    async (price) => {
      try {
        const res = await fetch("/api/stream/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, price, ts: Date.now() / 1000 }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Tick push HTTP ${res.status}`);
        }

        const data = await res.json();

        // If not receiving via direct SSE, use the tick response as fallback
        if (sseModeRef.current !== "direct" && data.regime_label) {
          setLastTick(data);
          setTickCount((prev) => prev + 1);
          if (onTick) onTick(symbol, data);
        }

        return data;
      } catch (err) {
        console.error(`[Stream] Tick push failed for ${symbol}:`, err.message);
        // Don't set global error for individual tick failures — they're transient
        return null;
      }
    },
    [symbol, onTick],
  );

  // Fetch latest price from Yahoo and push as tick
  const fetchAndPushTick = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(
        `/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`,
      );
      if (!res.ok) return;

      const data = await res.json();
      if (data.price && data.price > 0) {
        await pushTick(data.price);
      }
    } catch (err) {
      console.error(
        `[Stream] Fetch+push tick failed for ${symbol}:`,
        err.message,
      );
    }
  }, [symbol, pushTick]);

  // Connect to SSE — try direct FastAPI connection, with proper reconnect delays
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;

    const fastapiBase =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
          "https://noble-trader-fastapi-backend.onrender.com"
        : "https://noble-trader-fastapi-backend.onrender.com";

    const sseUrl = `${fastapiBase}/sse/${encodeURIComponent(symbol)}`;

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      // Connection timeout — if we don't open in 10s, consider direct SSE failed
      const connectTimeout = setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) {
          es.close();
          eventSourceRef.current = null;
          // Fall back to tick polling
          setSseMode("fallback");
          sseModeRef.current = "fallback";
          console.warn(
            `[Stream] Direct SSE timed out for ${symbol}, falling back to tick polling`,
          );
        }
      }, 10000);

      es.onopen = () => {
        clearTimeout(connectTimeout);
        if (mountedRef.current) {
          setIsConnected(true);
          setSseMode("direct");
          sseModeRef.current = "direct";
          setConnectedAt(Date.now());
          reconnectAttemptRef.current = 0;
          console.log(`[Stream] SSE connected for ${symbol}`);
        }
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Skip connected/heartbeat messages
          if (data.type === "connected") return;

          if (mountedRef.current) {
            setLastTick(data);
            setTickCount((prev) => prev + 1);
            if (onTick) onTick(symbol, data);

            // Check for regime change alerts embedded in tick
            if (data.regime_changed && data.alert && onAlert) {
              onAlert(data.alert);
            }
          }
        } catch {
          // Ignore parse errors (heartbeat comments, etc.)
        }
      };

      es.onerror = () => {
        clearTimeout(connectTimeout);
        if (!mountedRef.current) return;

        setIsConnected(false);
        setConnectedAt(null);

        // Increment reconnect attempt
        reconnectAttemptRef.current += 1;

        if (reconnectAttemptRef.current >= 5) {
          // Give up on direct SSE after 5 failures — switch to polling
          es.close();
          eventSourceRef.current = null;
          setSseMode("fallback");
          sseModeRef.current = "fallback";
          console.warn(
            `[Stream] Giving up on direct SSE for ${symbol} after ${reconnectAttemptRef.current} failures, using tick polling`,
          );
        } else {
          // Close the current ES and retry with delay
          es.close();
          eventSourceRef.current = null;

          const delay = Math.min(
            SSE_RECONNECT_BASE * Math.pow(2, reconnectAttemptRef.current - 1),
            SSE_RECONNECT_MAX,
          );
          console.log(
            `[Stream] SSE reconnecting for ${symbol} (attempt ${reconnectAttemptRef.current}, ${delay}ms delay)`,
          );

          // Schedule reconnect
          if (reconnectTimeoutRef.current)
            clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && isSeeded) {
              connectSSE();
            }
          }, delay);
        }
      };
    } catch {
      // EventSource constructor failed
      setSseMode("fallback");
      sseModeRef.current = "fallback";
    }
  }, [symbol, onAlert, onTick]); // Removed isSeeded from deps — read from ref instead

  // Start streaming: seed → connect SSE → start tick push interval
  const startStreaming = useCallback(async () => {
    if (seedAttemptedRef.current) return;
    seedAttemptedRef.current = true;

    setError(null);
    setIsStreaming(true);

    try {
      // Step 1: Seed the session (with retry)
      console.log(`[Stream] Seeding session for ${symbol}...`);
      const seedRes = await seedWithRetry(symbol);

      if (!seedRes) {
        throw new Error("Seed failed after all retries");
      }

      setIsSeeded(true);
      seedRetryCountRef.current = 0;
      console.log(
        `[Stream] Session seeded for ${symbol}:`,
        seedRes.ready ? "ready" : "pending",
      );

      // Step 2: Connect SSE
      connectSSE();

      // Step 3: Start periodic tick pushing
      fetchAndPushTick();
      tickIntervalRef.current = setInterval(fetchAndPushTick, TICK_INTERVAL);
    } catch (err) {
      console.error(
        `[Stream] Failed to start streaming for ${symbol}:`,
        err.message,
      );
      setError(err.message);
      setIsStreaming(false);
      seedAttemptedRef.current = false;
    }
  }, [symbol, connectSSE, fetchAndPushTick]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    cleanup();
    setIsSeeded(false);
    setLastTick(null);
    setError(null);
    setSseMode(null);
    sseModeRef.current = null;
    setTickCount(0);
    seedAttemptedRef.current = false;
    seedRetryCountRef.current = 0;
    console.log(`[Stream] Stopped streaming for ${symbol}`);
  }, [symbol, cleanup]);

  // Auto-start/stop based on enabled flag
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && !isStreaming && !seedAttemptedRef.current) {
      startStreaming();
    } else if (!enabled && isStreaming) {
      stopStreaming();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, isStreaming, startStreaming, stopStreaming, cleanup]);

  return {
    symbol,
    isSeeded,
    isConnected,
    isStreaming,
    lastTick,
    error,
    sseMode,
    tickCount,
    connectedAt,
    startStreaming,
    stopStreaming,
    pushTick,
  };
}

// ── Helper: Seed with retry ──────────────────────────────────────────────────

async function seedWithRetry(symbol, maxRetries = SEED_MAX_RETRIES) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch("/api/stream/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      if (res.ok) {
        return await res.json();
      }

      // Don't retry on 4xx (client errors)
      if (res.status >= 400 && res.status < 500) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Seed HTTP ${res.status}`);
      }

      // 5xx — retry with backoff
      console.warn(
        `[Stream] Seed attempt ${attempt + 1} failed for ${symbol} (HTTP ${res.status})`,
      );
    } catch (err) {
      if (attempt < maxRetries - 1 && !err.message?.includes("HTTP 4")) {
        const delay = SEED_RETRY_BASE * (attempt + 1);
        console.log(`[Stream] Retrying seed for ${symbol} in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  return null;
}
