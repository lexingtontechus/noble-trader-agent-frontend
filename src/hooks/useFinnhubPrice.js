"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { yahooToFinnhubSymbol, getAssetClass } from "@/lib/symbol-utils";

/**
 * useFinnhubPrice — Generic real-time price hook using Finnhub WebSocket.
 *
 * Extracted from useRenkoStream — this is the reusable version that
 * provides raw price data without the Renko pipeline coupling.
 *
 * Features:
 *   - Finnhub WebSocket for sub-second price updates
 *   - Multi-symbol subscriptions on a single shared connection
 *   - Symbol format conversion: Yahoo → Finnhub for WS, reverse-map on trade
 *   - Unsupported symbols (futures, indices) skip WS, use polling fallback
 *   - Automatic reconnection with exponential backoff
 *   - Market hours awareness (auto-pause outside 9:30-16:00 ET)
 *   - Polling fallback when no API key or WS fails
 *   - Visibility API: pause when tab is hidden
 *   - Configurable throttle (default 1 tick/sec per symbol)
 *   - Price history per symbol (last 50 ticks for sparklines)
 *   - Tick counter and connection stats (messages/sec, uptime)
 *
 * @param {string[]} symbols - Array of ticker symbols in Yahoo Finance format
 * @param {object} options
 * @param {boolean} [options.enabled=true] - Whether the feed is active
 * @param {number} [options.throttleMs=1000] - Min ms between ticks per symbol
 * @param {function} [options.onPriceUpdate] - Callback({ symbol, price, timestamp, volume })
 * @param {function} [options.onError] - Callback on error
 * @param {number} [options.maxHistory=50] - Max price history points per symbol
 * @returns {{
 *   connected: boolean,
 *   prices: Record<string, { price: number, timestamp: Date, volume: number, change: number }>,
 *   priceHistory: Record<string, Array<{ price: number, timestamp: Date }>>,
 *   connectionMode: "websocket" | "polling" | "disconnected",
 *   subscribe: (symbol: string) => void,
 *   unsubscribe: (symbol: string) => void,
 *   lastUpdate: Date | null,
 *   tickCount: number,
 *   ticksPerSecond: number,
 *   connectedSince: Date | null,
 *   reconnectAttempt: number,
 * }}
 */
export default function useFinnhubPrice(symbols = [], options = {}) {
  const {
    enabled = true,
    throttleMs = 1000,
    onPriceUpdate,
    onError,
    maxHistory = 50,
  } = options;

  // ── State ─────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState("disconnected"); // "websocket" | "polling" | "disconnected"
  const [prices, setPrices] = useState({}); // { [symbol]: { price, timestamp, volume, change } }
  const [priceHistory, setPriceHistory] = useState({}); // { [symbol]: [{ price, timestamp }] }
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tickCount, setTickCount] = useState(0);
  const [ticksPerSecond, setTicksPerSecond] = useState(0);
  const [connectedSince, setConnectedSince] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

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
  const tickCountRef = useRef(0);
  const tickTimestampsRef = useRef([]); // For computing ticks/sec
  const ticksPerSecondTimerRef = useRef(null);

  // Reverse map: Finnhub symbol → Yahoo symbol
  const finnhubToYahooRef = useRef(new Map());

  // Keep refs in sync
  useEffect(() => {
    symbolsRef.current = new Set(symbols);

    const reverseMap = new Map();
    for (const yahooSym of symbols) {
      const finnhubSym = yahooToFinnhubSymbol(yahooSym);
      if (finnhubSym) {
        reverseMap.set(finnhubSym, yahooSym);
      }
    }
    finnhubToYahooRef.current = reverseMap;
  }, [symbols]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // ── Ticks per second calculator ───────────────────────────────────────────
  useEffect(() => {
    ticksPerSecondTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const now = Date.now();
      // Keep only timestamps from the last 5 seconds
      tickTimestampsRef.current = tickTimestampsRef.current.filter(
        (ts) => now - ts < 5000
      );
      // Average over 5 seconds for smoother display
      const tps = tickTimestampsRef.current.length / 5;
      setTicksPerSecond(Math.round(tps * 10) / 10);
    }, 1000);

    return () => {
      if (ticksPerSecondTimerRef.current) {
        clearInterval(ticksPerSecondTimerRef.current);
      }
    };
  }, []);

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

  /**
   * Get market status label for the current time.
   * Returns: "pre-market" | "open" | "after-hours" | "closed"
   */
  const getMarketStatus = useCallback(() => {
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

      if (!isWeekday) return "closed";
      if (totalMinutes >= 570 && totalMinutes <= 960) return "open"; // 9:30–16:00
      if (totalMinutes >= 240 && totalMinutes < 570) return "pre-market"; // 4:00–9:30
      if (totalMinutes > 960 && totalMinutes <= 1200) return "after-hours"; // 16:00–20:00
      return "closed";
    } catch {
      return "open"; // Fallback
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
    const direction = prev ? (price > prev.price ? "up" : price < prev.price ? "down" : "neutral") : "neutral";

    const tickData = { price, timestamp: new Date(timestamp), volume, change, direction };
    previousPricesRef.current[symbol] = tickData;

    if (mountedRef.current) {
      setPrices((prev) => ({
        ...prev,
        [symbol]: tickData,
      }));

      // Update price history (for sparklines)
      setPriceHistory((prev) => {
        const history = prev[symbol] || [];
        const newEntry = { price, timestamp: new Date(timestamp) };
        const updated = [...history, newEntry].slice(-maxHistory);
        return { ...prev, [symbol]: updated };
      });

      setLastUpdate(new Date());

      // Track tick count and timestamps for ticks/sec
      tickCountRef.current += 1;
      setTickCount(tickCountRef.current);
      tickTimestampsRef.current.push(now);
    }

    if (onPriceUpdate) {
      onPriceUpdate({ symbol, ...tickData });
    }
  }, [throttleMs, onPriceUpdate, maxHistory]);

  // ── WebSocket connection ─────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

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
        setConnectedSince(new Date());
        reconnectAttemptsRef.current = 0;
        setReconnectAttempt(0);

        // Stop polling — WS is now active
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Subscribe to all current symbols (converted to Finnhub format)
        for (const yahooSym of symbolsRef.current) {
          const finnhubSym = yahooToFinnhubSymbol(yahooSym);
          if (finnhubSym) {
            ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
          }
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || !enabledRef.current) return;

        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const trade of msg.data) {
              const finnhubSym = trade.s;
              const yahooSym = finnhubToYahooRef.current.get(finnhubSym) || finnhubSym;
              if (!symbolsRef.current.has(yahooSym)) continue;
              processTrade(yahooSym, trade.p, trade.t * 1000, trade.v);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        console.error("[useFinnhubPrice] WebSocket error");
        if (onError) onError(new Error("WebSocket error"));
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log("[useFinnhubPrice] WebSocket closed:", event.code);
        setConnected(false);
        setConnectedSince(null);
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
        if (onError) onError(err);
        startPolling();
      }
    }
  }, [processTrade, onError]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    setConnectionMode("polling");
    setConnectedSince(new Date());

    const poll = async () => {
      if (!mountedRef.current || !enabledRef.current) return;

      // Try batch endpoint first (single request for all symbols)
      const symbols = [...symbolsRef.current];
      if (symbols.length > 0) {
        try {
          const batchRes = await fetch(
            `/api/stream/latest-price?symbols=${encodeURIComponent(symbols.join(","))}`
          );
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            if (batchData.prices && typeof batchData.prices === "object") {
              for (const [sym, info] of Object.entries(batchData.prices)) {
                if (info.price) {
                  processTrade(sym, info.price, info.timestamp || Date.now(), 0);
                }
              }
              return; // Batch succeeded, skip individual fetches
            }
          }
        } catch {
          // Batch failed — fall through to individual fetches
        }
      }

      // Fallback: individual fetches (staggered to avoid rate limits)
      for (const sym of symbols) {
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
          // Small delay between individual requests to avoid burst
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          // Silently ignore per-symbol polling errors
        }
      }
    };

    poll();
    // 10s interval: 10 symbols × 6 req/min = 60 req/min (within data tier limit)
    pollIntervalRef.current = setInterval(poll, 10_000);
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

    setReconnectAttempt(attempts + 1);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (enabledRef.current && mountedRef.current) {
        reconnectAttemptsRef.current += 1;
        setReconnectAttempt(reconnectAttemptsRef.current);
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
    setReconnectAttempt(0);
  }, []);

  // ── Subscribe / Unsubscribe (dynamic) ────────────────────────────────────
  const subscribe = useCallback((yahooSym) => {
    symbolsRef.current.add(yahooSym);

    const finnhubSym = yahooToFinnhubSymbol(yahooSym);
    if (finnhubSym) {
      finnhubToYahooRef.current.set(finnhubSym, yahooSym);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (finnhubSym) {
        try {
          wsRef.current.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
        } catch { /* ignore */ }
      }
    }
  }, []);

  const unsubscribe = useCallback((yahooSym) => {
    symbolsRef.current.delete(yahooSym);

    const finnhubSym = yahooToFinnhubSymbol(yahooSym);
    if (finnhubSym) {
      finnhubToYahooRef.current.delete(finnhubSym);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (finnhubSym) {
        try {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
        } catch { /* ignore */ }
      }
    }

    if (mountedRef.current) {
      setPrices((prev) => {
        const next = { ...prev };
        delete next[yahooSym];
        return next;
      });
      setPriceHistory((prev) => {
        const next = { ...prev };
        delete next[yahooSym];
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
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            for (const yahooSym of symbolsRef.current) {
              const finnhubSym = yahooToFinnhubSymbol(yahooSym);
              if (finnhubSym) {
                wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
              }
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

    for (const yahooSym of symbols) {
      const finnhubSym = yahooToFinnhubSymbol(yahooSym);
      if (finnhubSym) {
        try {
          ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
        } catch { /* ignore */ }
      }
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
    priceHistory,
    connectionMode,
    subscribe,
    unsubscribe,
    lastUpdate,
    tickCount,
    ticksPerSecond,
    connectedSince,
    reconnectAttempt,
    getMarketStatus,
  };
}
