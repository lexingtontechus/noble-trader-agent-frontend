"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";
import usePriceAlerts from "@/hooks/usePriceAlerts";

/**
 * WatchlistPanel — Searchable symbol watchlist with add/remove,
 * real-time prices, change %, flash animations, direction arrows,
 * and mini sparkline charts.
 *
 * Features:
 *   - Price flash animation (green/red) on each tick
 *   - Direction arrow (▲▼) with animation
 *   - Mini SVG sparkline per symbol (last 50 prices)
 *   - Debounced Yahoo Finance autocomplete search
 *   - Gainers/losers count badges
 *   - Mobile-optimized touch targets
 */
export default function WatchlistPanel() {
  const {
    watchlist,
    selectedSymbol,
    setSelectedSymbol,
    addToWatchlist,
    removeFromWatchlist,
    gainers,
    losers,
  } = usePriceFeed();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // ── Symbol search (debounced, uses Yahoo Finance autocomplete) ─────────
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/prices/search?q=${encodeURIComponent(searchQuery)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.quotes || []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleAddSymbol = (symbol, name) => {
    addToWatchlist(symbol, name);
    setSearchQuery("");
    setShowSearch(false);
    setSearchResults([]);
  };

  const isAlreadyAdded = (symbol) => watchlist.some((w) => w.symbol === symbol);

  // ── Alert counts per symbol ──────────────────────────────────────────────
  const { getAlertCount } = usePriceAlerts();
  const alertCounts = useMemo(() => {
    const counts = {};
    for (const item of watchlist) {
      counts[item.symbol] = getAlertCount(item.symbol);
    }
    return counts;
  }, [watchlist, getAlertCount]);

  // ── Stats summary ─────────────────────────────────────────────────────
  const gainersCount = gainers.length;
  const losersCount = losers.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">Watchlist</h3>
          <div className="flex gap-1">
            {gainersCount > 0 && (
              <span className="badge badge-xs badge-success">{gainersCount} up</span>
            )}
            {losersCount > 0 && (
              <span className="badge badge-xs badge-error">{losersCount} down</span>
            )}
          </div>
        </div>
        <button
          className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-xs"
          onClick={() => setShowSearch(!showSearch)}
        >
          {showSearch ? "✕" : "+ Add"}
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-base-300 space-y-2">
          <input
            type="text"
            placeholder="Search symbol..."
            className="input input-bordered input-xs w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchLoading && (
            <span className="loading loading-spinner loading-xs"></span>
          )}
          {searchResults.length > 0 && (
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.symbol}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-base-200 flex items-center justify-between text-xs min-h-[44px] sm:min-h-0"
                  onClick={() => handleAddSymbol(result.symbol, result.name)}
                  disabled={isAlreadyAdded(result.symbol)}
                >
                  <div>
                    <span className="font-bold">{result.symbol}</span>
                    <span className="text-base-content/50 ml-2">{result.name}</span>
                  </div>
                  {isAlreadyAdded(result.symbol) ? (
                    <span className="text-base-content/30">Added</span>
                  ) : (
                    <span className="text-primary">+ Add</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Symbol list */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.map((item) => (
          <WatchlistItem
            key={item.symbol}
            item={item}
            isSelected={selectedSymbol === item.symbol}
            onSelect={() => setSelectedSymbol(item.symbol)}
            onRemove={() => removeFromWatchlist(item.symbol)}
            alertCount={alertCounts[item.symbol] || 0}
          />
        ))}
      </div>

      {/* Footer: Remove button for selected symbol */}
      {selectedSymbol && (
        <div className="px-3 py-2 border-t border-base-300">
          <button
            className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-xs text-error w-full"
            onClick={() => removeFromWatchlist(selectedSymbol)}
          >
            Remove {selectedSymbol}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Individual Watchlist Item with flash + sparkline ──────────────────────

function WatchlistItem({ item, isSelected, onSelect, onRemove, alertCount = 0 }) {
  const [flashDirection, setFlashDirection] = useState(null); // "up" | "down" | null
  const prevPriceRef = useRef(null);

  // Detect price direction changes for flash animation
  useEffect(() => {
    if (item.price == null) return;
    if (prevPriceRef.current != null && item.price !== prevPriceRef.current) {
      const dir = item.price > prevPriceRef.current ? "up" : "down";
      setFlashDirection(dir);
      const timer = setTimeout(() => setFlashDirection(null), 600);
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = item.price;
  }, [item.price]);

  // Mini sparkline from price history
  const sparkline = useMemo(() => {
    const history = item.history;
    if (!history || history.length < 2) return null;
    return <MiniSparkline data={history.map((h) => h.price)} positive={item.change >= 0} />;
  }, [item.history, item.change]);

  return (
    <div
      className={`px-3 py-2 cursor-pointer border-b border-base-200 hover:bg-base-200/50 transition-colors ${
        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""
      } ${flashDirection === "up" ? "flash-green" : flashDirection === "down" ? "flash-red" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm truncate">{item.symbol}</span>
          {alertCount > 0 && (
            <span className="badge badge-primary badge-xs" title={`${alertCount} alert${alertCount > 1 ? 's' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
              </svg>
              {alertCount}
            </span>
          )}
          {item.name && (
            <span className="text-xs text-base-content/40 truncate hidden sm:inline">
              {item.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.price != null ? (
            <>
              {/* Direction arrow with animation */}
              <span
                className={`text-xs font-bold transition-all duration-200 ${
                  item.direction === "up"
                    ? "text-success arrow-up"
                    : item.direction === "down"
                      ? "text-error arrow-down"
                      : "text-base-content/20"
                }`}
              >
                {item.direction === "up" ? "▲" : item.direction === "down" ? "▼" : "•"}
              </span>
              <span className="font-mono text-sm price-value">
                ${formatPrice(item.price, item.symbol)}
              </span>
              <span
                className={`badge badge-xs font-mono ${
                  item.change > 0
                    ? "badge-success"
                    : item.change < 0
                      ? "badge-error"
                      : "badge-ghost"
                }`}
              >
                {item.change > 0 ? "+" : ""}
                {item.change.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-base-content/30">Loading...</span>
          )}
        </div>
      </div>

      {/* Sparkline + change bar + bid/ask */}
      {item.price != null && (
        <div className="mt-1 flex items-center gap-2">
          {/* Mini sparkline */}
          <div className="flex-1 h-4">
            {sparkline}
          </div>
          {/* Bid/Ask spread indicator (from Alpaca multi-feed) */}
          {item.spreadBps != null && (
            <span className="text-[9px] text-accent/60 font-mono" title={`Bid: ${item.bid} Ask: ${item.ask} Spread: ${item.spread}`}>
              {item.spreadBps}bps
            </span>
          )}
          {/* Change direction bar */}
          <div className="w-12 h-0.5 bg-base-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                item.change > 0 ? "bg-success" : item.change < 0 ? "bg-error" : "bg-base-content/20"
              }`}
              style={{
                width: `${Math.min(Math.abs(item.change) * 10, 100)}%`,
                marginLeft: item.change < 0 ? "auto" : 0,
                marginRight: item.change > 0 ? "auto" : 0,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mini SVG Sparkline ────────────────────────────────────────────────────

function MiniSparkline({ data, positive = true }) {
  if (!data || data.length < 2) return null;

  const width = 80;
  const height = 16;
  const padding = 1;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M${points.join(" L")}`;

  // Gradient fill area
  const fillD = `${pathD} L${padding + (width - padding * 2)},${height - padding} L${padding},${height - padding} Z`;

  const color = positive ? "#22c55e" : "#ef4444";
  const fillColor = positive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-4"
      preserveAspectRatio="none"
    >
      <path d={fillD} fill={fillColor} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      {/* Current price dot */}
      {data.length > 0 && (
        <circle
          cx={padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2)}
          cy={padding + (1 - (data[data.length - 1] - min) / range) * (height - padding * 2)}
          r="1.5"
          fill={color}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
