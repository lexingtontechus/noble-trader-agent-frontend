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

  // ── Chart State ───────────────────────────────────────────────────────────
  const [chartPeriod, setChartPeriod] = useState("6mo");

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
        connected: !!prices[w.symbol],
        history: priceHistory[w.symbol] || [],
      })),
    [watchlist, prices, priceHistory],
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

  const value = useMemo(
    () => ({
      // Watchlist
      watchlist: watchlistWithPrices,
      selectedSymbol,
      setSelectedSymbol,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,

      // Real-time prices
      prices,
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
      prices,
      priceHistory,
      connected,
      connectionMode,
      lastUpdate,
      subscribe,
      unsubscribe,
      chartPeriod,
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
