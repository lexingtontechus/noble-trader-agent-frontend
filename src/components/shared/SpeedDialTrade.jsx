"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRole } from "@/hooks/useRole";
import OrderModal from "@/components/orders/OrderModal";
import { getAssetClass } from "@/lib/symbol-utils";

/**
 * SpeedDialTrade — Floating Action Button for quick buy/sell from anywhere.
 *
 * UX Flow:
 *   1. FAB pulse in bottom-right corner (above mobile nav)
 *   2. Tap → expands to show Buy/Sell buttons + symbol search
 *   3. Search autocompletes from watchlist + popular tickers
 *   4. Select a symbol + side → opens the existing OrderModal
 *
 * Only visible for authenticated users with trader+ role.
 * Position: fixed bottom-right, above mobile bottom nav on small screens.
 */

const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY",
  "QQQ", "DIA", "IWM", "GLD", "BTC-USD", "ETH-USD",
];

const RECENT_KEY = "noble-trader-recent-trades";

function getRecentTrades() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecentTrade(symbol) {
  const recent = getRecentTrades().filter(s => s !== symbol);
  recent.unshift(symbol);
  if (recent.length > 5) recent.length = 5;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* ignore */ }
  return recent;
}

export default function SpeedDialTrade() {
  const { isTrader, isAdmin } = useRole();
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSide, setSelectedSide] = useState(null); // null | "buy" | "sell"
  const [orderModalSymbol, setOrderModalSymbol] = useState(null);
  const [orderModalSide, setOrderModalSide] = useState("buy");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Build symbol source from recent trades + popular tickers (no PriceFeedContext dependency)
  // This ensures the FAB works on every page, not just the Prices page
  const recentTrades = useMemo(() => getRecentTrades(), [expanded]);

  const allSymbols = useMemo(() => {
    const set = new Set();
    // Recent trades first (highest priority)
    for (const s of recentTrades) set.add(s);
    // Then popular
    for (const s of POPULAR_SYMBOLS) set.add(s);
    return [...set];
  }, [recentTrades]);

  // Filtered results based on search
  const filteredSymbols = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return allSymbols.slice(0, 8); // Show top 8 when no query
    return allSymbols
      .filter(s => s.toUpperCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, allSymbols]);

  // Auto-focus search when expanded
  useEffect(() => {
    if (expanded && searchInputRef.current) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
        setSearchQuery("");
        setSelectedSide(null);
      }
    };
    // Delay listener to avoid the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("touchstart", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setExpanded(false);
        setSearchQuery("");
        setSelectedSide(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [expanded]);

  // Listen for Quick Trade keyboard shortcut (T/B/S keys)
  useEffect(() => {
    const handleQuickTrade = (e) => {
      const side = e.detail?.side || null; // "buy" | "sell" | null
      if (expanded && !side) {
        // Toggle closed
        setExpanded(false);
        setSearchQuery("");
        setSelectedSide(null);
      } else {
        // Open with optional side pre-selected
        setExpanded(true);
        if (side) setSelectedSide(side);
      }
    };
    window.addEventListener("noble:quick-trade", handleQuickTrade);
    return () => window.removeEventListener("noble:quick-trade", handleQuickTrade);
  }, [expanded]);

  // Handle symbol selection
  const handleSymbolSelect = useCallback((symbol) => {
    const side = selectedSide || "buy";
    setOrderModalSide(side);
    setOrderModalSymbol(symbol);
    saveRecentTrade(symbol);
    setExpanded(false);
    setSearchQuery("");
    setSelectedSide(null);
  }, [selectedSide]);

  // Handle Enter key in search
  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === "Enter" && filteredSymbols.length > 0) {
      e.preventDefault();
      handleSymbolSelect(filteredSymbols[0]);
    }
  }, [filteredSymbols, handleSymbolSelect]);

  // Don't render for non-traders
  if (!isTrader && !isAdmin) return null;

  return (
    <>
      {/* Floating Action Button container */}
      <div
        ref={containerRef}
        className="fixed z-40"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
          right: "1rem",
        }}
      >
        {/* Expanded panel */}
        {expanded && (
          <div className="mb-3 w-72 card bg-base-100 border border-base-300 shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-base-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">
                  Quick Trade
                </span>
                <button
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={() => { setExpanded(false); setSearchQuery(""); setSelectedSide(null); }}
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Side selector — Buy/Sell toggle */}
              <div className="flex gap-1.5 mb-2">
                <button
                  className={`btn btn-sm flex-1 gap-1 ${
                    selectedSide === "buy" ? "btn-success" : "btn-ghost border border-base-300"
                  }`}
                  onClick={() => setSelectedSide(selectedSide === "buy" ? null : "buy")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  Buy
                </button>
                <button
                  className={`btn btn-sm flex-1 gap-1 ${
                    selectedSide === "sell" ? "btn-error" : "btn-ghost border border-base-300"
                  }`}
                  onClick={() => setSelectedSide(selectedSide === "sell" ? null : "sell")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Sell
                </button>
              </div>

              {/* Symbol search input */}
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="input input-bordered input-sm w-full pl-8"
                  placeholder="Search symbol... (e.g. AAPL)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
            </div>

            {/* Symbol results list */}
            <div className="max-h-64 overflow-y-auto scrollbar-none">
              {filteredSymbols.length > 0 ? (
                <div className="py-1">
                  {filteredSymbols.map((symbol) => {
                    const assetClass = getAssetClass(symbol);
                    const isRecent = recentTrades.includes(symbol);

                    return (
                      <button
                        key={symbol}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-base-200/60 transition-colors text-left"
                        onClick={() => handleSymbolSelect(symbol)}
                      >
                        <span className="font-mono font-bold text-sm flex-1">{symbol}</span>
                        <div className="flex items-center gap-1">
                          {isRecent && (
                            <span className="badge badge-xs badge-ghost">Recent</span>
                          )}
                          {assetClass === "crypto" && (
                            <span className="badge badge-xs badge-primary">₿</span>
                          )}
                          {assetClass === "forex" && (
                            <span className="badge badge-xs badge-secondary">💱</span>
                          )}
                          {assetClass === "futures" && (
                            <span className="badge badge-xs badge-accent">📈</span>
                          )}
                          {/* Quick action indicator */}
                          {selectedSide && (
                            <span className={`text-[10px] font-bold ${
                              selectedSide === "buy" ? "text-success" : "text-error"
                            }`}>
                              {selectedSide === "buy" ? "BUY" : "SELL"}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-base-content/30">
                  No symbols found
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-base-300 text-[9px] text-base-content/25 text-center">
              {selectedSide
                ? `Click a symbol to ${selectedSide === "buy" ? "buy" : "sell"} →`
                : "Select Buy/Sell, then pick a symbol"
              }
            </div>
          </div>
        )}

        {/* Main FAB button */}
        <button
          className={`btn btn-circle shadow-xl transition-all duration-200 ${
            expanded
              ? "bg-base-300 hover:bg-base-200 border-base-300"
              : "btn-primary hover:btn-primary/90"
          } ${!expanded ? "animate-subtle-pulse" : ""}`}
          onClick={() => {
            setExpanded(!expanded);
            if (expanded) {
              setSearchQuery("");
              setSelectedSide(null);
            }
          }}
          aria-label={expanded ? "Close trade panel" : "Quick trade"}
          title="Quick Trade (T)"
          style={{ width: 52, height: 52 }}
        >
          {expanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          )}
        </button>
      </div>

      {/* Order Modal */}
      {orderModalSymbol && (
        <OrderModal
          symbol={orderModalSymbol}
          onClose={() => setOrderModalSymbol(null)}
          onSuccess={() => setOrderModalSymbol(null)}
          defaultSide={orderModalSide}
        />
      )}

    </>
  );
}
