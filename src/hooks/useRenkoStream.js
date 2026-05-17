"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useRenkoStream — Real-time price feed for the Renko pipeline.
 *
 * Connects to Finnhub WebSocket for live prices and automatically
 * feeds ticks into the backend Renko pipeline when new prices arrive.
 *
 * Features:
 *   - Finnhub WebSocket for sub-second price updates
 *   - Automatic tick feeding to /api/renko/tick
 *   - Throttling (max 1 tick per second per symbol to avoid overloading)
 *   - Reconnection with exponential backoff
 *   - Market hours awareness (auto-pause outside 9:30-16:00 ET)
 *   - Graceful fallback to polling if WebSocket fails
 *   - Visibility API: pause when document is hidden
 *
 * @param {string} symbol - The ticker symbol to stream (e.g. "SPY")
 * @param {object} options
 * @param {boolean} [options.enabled=false] - Whether streaming is active
 * @param {function} [options.onBrick] - Callback when a new brick is created
 * @param {function} [options.onSignal] - Callback when a signal is detected
 * @param {function} [options.onError] - Callback on error
 * @returns {{ connected, lastPrice, lastTickTime, tickCount, brickCount, toggle }}
 */
export default function useRenkoStream(symbol, options = {}) {
  const {
    enabled: enabledProp = false,
    onBrick,
    onSignal,
    onError,
  } = options;

  // ── State ─────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [lastPrice, setLastPrice] = useState(null);
  const [lastTickTime, setLastTickTime] = useState(null);
  const [tickCount, setTickCount] = useState(0);
  const [brickCount, setBrickCount] = useState(0);
  const [streaming, setStreaming] = useState(enabledProp);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const lastThrottleRef = useRef(0); // timestamp of last throttled tick
  const mountedRef = useRef(true);
  const symbolRef = useRef(symbol);
  const streamingRef = useRef(streaming);
  const pollIntervalRef = useRef(null);
  const tickCountRef = useRef(0);
  const brickCountRef = useRef(0);

  // Keep refs in sync with props/state
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  // ── Market Hours Check ────────────────────────────────────────────────────
  // Mon-Fri 9:30-16:00 ET (America/New_York)
  const isMarketOpen = useCallback(() => {
    try {
      const now = new Date();
      const etString = now.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });

      // Parse: "Mon, 10:30 AM" or "Mon 10:30"
      const parts = etString.replace(",", "").split(/\s+/);
      const day = parts[0];
      const timeParts = parts[1].split(":");
      const hour = parseInt(timeParts[0], 10);
      const minute = parseInt(timeParts[1], 10);
      const totalMinutes = hour * 60 + minute;

      const isWeekday = !["Sat", "Sun"].includes(day);
      const isOpen = totalMinutes >= 570 && totalMinutes <= 960; // 9:30–16:00

      return isWeekday && isOpen;
    } catch {
      // If timezone check fails, assume open (let the user decide)
      return true;
    }
  }, []);

  // ── Feed tick to backend ──────────────────────────────────────────────────
  const feedTick = useCallback(
    async (price) => {
      try {
        const res = await fetch("/api/renko/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price, symbol: symbolRef.current }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Update counters
        tickCountRef.current += 1;
        if (mountedRef.current) setTickCount(tickCountRef.current);

        // Handle bricks created
        if (data.bricks_created?.length > 0) {
          brickCountRef.current += data.bricks_created.length;
          if (mountedRef.current) setBrickCount(brickCountRef.current);

          data.bricks_created.forEach((brick) => {
            if (onBrick) onBrick(brick);
          });
        }

        // Handle signals
        if (data.signal) {
          if (onSignal) onSignal(data.signal);
        }
      } catch (err) {
        if (onError && mountedRef.current) {
          onError(err);
        }
      }
    },
    [onBrick, onSignal, onError]
  );

  // ── WebSocket connection ─────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) {
      console.warn("[useRenkoStream] No NEXT_PUBLIC_FINNHUB_API_KEY — falling back to polling");
      startPolling();
      return;
    }

    try {
      const ws = new WebSocket(
        `wss://ws.finnhub.io/websocket?token=${apiKey}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log("[useRenkoStream] WebSocket connected");
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        // Subscribe to the current symbol
        const subMsg = JSON.stringify({
          type: "subscribe",
          symbol: symbolRef.current,
        });
        ws.send(subMsg);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || !streamingRef.current) return;

        try {
          const msg = JSON.parse(event.data);

          // Handle trade messages
          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const trade of msg.data) {
              // Filter: only process trades for our symbol
              if (trade.s !== symbolRef.current) continue;

              const price = trade.p;
              const now = Date.now();

              // Throttle: max 1 tick per second
              if (now - lastThrottleRef.current < 1000) continue;
              lastThrottleRef.current = now;

              // Update UI state
              setLastPrice(price);
              setLastTickTime(new Date(trade.t * 1000));

              // Feed to backend
              feedTick(Math.round(price * 100) / 100);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = (event) => {
        console.error("[useRenkoStream] WebSocket error:", event);
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log("[useRenkoStream] WebSocket closed:", event.code, event.reason);
        setConnected(false);
        wsRef.current = null;

        // Only reconnect if streaming is active and not intentionally closed
        if (streamingRef.current && event.code !== 1000) {
          scheduleReconnect();
        }
      };
    } catch (err) {
      console.error("[useRenkoStream] WebSocket creation failed:", err);
      if (mountedRef.current) {
        setConnected(false);
        startPolling();
      }
    }
  }, [feedTick]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // Already polling

    const poll = async () => {
      if (!mountedRef.current || !streamingRef.current) return;

      try {
        const sym = symbolRef.current;
        const res = await fetch(
          `/api/stream/latest-price?symbol=${encodeURIComponent(sym)}`
        );
        if (res.ok) {
          const data = await res.json();
          const price = data.price || data.close;
          if (price) {
            const now = Date.now();

            // Throttle: max 1 tick per second
            if (now - lastThrottleRef.current < 1000) return;
            lastThrottleRef.current = now;

            setLastPrice(price);
            setLastTickTime(new Date());
            setConnected(true); // Polling is "connected" in a sense
            feedTick(Math.round(price * 100) / 100);
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    // Poll immediately, then every 3 seconds
    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [feedTick]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ── Reconnection with exponential backoff ────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;

    // Check market hours before reconnecting
    if (!isMarketOpen()) {
      console.log("[useRenkoStream] Market closed — will check again in 30s");
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (streamingRef.current && mountedRef.current) {
          if (isMarketOpen()) {
            connectWebSocket();
          } else {
            scheduleReconnect(); // Keep checking
          }
        }
      }, 30000);
      return;
    }

    const attempts = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30s
    console.log(`[useRenkoStream] Reconnecting in ${delay}ms (attempt ${attempts + 1})`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (streamingRef.current && mountedRef.current) {
        reconnectAttemptsRef.current += 1;
        connectWebSocket();
      }
    }, delay);
  }, [connectWebSocket, isMarketOpen]);

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Unsubscribe before closing
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "unsubscribe", symbol: symbolRef.current })
          );
        }
      } catch {
        // Ignore send errors on closing socket
      }
      wsRef.current.close(1000, "Stream disabled");
      wsRef.current = null;
    }
    stopPolling();
    cancelReconnect();
    setConnected(false);
  }, [stopPolling, cancelReconnect]);

  // ── Toggle streaming ─────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    setStreaming((prev) => !prev);
  }, []);

  // ── Main effect: connect/disconnect based on streaming state ─────────────
  useEffect(() => {
    mountedRef.current = true;

    if (streaming) {
      // Check market hours
      if (!isMarketOpen()) {
        console.log("[useRenkoStream] Market closed — starting polling fallback");
        startPolling();
      } else {
        connectWebSocket();
      }
    } else {
      disconnect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, symbol]);

  // ── Visibility API: pause when hidden ────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Pause: disconnect WebSocket and stop polling
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, "Tab hidden");
          wsRef.current = null;
        }
        stopPolling();
        setConnected(false);
      } else {
        // Resume: reconnect if streaming is active
        if (streamingRef.current) {
          if (isMarketOpen()) {
            connectWebSocket();
          } else {
            startPolling();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [connectWebSocket, disconnect, isMarketOpen, startPolling, stopPolling]);

  // ── Resubscribe when symbol changes while connected ──────────────────────
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Unsubscribe from old symbol and subscribe to new one
    // (We don't know the old symbol here, but Finnhub handles duplicate subs gracefully)
    try {
      ws.send(JSON.stringify({ type: "subscribe", symbol }));
    } catch {
      // Ignore
    }

    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
        }
      } catch {
        // Ignore
      }
    };
  }, [symbol]);

  // ── Reset counters when symbol changes ───────────────────────────────────
  useEffect(() => {
    tickCountRef.current = 0;
    brickCountRef.current = 0;
    lastThrottleRef.current = 0;
    setTickCount(0);
    setBrickCount(0);
    setLastPrice(null);
    setLastTickTime(null);
  }, [symbol]);

  return {
    connected,
    lastPrice,
    lastTickTime,
    tickCount,
    brickCount,
    streaming,
    toggle,
    setStreaming,
  };
}
