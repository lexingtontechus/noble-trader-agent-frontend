"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";
import usePriceAlerts from "@/hooks/usePriceAlerts";

/**
 * WatchlistPanel — Searchable symbol watchlist with add/remove,
 * real-time prices, change %, flash animations, direction arrows,
 * mini sparkline charts, import/export, and server sync.
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
  const [showMenu, setShowMenu] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "synced" | "error"
  const searchTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

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

  // ── Close menu on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  // ── Export watchlist as JSON ────────────────────────────────────────────
  const handleExportJSON = () => {
    const data = watchlist.map((w) => ({ symbol: w.symbol, name: w.name }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noble-trader-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  // ── Export watchlist as CSV ─────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = "symbol,name";
    const rows = watchlist.map((w) => `"${w.symbol}","${w.name || ""}"`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noble-trader-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  // ── Import watchlist from JSON/CSV file ─────────────────────────────────
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        let items = [];

        if (file.name.endsWith(".csv")) {
          // Parse CSV: header row + data rows
          const lines = content
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          // Skip header
          for (let i = 1; i < lines.length; i++) {
            const match = lines[i].match(/^"([^"]+)","([^"]*)"$/);
            if (match) {
              items.push({ symbol: match[1], name: match[2] || match[1] });
            } else {
              // Fallback: split by comma
              const parts = lines[i].split(",");
              if (parts[0]) {
                items.push({
                  symbol: parts[0].replace(/"/g, "").trim(),
                  name: (parts[1] || parts[0]).replace(/"/g, "").trim(),
                });
              }
            }
          }
        } else {
          // Parse JSON
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            items = parsed
              .filter(
                (item) =>
                  item &&
                  typeof item.symbol === "string" &&
                  item.symbol.trim()
              )
              .map((item) => ({
                symbol: item.symbol.trim().toUpperCase(),
                name: (item.name || item.symbol).trim(),
              }));
          }
        }

        // Add all items (duplicates are handled by addToWatchlist)
        let added = 0;
        for (const item of items.slice(0, 100)) {
          if (!isAlreadyAdded(item.symbol)) {
            addToWatchlist(item.symbol, item.name);
            added++;
          }
        }

        setShowMenu(false);
      } catch (err) {
        console.error("[WatchlistPanel] Import failed:", err.message);
      }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be re-imported
    e.target.value = "";
  };

  // ── Server sync: Save to Clerk metadata ─────────────────────────────────
  const handleSyncToServer = async () => {
    setSyncStatus("syncing");
    try {
      const data = watchlist.map((w) => ({ symbol: w.symbol, name: w.name }));
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: data }),
      });
      if (res.ok) {
        setSyncStatus("synced");
        setTimeout(() => setSyncStatus(null), 2000);
      } else {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(null), 3000);
    }
    setShowMenu(false);
  };

  // ── Server sync: Load from Clerk metadata ───────────────────────────────
  const handleLoadFromServer = async () => {
    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.watchlist) && data.watchlist.length > 0) {
          // Merge: add server items that aren't already local
          let added = 0;
          for (const item of data.watchlist) {
            if (!isAlreadyAdded(item.symbol)) {
              addToWatchlist(item.symbol, item.name);
              added++;
            }
          }
          setSyncStatus("synced");
        } else {
          setSyncStatus("synced");
        }
        setTimeout(() => setSyncStatus(null), 2000);
      } else {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(null), 3000);
    }
    setShowMenu(false);
  };

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
          {/* Sync status indicator */}
          {syncStatus && (
            <span
              className={`badge badge-xs ${
                syncStatus === "syncing"
                  ? "badge-info loading loading-spinner"
                  : syncStatus === "synced"
                    ? "badge-success"
                    : "badge-error"
              }`}
            >
              {syncStatus === "syncing"
                ? "Syncing"
                : syncStatus === "synced"
                  ? "Synced"
                  : "Error"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Menu button for import/export/sync */}
          <div className="relative" ref={menuRef}>
            <button
              className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-xs btn-square"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Watchlist options"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01"
                />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="py-1">
                  <button
                    className="w-full text-left px-3 py-2 text-xs hover:bg-base-200/60 flex items-center gap-2"
                    onClick={handleExportJSON}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export as JSON
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-xs hover:bg-base-200/60 flex items-center gap-2"
                    onClick={handleExportCSV}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export as CSV
                  </button>
                  <div className="border-t border-base-300 my-1" />
                  <button
                    className="w-full text-left px-3 py-2 text-xs hover:bg-base-200/60 flex items-center gap-2"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Import JSON / CSV
                  </button>
                  <div className="border-t border-base-300 my-1" />
                  <button
                    className="w-full text-left px-3 py-2 text-xs hover:bg-base-200/60 flex items-center gap-2"
                    onClick={handleSyncToServer}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M5 12l2 2m0 0l2-2m-2 2V9" /></svg>
                    Sync to Cloud
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-xs hover:bg-base-200/60 flex items-center gap-2"
                    onClick={handleLoadFromServer}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
                    Load from Cloud
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add symbol button */}
          <button
            className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-xs"
            onClick={() => setShowSearch(!showSearch)}
          >
            {showSearch ? "✕" : "+ Add"}
          </button>
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv"
          className="hidden"
          onChange={handleImportFile}
        />
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
  const [flashDirection, setFlashDirection] = useState(null);
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
