"use client";

import { useState, useRef, useEffect } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * WatchlistPanel — Searchable symbol watchlist with add/remove,
 * real-time prices, change %, and sparkline indicators.
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
        // Use BFF proxy to avoid CORS issues with Yahoo Finance
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
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-base-200 flex items-center justify-between text-xs"
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
          <div
            key={item.symbol}
            className={`px-3 py-2 cursor-pointer border-b border-base-200 hover:bg-base-200/50 transition-colors ${
              selectedSymbol === item.symbol ? "bg-primary/10 border-l-2 border-l-primary" : ""
            }`}
            onClick={() => setSelectedSymbol(item.symbol)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm truncate">{item.symbol}</span>
                {item.name && (
                  <span className="text-xs text-base-content/40 truncate hidden sm:inline">
                    {item.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.price != null ? (
                  <>
                    <span className="font-mono text-sm">
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
            {/* Mini sparkline: just a colored bar showing direction */}
            {item.price != null && (
              <div className="mt-1 h-0.5 bg-base-200 rounded-full overflow-hidden">
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
            )}
          </div>
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

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
