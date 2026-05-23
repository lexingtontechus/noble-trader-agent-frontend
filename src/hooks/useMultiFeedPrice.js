"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { yahooToFinnhubSymbol } from "@/lib/symbol-utils";

/**
 * useMultiFeedPrice — Aggregates price data from multiple sources.
 *
 * Sources (in priority order):
 *   1. Finnhub WebSocket — fastest, real-time trade prints (sub-second)
 *   2. Alpaca Market Data — bid/ask quotes, snapshots (5s poll)
 *   3. Yahoo Finance REST — historical OHLC, fallback when others fail (30s poll)
 *
 * Each price tick is tagged with its source for transparency.
 * Automatic failover: if WS drops, Alpaca/Yahoo pick up the slack.
 *
 * @param {string[]} symbols - Array of ticker symbols in Yahoo Finance format
 * @param {object} options
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.alpacaPollMs=5000] - Alpaca snapshot poll interval
 * @param {number} [options.yahooPollMs=30000] - Yahoo REST poll interval
 * @returns {{
 *   prices: Record<string, { price, bid, ask, spread, spreadBps, source, timestamp, volume, change, direction }>,
 *   sources: Record<string, { finnhub: boolean, alpaca: boolean, yahoo: boolean }>,
 *   connected: boolean,
 *   connectionMode: string,
 *   activeSource: Record<string, "finnhub"|"alpaca"|"yahoo"|"none">,
 *   tickCount: number,
 *   ticksPerSecond: number,
 * }}
 */
export default function useMultiFeedPrice(symbols = [], options = {}) {
  const {
    enabled = true,
    alpacaPollMs = 5000,
    yahooPollMs = 30000,
  } = options;

  // ── Unified price state ────────────────────────────────────────────────
  const [prices, setPrices] = useState({});
  const [sources, setSources] = useState({});
  const [activeSource, setActiveSource] = useState({});

  // ── Finnhub WS state ───────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState("disconnected");
  const wsRef = useRef(null);
  const throttleRefs = useRef({});
  const finnhubToYahooRef = useRef(new Map());
  const symbolsRef = useRef(new Set(symbols));
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const prevPricesRef = useRef({});

  // ── Stats ──────────────────────────────────────────────────────────────
  const [tickCount, setTickCount] = useState(0);
  const tickCountRef = useRef(0);
  const [ticksPerSecond, setTicksPerSecond] = useState(0);
  const tickTimestampsRef = useRef([]);
  const ticksPerSecondTimerRef = useRef(null);

  // Keep refs in sync
  useEffect(() => {
    symbolsRef.current = new Set(symbols);
    const reverseMap = new Map();
    for (const yahooSym of symbols) {
      const finnhubSym = yahooToFinnhubSymbol(yahooSym);
      if (finnhubSym) reverseMap.set(finnhubSym, yahooSym);
    }
    finnhubToYahooRef.current = reverseMap;
  }, [symbols]);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ── Ticks per second calculator ────────────────────────────────────────
  useEffect(() => {
    ticksPerSecondTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const now = Date.now();
      tickTimestampsRef.current = tickTimestampsRef.current.filter(t => now - t < 5000);
      setTicksPerSecond(Math.round((tickTimestampsRef.current.length / 5) * 10) / 10);
    }, 1000);
    return () => { if (ticksPerSecondTimerRef.current) clearInterval(ticksPerSecondTimerRef.current); };
  }, []);

  // ── Process Finnhub trade tick ─────────────────────────────────────────
  const processFinnhubTick = useCallback((yahooSym, price, timestamp, volume = 0) => {
    const now = Date.now();
    const lastThrottle = throttleRefs.current[yahooSym] || 0;
    if (now - lastThrottle < 500) return; // 500ms throttle per symbol
    throttleRefs.current[yahooSym] = now;

    const prev = prevPricesRef.current[yahooSym];
    const change = prev ? ((price - prev.price) / prev.price) * 100 : 0;
    const direction = prev ? (price > prev.price ? "up" : price < prev.price ? "down" : "neutral") : "neutral";

    prevPricesRef.current[yahooSym] = { price };

    if (mountedRef.current) {
      setPrices(prev => ({
        ...prev,
        [yahooSym]: {
          ...(prev[yahooSym] || {}),
          price,
          volume,
          change,
          direction,
          source: "finnhub",
          timestamp: new Date(timestamp),
          finnhubTime: new Date(timestamp),
        },
      }));

      setSources(prev => ({
        ...prev,
        [yahooSym]: { ...(prev[yahooSym] || {}), finnhub: true },
      }));

      setActiveSource(prev => ({ ...prev, [yahooSym]: "finnhub" }));

      tickCountRef.current += 1;
      setTickCount(tickCountRef.current);
      tickTimestampsRef.current.push(now);
    }
  }, []);

  // ── Finnhub WebSocket connection ───────────────────────────────────────
  const connectFinnhub = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) {
      setConnectionMode("polling");
      return;
    }

    try {
      const ws = new WebSocket(`wss://ws.finnhub.io/websocket?token=${apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setConnected(true);
        setConnectionMode("websocket");
        reconnectAttemptsRef.current = 0;
        for (const yahooSym of symbolsRef.current) {
          const finnhubSym = yahooToFinnhubSymbol(yahooSym);
          if (finnhubSym) ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || !enabledRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const trade of msg.data) {
              const yahooSym = finnhubToYahooRef.current.get(trade.s) || trade.s;
              if (!symbolsRef.current.has(yahooSym)) continue;
              processFinnhubTick(yahooSym, trade.p, trade.t * 1000, trade.v);
            }
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => { if (!mountedRef.current) return; };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        if (enabledRef.current && event.code !== 1000) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (enabledRef.current && mountedRef.current) connectFinnhub();
          }, delay);
        } else {
          setConnectionMode("disconnected");
        }
      };
    } catch {
      setConnectionMode("polling");
    }
  }, [processFinnhubTick]);

  // ── Alpaca snapshot polling (for bid/ask) ──────────────────────────────
  const alpacaPollRef = useRef(null);

  const pollAlpaca = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current) return;

    const symList = [...symbolsRef.current].filter(s => {
      // Only poll stocks/ETFs from Alpaca (not crypto, forex, futures)
      const upper = s.toUpperCase();
      return !upper.includes("-") && !upper.includes("=X") && !upper.includes("=F") && !upper.startsWith("^");
    });

    if (symList.length === 0) return;

    try {
      const res = await fetch(`/api/alpaca/market-data/snapshot?symbols=${encodeURIComponent(symList.join(","))}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.snapshots) {
        setPrices(prev => {
          const next = { ...prev };
          for (const [sym, snap] of Object.entries(data.snapshots)) {
            if (!symbolsRef.current.has(sym)) continue;
            const q = snap.quote || {};
            const dailyBar = snap.dailyBar || {};
            const prevBar = snap.prevDailyBar || {};
            const prevClose = prevBar.close || dailyBar.open;

            next[sym] = {
              ...(next[sym] || {}),
              // Don't overwrite Finnhub price (faster), but add bid/ask
              bid: q.bid,
              ask: q.ask,
              bidSize: q.bidSize,
              askSize: q.askSize,
              spread: q.bid && q.ask ? +(q.ask - q.bid).toFixed(4) : null,
              spreadBps: q.bid && q.ask && q.bid > 0 ? +((q.ask - q.bid) / q.bid * 10000).toFixed(1) : null,
              // If no Finnhub price yet, use Alpaca daily close as fallback
              ...(next[sym]?.source !== "finnhub" && dailyBar.close ? {
                price: dailyBar.close,
                source: "alpaca",
                timestamp: new Date(),
              } : {}),
              alpacaBar: dailyBar,
              alpacaTime: new Date(),
            };
          }
          return next;
        });

        setSources(prev => {
          const next = { ...prev };
          for (const sym of Object.keys(data.snapshots)) {
            if (!symbolsRef.current.has(sym)) continue;
            next[sym] = { ...(next[sym] || {}), alpaca: true };
          }
          return next;
        });
      }
    } catch {
      // Silently fail
    }
  }, []);

  // ── Yahoo REST polling (fallback) ──────────────────────────────────────
  const yahooPollRef = useRef(null);

  const pollYahoo = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current) return;

    const symList = [...symbolsRef.current];
    if (symList.length === 0) return;

    try {
      const res = await fetch(`/api/stream/latest-price?symbols=${encodeURIComponent(symList.join(","))}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.prices && typeof data.prices === "object") {
        setPrices(prev => {
          const next = { ...prev };
          for (const [sym, info] of Object.entries(data.prices)) {
            if (!symbolsRef.current.has(sym) || !info.price) continue;
            // Only use Yahoo if no faster source has provided data recently
            const existing = next[sym];
            const existingAge = existing?.timestamp ? (Date.now() - existing.timestamp.getTime()) : Infinity;

            if (existingAge > 15000 || !existing) {
              const price = info.price;
              const prev = prevPricesRef.current[sym];
              const change = prev ? ((price - prev.price) / prev.price) * 100 : 0;

              next[sym] = {
                ...(next[sym] || {}),
                price,
                change,
                source: existing?.source === "finnhub" ? "finnhub" : existing?.source === "alpaca" ? "alpaca" : "yahoo",
                timestamp: new Date(info.timestamp || Date.now()),
                yahooTime: new Date(),
              };
            }
          }
          return next;
        });

        setSources(prev => {
          const next = { ...prev };
          for (const sym of Object.keys(data.prices)) {
            if (!symbolsRef.current.has(sym)) continue;
            next[sym] = { ...(next[sym] || {}), yahoo: true };
          }
          return next;
        });
      }
    } catch {
      // Silently fail
    }
  }, []);

  // ── Main effect: start all feeds ───────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && symbols.length > 0) {
      // Start Finnhub WS (primary)
      connectFinnhub();

      // Start Alpaca polling (for bid/ask)
      pollAlpaca();
      alpacaPollRef.current = setInterval(pollAlpaca, alpacaPollMs);

      // Start Yahoo polling (fallback)
      pollYahoo();
      yahooPollRef.current = setInterval(pollYahoo, yahooPollMs);
    }

    return () => {
      mountedRef.current = false;

      // Cleanup WS
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            for (const yahooSym of symbolsRef.current) {
              const finnhubSym = yahooToFinnhubSymbol(yahooSym);
              if (finnhubSym) wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
            }
          }
        } catch { /* ignore */ }
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }

      // Cleanup timers
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (alpacaPollRef.current) { clearInterval(alpacaPollRef.current); alpacaPollRef.current = null; }
      if (yahooPollRef.current) { clearInterval(yahooPollRef.current); yahooPollRef.current = null; }

      setConnected(false);
      setConnectionMode("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Re-subscribe when symbols change while connected
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const yahooSym of symbols) {
      const finnhubSym = yahooToFinnhubSymbol(yahooSym);
      if (finnhubSym) {
        try { ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym })); } catch { /* ignore */ }
      }
    }
  }, [symbols]);

  // ── Visibility API ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, "Tab hidden");
          wsRef.current = null;
        }
        setConnected(false);
      } else {
        if (enabledRef.current && symbolsRef.current.size > 0) {
          connectFinnhub();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connectFinnhub]);

  return useMemo(() => ({
    prices,
    sources,
    connected,
    connectionMode,
    activeSource,
    tickCount,
    ticksPerSecond,
  }), [prices, sources, connected, connectionMode, activeSource, tickCount, ticksPerSecond]);
}
