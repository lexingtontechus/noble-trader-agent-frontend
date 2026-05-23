"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import useFinnhubPrice from "@/hooks/useFinnhubPrice";
import { yahooToFinnhubSymbol } from "@/lib/symbol-utils";

const PriceFeedContext = createContext(null);

// ── Alpaca bid/ask enrichment ──────────────────────────────────────────────
// Polls the Alpaca Market Data snapshot endpoint every 5s to get bid/ask
// for all stock/ETF symbols on the watchlist. Merges into the unified
// prices object so every component gets bid/ask for free.

const ALPACA_POLL_MS = 5000;
const ALPACA_STORAGE_KEY = "noble-trader-alpaca-keys-configured";

function useAlpacaBidAsk(symbols) {
  const [bidAskData, setBidAskData] = useState({}); // { [symbol]: { bid, ask, spread, spreadBps, timestamp } }
  const [alpacaAvailable, setAlpacaAvailable] = useState(false);
  const [alpacaChecked, setAlpacaChecked] = useState(false);

  // Check if Alpaca keys are configured (only once)
  useEffect(() => {
    let cancelled = false;
    async function checkKeys() {
      try {
        const res = await fetch("/api/clerk/alpaca-keys");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAlpacaAvailable(!!data.configured);
        }
      } catch { /* ignore */ }
      if (!cancelled) setAlpacaChecked(true);
    }
    checkKeys();
  }, []);

  // Poll Alpaca snapshots for bid/ask (only if keys are configured)
  useEffect(() => {
    if (!alpacaAvailable || !alpacaChecked) return;

    // Filter to only stock/ETF symbols (Alpaca doesn't support crypto/forex/futures)
    const stockSymbols = symbols.filter(s => {
      const upper = s.toUpperCase();
      return !upper.includes("-") && !upper.includes("=X") && !upper.includes("=F") && !upper.startsWith("^");
    });

    if (stockSymbols.length === 0) return;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/alpaca/market-data/snapshot?symbols=${encodeURIComponent(stockSymbols.join(","))}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.snapshots && !cancelled) {
          setBidAskData(prev => {
            const next = { ...prev };
            for (const [sym, snap] of Object.entries(data.snapshots)) {
              const q = snap.quote || {};
              if (q.bid != null && q.ask != null) {
                next[sym] = {
                  bid: q.bid,
                  ask: q.ask,
                  bidSize: q.bidSize,
                  askSize: q.askSize,
                  spread: +(q.ask - q.bid).toFixed(4),
                  spreadBps: q.bid > 0 ? +((q.ask - q.bid) / q.bid * 10000).toFixed(1) : null,
                  timestamp: new Date(),
                  source: "alpaca",
                };
              }
            }
            return next;
          });
        }
      } catch { /* ignore */ }
    }

    poll();
    const interval = setInterval(poll, ALPACA_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbols, alpacaAvailable, alpacaChecked]);

  return bidAskData;
}

// Default watchlist — can be overridden by localStorage
const DEFAULT_WATCHLIST = [
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF" },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "GC=F", name: "Gold Futures" },
];

const STORAGE_KEY = "noble-trader-watchlist";
const CHART_MODE_KEY = "noble-trader-chart-mode";

function loadWatchlist() {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_WATCHLIST;
}

function saveWatchlist(watchlist) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
  } catch { /* ignore */ }
}

export function usePriceFeed() {
  const ctx = useContext(PriceFeedContext);
  if (!ctx) throw new Error("usePriceFeed must be used within PriceFeedProvider");
  return ctx;
}

export function PriceFeedProvider({ children }) {
  // ── Watchlist State ───────────────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");

  // Load watchlist from localStorage on mount
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  // Save watchlist to localStorage when it changes
  useEffect(() => {
    saveWatchlist(watchlist);
  }, [watchlist]);

  const addToWatchlist = useCallback((symbol, name = "") => {
    setWatchlist((prev) => {
      if (prev.some((w) => w.symbol === symbol)) return prev;
      return [...prev, { symbol, name: name || symbol }];
    });
  }, []);

  const removeFromWatchlist = useCallback((symbol) => {
    setWatchlist((prev) => prev.filter((w) => w.symbol !== symbol));
  }, []);

  const reorderWatchlist = useCallback((fromIndex, toIndex) => {
    setWatchlist((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // ── Finnhub WebSocket ─────────────────────────────────────────────────────
  const watchlistSymbols = useMemo(
    () => watchlist.map((w) => w.symbol),
    [watchlist],
  );

  const {
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
  } = useFinnhubPrice(watchlistSymbols, { enabled: true, throttleMs: 500 });

  // ── Alpaca Bid/Ask Enrichment ──────────────────────────────────────────────
  const alpacaBidAsk = useAlpacaBidAsk(watchlistSymbols);

  // ── Chart State ───────────────────────────────────────────────────────────
  const [chartPeriod, setChartPeriod] = useState("6mo");
  const [chartMode, setChartMode] = useState("advanced"); // "live" | "advanced" | "heatmap" | "calendar"

  // Load chart mode from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHART_MODE_KEY);
      if (["live", "advanced", "heatmap", "calendar", "flow"].includes(saved)) setChartMode(saved);
    } catch { /* ignore */ }
  }, []);

  // Save chart mode to localStorage when it changes
  const changeChartMode = useCallback((mode) => {
    setChartMode(mode);
    try { localStorage.setItem(CHART_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);

  // ── Compare Symbols (chart overlay) ────────────────────────────────────────
  const [compareSymbols, setCompareSymbols] = useState([]);

  const addCompareSymbol = useCallback((symbol) => {
    setCompareSymbols((prev) => {
      if (prev.includes(symbol) || symbol === selectedSymbol) return prev;
      return [...prev, symbol];
    });
  }, [selectedSymbol]);

  const removeCompareSymbol = useCallback((symbol) => {
    setCompareSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const clearCompareSymbols = useCallback(() => {
    setCompareSymbols([]);
  }, []);

  // Reset compare when selected symbol changes
  useEffect(() => {
    setCompareSymbols([]);
  }, [selectedSymbol]);

  // ── Market Status ─────────────────────────────────────────────────────────
  const [marketStatus, setMarketStatus] = useState("closed");

  useEffect(() => {
    const update = () => setMarketStatus(getMarketStatus());
    update();
    const timer = setInterval(update, 30000); // Update every 30s
    return () => clearInterval(timer);
  }, [getMarketStatus]);

  // ── Computed Values ───────────────────────────────────────────────────────
  const watchlistWithPrices = useMemo(
    () =>
      watchlist.map((w) => ({
        ...w,
        ...prices[w.symbol],
        // Merge Alpaca bid/ask into each symbol's price data
        ...(alpacaBidAsk[w.symbol] || {}),
        connected: !!prices[w.symbol],
        history: priceHistory[w.symbol] || [],
      })),
    [watchlist, prices, priceHistory, alpacaBidAsk],
  );

  const gainers = useMemo(
    () =>
      [...watchlistWithPrices]
        .filter((w) => w.change > 0)
        .sort((a, b) => b.change - a.change),
    [watchlistWithPrices],
  );

  const losers = useMemo(
    () =>
      [...watchlistWithPrices]
        .filter((w) => w.change < 0)
        .sort((a, b) => a.change - b.change),
    [watchlistWithPrices],
  );

  // Merge Alpaca bid/ask into the prices object for all consumers
  const enrichedPrices = useMemo(() => {
    const result = { ...prices };
    for (const [sym, ba] of Object.entries(alpacaBidAsk)) {
      if (result[sym]) {
        result[sym] = { ...result[sym], ...ba };
      }
    }
    return result;
  }, [prices, alpacaBidAsk]);

  const value = useMemo(
    () => ({
      // Watchlist
      watchlist: watchlistWithPrices,
      selectedSymbol,
      setSelectedSymbol,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,

      // Real-time prices (enriched with Alpaca bid/ask)
      prices: enrichedPrices,
      priceHistory,
      connected,
      connectionMode,
      lastUpdate,

      // Dynamic sub/unsub
      subscribe,
      unsubscribe,

      // Chart config
      chartPeriod,
      setChartPeriod,
      chartMode,
      setChartMode: changeChartMode,

      // Compare symbols (overlay)
      compareSymbols,
      addCompareSymbol,
      removeCompareSymbol,
      clearCompareSymbols,

      // Sorted lists
      gainers,
      losers,

      // Connection stats
      tickCount,
      ticksPerSecond,
      connectedSince,
      reconnectAttempt,

      // Market status
      marketStatus,
    }),
    [
      watchlistWithPrices,
      selectedSymbol,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,
      enrichedPrices,
      priceHistory,
      connected,
      connectionMode,
      lastUpdate,
      subscribe,
      unsubscribe,
      chartPeriod,
      chartMode,
      compareSymbols,
      gainers,
      losers,
      tickCount,
      ticksPerSecond,
      connectedSince,
      reconnectAttempt,
      marketStatus,
    ],
  );

  return (
    <PriceFeedContext.Provider value={value}>
      {children}
    </PriceFeedContext.Provider>
  );
}
