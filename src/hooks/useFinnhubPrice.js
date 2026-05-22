"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useFinnhubPrice — Generic real-time price hook using Finnhub WebSocket.
 *
 * Extracted from useRenkoStream — this is the reusable version that
 * provides raw price data without the Renko pipeline coupling.
 *
 * Features:
 *   - Finnhub WebSocket for sub-second price updates
 *   - Multi-symbol subscriptions on a single shared connection
 *   - Automatic reconnection with exponential backoff
 *   - Market hours awareness (auto-pause outside 9:30-16:00 ET)
 *   - Polling fallback when no API key or WS fails
 *   - Visibility API: pause when tab is hidden
 *   - Configurable throttle (default 1 tick/sec per symbol)
 *
 * @param {string[]} symbols - Array of ticker symbols to subscribe to
 * @param {object} options
 * @param {boolean} [options.enabled=true] - Whether the feed is active
 * @param {number} [options.throttleMs=1000] - Min ms between ticks per symbol
 * @param {function} [options.onPriceUpdate] - Callback({ symbol, price, timestamp, volume })
 * @param {function} [options.onError] - Callback on error
 * @returns {{
 *   connected: boolean,
 *   prices: Record<string, { price: number, timestamp: Date, volume: number, change: number }>,
 *   connectionMode: "websocket" | "polling" | "disconnected",
 *   subscribe: (symbol: string) => void,
 *   unsubscribe: (symbol: string) => void,
 *   lastUpdate: Date | null,
 * }}
 */
export default function useFinnhubPrice(symbols = [], options = {}) {
  const {
    enabled = true,
    throttleMs = 1000,
    onPriceUpdate,
    onError,
  } = options;

  // ── State ─────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState("disconnected"); // "websocket" | "polling" | "disconnected"
  const [prices, setPrices] = useState({}); // { [symbol]: { price, timestamp, volume, change } }
  const [lastUpdate, setLastUpdate] = useState(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const throttleRefs = useRef({}); // { [symbol]: timestamp }
  const mountedRef = useRef(true);
  const symbolsRef = useRef(new Set(symbols));
  const enabledRef = useRef(enabled);
  const pollIntervalRef = useRef(null);
  const previousPricesRef = useRef({}); // For computing change %

  // Keep refs in sync
  useEffect(() => {
    symbolsRef.current = new Set(symbols);
  }, [symbols]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // ── Market Hours Check ────────────────────────────────────────────────────
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
      return true; // If timezone check fails, assume open
    }
  }, []);

  // ── Process incoming trade ────────────────────────────────────────────────
  const processTrade = useCallback((symbol, price, timestamp, volume = 0) => {
    const now = Date.now();
    const lastThrottle = throttleRefs.current[symbol] || 0;
    if (now - lastThrottle < throttleMs) return;
    throttleRefs.current[symbol] = now;

    const prev = previousPricesRef.current[symbol];
    const change = prev ? ((price - prev.price) / prev.price) * 100 : 0;

    const tickData = { price, timestamp: new Date(timestamp), volume, change };
    previousPricesRef.current[symbol] = tickData;

    if (mountedRef.current) {
      setPrices((prev) => ({
        ...prev,
        [symbol]: tickData,
      }));
      setLastUpdate(new Date());
    }

    if (onPriceUpdate) {
      onPriceUpdate({ symbol, ...tickData });
    }
  }, [throttleMs, onPriceUpdate]);

  // ── WebSocket connection ─────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return; // Already connected
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return; // Connecting

    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) {
      console.warn("[useFinnhubPrice] No FINNHUB_API_KEY — falling back to polling");
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
        console.log("[useFinnhubPrice] WebSocket connected");
        setConnected(true);
        setConnectionMode("websocket");
        reconnectAttemptsRef.current = 0;

        // Subscribe to all current symbols
        for (const sym of symbolsRef.current) {
          ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || !enabledRef.current) return;

        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const trade of msg.data) {
              const sym = trade.s;
              if (!symbolsRef.current.has(sym)) continue;
              processTrade(sym, trade.p, trade.t * 1000, trade.v);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        console.error("[useFinnhubPrice] WebSocket error");
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log("[useFinnhubPrice] WebSocket closed:", event.code);
        setConnected(false);
        wsRef.current = null;

        if (enabledRef.current && event.code !== 1000) {
          scheduleReconnect();
        } else {
          setConnectionMode("disconnected");
        }
      };
    } catch (err) {
      console.error("[useFinnhubPrice] WebSocket creation failed:", err);
      if (mountedRef.current) {
        setConnected(false);
        startPolling();
      }
    }
  }, [processTrade]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    setConnectionMode("polling");

    const poll = async () => {
      if (!mountedRef.current || !enabledRef.current) return;

      for (const sym of symbolsRef.current) {
        try {
          const res = await fetch(
            `/api/stream/latest-price?symbol=${encodeURIComponent(sym)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.price) {
              processTrade(sym, data.price, data.timestamp || Date.now(), 0);
            }
          }
        } catch {
          // Silently ignore per-symbol polling errors
        }
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [processTrade]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ── Reconnection ─────────────────────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;

    if (!isMarketOpen()) {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (enabledRef.current && mountedRef.current) {
          if (isMarketOpen()) connectWebSocket();
          else scheduleReconnect();
        }
      }, 30000);
      return;
    }

    const attempts = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (enabledRef.current && mountedRef.current) {
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

  // ── Subscribe / Unsubscribe (dynamic) ────────────────────────────────────
  const subscribe = useCallback((symbol) => {
    symbolsRef.current.add(symbol);
    // If WS is connected, send subscribe message
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "subscribe", symbol }));
      } catch { /* ignore */ }
    }
  }, []);

  const unsubscribe = useCallback((symbol) => {
    symbolsRef.current.delete(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol }));
      } catch { /* ignore */ }
    }
    // Clear price data for unsubscribed symbol
    if (mountedRef.current) {
      setPrices((prev) => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
    }
  }, []);

  // ── Main effect: connect/disconnect based on enabled state ───────────────
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && symbols.length > 0) {
      if (!isMarketOpen()) {
        startPolling();
      } else {
        connectWebSocket();
      }
    }

    return () => {
      mountedRef.current = false;
      // Cleanup: unsubscribe all and close
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            for (const sym of symbolsRef.current) {
              wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: sym }));
            }
          }
        } catch { /* ignore */ }
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
      stopPolling();
      cancelReconnect();
      setConnected(false);
      setConnectionMode("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── Re-subscribe when symbols list changes while connected ───────────────
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Subscribe to any new symbols
    for (const sym of symbols) {
      try {
        ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
      } catch { /* ignore */ }
    }
  }, [symbols]);

  // ── Visibility API ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, "Tab hidden");
          wsRef.current = null;
        }
        stopPolling();
        setConnected(false);
      } else {
        if (enabledRef.current && symbolsRef.current.size > 0) {
          if (isMarketOpen()) {
            connectWebSocket();
          } else {
            startPolling();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connectWebSocket, isMarketOpen, startPolling, stopPolling]);

  return {
    connected,
    prices,
    connectionMode,
    subscribe,
    unsubscribe,
    lastUpdate,
  };
}
