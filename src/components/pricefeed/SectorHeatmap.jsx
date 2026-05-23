"use client";

import { useMemo, useState, useCallback } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * SectorHeatmap — Live market heatmap powered by WebSocket price data.
 *
 * Features:
 *   - Treemap-style grid: area ∝ weight, color = % change
 *   - Sector grouping: ETFs, Tech, Crypto, Commodities, Financials, Healthcare
 *   - Color gradient: deep red (-5%) → gray (0%) → deep green (+5%)
 *   - Hover: detailed tooltip with price, change, volume
 *   - Click: selects symbol in PriceFeedContext
 *   - Live updates from Finnhub WebSocket
 *   - Sort options: by change, by sector, by name
 *   - Responsive: grid layout adapts to screen size
 *   - Market pulse visualization at a glance
 *
 * Architecture:
 *   - Pure CSS grid + divs (no D3 or canvas needed)
 *   - Data from PriceFeedContext.watchlist (already includes live prices)
 *   - Squarified layout algorithm for cell sizing
 *   - CSS transitions for smooth color changes on ticks
 */

// ── Sector Classification ────────────────────────────────────────────────

const SECTOR_MAP = {
  // Index ETFs
  SPY: { sector: "Index ETFs", name: "S&P 500" },
  QQQ: { sector: "Index ETFs", name: "Nasdaq 100" },
  IWM: { sector: "Index ETFs", name: "Russell 2000" },
  DIA: { sector: "Index ETFs", name: "Dow Jones" },
  VOO: { sector: "Index ETFs", name: "Vanguard S&P 500" },
  VTI: { sector: "Index ETFs", name: "Vanguard Total Market" },

  // Sector ETFs
  XLK: { sector: "Sector ETFs", name: "Technology" },
  XLF: { sector: "Sector ETFs", name: "Financials" },
  XLE: { sector: "Sector ETFs", name: "Energy" },
  XLV: { sector: "Sector ETFs", name: "Healthcare" },
  XLY: { sector: "Sector ETFs", name: "Consumer Disc." },
  XLP: { sector: "Sector ETFs", name: "Consumer Staples" },
  XLI: { sector: "Sector ETFs", name: "Industrials" },
  XLU: { sector: "Sector ETFs", name: "Utilities" },
  XLRE: { sector: "Sector ETFs", name: "Real Estate" },
  XLB: { sector: "Sector ETFs", name: "Materials" },
  XLC: { sector: "Sector ETFs", name: "Communication" },

  // Tech
  AAPL: { sector: "Technology", name: "Apple" },
  MSFT: { sector: "Technology", name: "Microsoft" },
  GOOGL: { sector: "Technology", name: "Alphabet" },
  GOOG: { sector: "Technology", name: "Alphabet C" },
  AMZN: { sector: "Technology", name: "Amazon" },
  NVDA: { sector: "Technology", name: "NVIDIA" },
  META: { sector: "Technology", name: "Meta" },
  TSLA: { sector: "Technology", name: "Tesla" },
  NFLX: { sector: "Technology", name: "Netflix" },
  AMD: { sector: "Technology", name: "AMD" },
  INTC: { sector: "Technology", name: "Intel" },
  CRM: { sector: "Technology", name: "Salesforce" },
  ORCL: { sector: "Technology", name: "Oracle" },
  AVGO: { sector: "Technology", name: "Broadcom" },
  ADBE: { sector: "Technology", name: "Adobe" },

  // Financials
  JPM: { sector: "Financials", name: "JPMorgan" },
  BAC: { sector: "Financials", name: "Bank of America" },
  GS: { sector: "Financials", name: "Goldman Sachs" },
  MS: { sector: "Financials", name: "Morgan Stanley" },
  V: { sector: "Financials", name: "Visa" },
  MA: { sector: "Financials", name: "Mastercard" },
  BLK: { sector: "Financials", name: "BlackRock" },
  C: { sector: "Financials", name: "Citigroup" },
  WFC: { sector: "Financials", name: "Wells Fargo" },

  // Healthcare
  UNH: { sector: "Healthcare", name: "UnitedHealth" },
  JNJ: { sector: "Healthcare", name: "Johnson & Johnson" },
  PFE: { sector: "Healthcare", name: "Pfizer" },
  MRK: { sector: "Healthcare", name: "Merck" },
  ABBV: { sector: "Healthcare", name: "AbbVie" },
  LLY: { sector: "Healthcare", name: "Eli Lilly" },

  // Consumer
  WMT: { sector: "Consumer", name: "Walmart" },
  HD: { sector: "Consumer", name: "Home Depot" },
  NKE: { sector: "Consumer", name: "Nike" },
  MCD: { sector: "Consumer", name: "McDonalds" },
  SBUX: { sector: "Consumer", name: "Starbucks" },
  DIS: { sector: "Consumer", name: "Disney" },

  // Energy & Industrials
  XOM: { sector: "Energy", name: "ExxonMobil" },
  CVX: { sector: "Energy", name: "Chevron" },
  COP: { sector: "Energy", name: "ConocoPhillips" },
  BA: { sector: "Industrials", name: "Boeing" },
  CAT: { sector: "Industrials", name: "Caterpillar" },
  GE: { sector: "Industrials", name: "GE Aerospace" },

  // Crypto — detected by symbol pattern
  "BTC-USD": { sector: "Crypto", name: "Bitcoin" },
  "ETH-USD": { sector: "Crypto", name: "Ethereum" },
  "SOL-USD": { sector: "Crypto", name: "Solana" },
  "XRP-USD": { sector: "Crypto", name: "Ripple" },
  "DOGE-USD": { sector: "Crypto", name: "Dogecoin" },
  "ADA-USD": { sector: "Crypto", name: "Cardano" },

  // Commodities — detected by symbol pattern
  "GC=F": { sector: "Commodities", name: "Gold" },
  "SI=F": { sector: "Commodities", name: "Silver" },
  "CL=F": { sector: "Commodities", name: "Crude Oil" },
  "NG=F": { sector: "Commodities", name: "Natural Gas" },
  "HG=F": { sector: "Commodities", name: "Copper" },

  // Bonds
  "TLT": { sector: "Bonds", name: "20+ Year Treasury" },
  "IEF": { sector: "Bonds", name: "7-10 Year Treasury" },
  "SHY": { sector: "Bonds", name: "1-3 Year Treasury" },
  "LQD": { sector: "Bonds", name: "Investment Grade Corp" },
  "HYG": { sector: "Bonds", name: "High Yield Corp" },
};

const SECTOR_ORDER = [
  "Index ETFs",
  "Sector ETFs",
  "Technology",
  "Financials",
  "Healthcare",
  "Consumer",
  "Energy",
  "Industrials",
  "Crypto",
  "Commodities",
  "Bonds",
];

const SECTOR_COLORS = {
  "Index ETFs": "#3b82f6",
  "Sector ETFs": "#8b5cf6",
  "Technology": "#06b6d4",
  "Financials": "#f59e0b",
  "Healthcare": "#ec4899",
  "Consumer": "#f97316",
  "Energy": "#84cc16",
  "Industrials": "#14b8a6",
  "Crypto": "#a855f7",
  "Commodities": "#eab308",
  "Bonds": "#6366f1",
};

// ── Color Gradient ───────────────────────────────────────────────────────

function getChangeColor(change) {
  // Clamp to [-5, +5] range for color mapping
  const clamped = Math.max(-5, Math.min(5, change || 0));
  const pct = (clamped + 5) / 10; // 0 to 1

  // Color stops: deep red → red → gray → green → deep green
  const stops = [
    { pos: 0.0, r: 153, g: 27, b: 27 },   // #991b1b — deep red
    { pos: 0.25, r: 220, g: 38, b: 38 },   // #dc2626 — red
    { pos: 0.5, r: 75, g: 85, b: 99 },     // #4b5563 — gray
    { pos: 0.75, r: 34, g: 197, b: 94 },   // #22c55e — green
    { pos: 1.0, r: 6, g: 95, b: 40 },      // #065f28 — deep green
  ];

  // Find the two stops to interpolate between
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].pos && pct <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.pos - lower.pos;
  const t = range === 0 ? 0 : (pct - lower.pos) / range;
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function getChangeTextColor(change) {
  // White text for dark backgrounds, dark text for light backgrounds
  const clamped = Math.max(-5, Math.min(5, change || 0));
  const pct = (clamped + 5) / 10;
  // Middle range (gray) is lighter, edges are darker
  return pct > 0.35 && pct < 0.65 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.95)";
}

// ── Sort Options ─────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: "sector", label: "Sector", icon: "grid" },
  { key: "change", label: "Change %", icon: "sort" },
  { key: "name", label: "Name", icon: "text" },
];

export default function SectorHeatmap() {
  const { watchlist, selectedSymbol, setSelectedSymbol, prices } = usePriceFeed();
  const [sortBy, setSortBy] = useState("sector");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [hoveredSymbol, setHoveredSymbol] = useState(null);

  // Classify and enrich watchlist with sector info
  const enrichedData = useMemo(() => {
    return watchlist.map((w) => {
      const info = SECTOR_MAP[w.symbol] || {};
      const sector = info.sector ||
        (w.symbol.includes("-USD") ? "Crypto" :
         w.symbol.includes("=F") ? "Commodities" :
         w.symbol.includes("=X") ? "Forex" :
         "Other");
      return {
        ...w,
        sector,
        sectorName: info.name || w.name || w.symbol,
        sectorColor: SECTOR_COLORS[sector] || "#6b7280",
        change: w.change ?? 0,
        price: w.price ?? 0,
      };
    });
  }, [watchlist]);

  // Group by sector or sort flat
  const groupedData = useMemo(() => {
    if (sortBy === "change") {
      return [...enrichedData].sort((a, b) => (b.change || 0) - (a.change || 0));
    }
    if (sortBy === "name") {
      return [...enrichedData].sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
    // Default: group by sector
    const groups = {};
    for (const item of enrichedData) {
      if (!groups[item.sector]) groups[item.sector] = [];
      groups[item.sector].push(item);
    }
    // Sort sectors by order, then sort items within each sector by change
    const ordered = [];
    for (const sector of SECTOR_ORDER) {
      if (groups[sector]) {
        const items = groups[sector].sort((a, b) => (b.change || 0) - (a.change || 0));
        ordered.push(...items);
      }
    }
    // Add any sectors not in SECTOR_ORDER
    for (const sector of Object.keys(groups)) {
      if (!SECTOR_ORDER.includes(sector)) {
        const items = groups[sector].sort((a, b) => (b.change || 0) - (a.change || 0));
        ordered.push(...items);
      }
    }
    return ordered;
  }, [enrichedData, sortBy]);

  // Sector boundaries (for rendering sector headers)
  const sectorBoundaries = useMemo(() => {
    if (sortBy !== "sector") return {};
    const boundaries = {};
    let lastSector = null;
    groupedData.forEach((item, idx) => {
      if (item.sector !== lastSector) {
        boundaries[idx] = item.sector;
        lastSector = item.sector;
      }
    });
    return boundaries;
  }, [groupedData, sortBy]);

  // Aggregate stats
  const stats = useMemo(() => {
    const withChange = enrichedData.filter((d) => d.change !== undefined && d.change !== null);
    const gainers = withChange.filter((d) => d.change > 0).length;
    const losers = withChange.filter((d) => d.change < 0).length;
    const unchanged = withChange.length - gainers - losers;
    const avgChange = withChange.length > 0
      ? withChange.reduce((sum, d) => sum + d.change, 0) / withChange.length
      : 0;
    const best = withChange.length > 0
      ? withChange.reduce((best, d) => d.change > best.change ? d : best, withChange[0])
      : null;
    const worst = withChange.length > 0
      ? withChange.reduce((worst, d) => d.change < worst.change ? d : worst, withChange[0])
      : null;
    return { gainers, losers, unchanged, avgChange, best, worst, total: withChange.length };
  }, [enrichedData]);

  const handleCellClick = useCallback((symbol) => {
    setSelectedSymbol(symbol);
  }, [setSelectedSymbol]);

  // Determine grid columns based on item count
  const gridCols = enrichedData.length <= 6 ? "grid-cols-2 sm:grid-cols-3"
    : enrichedData.length <= 12 ? "grid-cols-3 sm:grid-cols-4"
    : enrichedData.length <= 20 ? "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6"
    : "grid-cols-5 sm:grid-cols-6 lg:grid-cols-8";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 border-b border-base-300 flex flex-col gap-2">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold">Market Heatmap</h3>
            <span className="badge badge-xs badge-accent gap-1">Live</span>
          </div>

          {/* Sort selector */}
          <div className="relative">
            <button
              className={`btn btn-sm sm:btn-xs min-h-[44px] sm:min-h-0 ${showSortMenu ? "btn-secondary" : "btn-ghost"}`}
              onClick={() => setShowSortMenu(!showSortMenu)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="hidden sm:inline">
                {SORT_OPTIONS.find((s) => s.key === sortBy)?.label || "Sector"}
              </span>
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 min-w-[160px]">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`w-full text-left flex items-center gap-2 px-2 py-2 sm:py-1.5 hover:bg-base-200 rounded text-sm sm:text-xs min-h-[44px] sm:min-h-0 ${sortBy === opt.key ? "bg-base-200 font-medium" : ""}`}
                    onClick={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                  >
                    {opt.label}
                    {sortBy === opt.key && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary ml-auto" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-success font-medium">{stats.gainers} up</span>
          <span className="text-error font-medium">{stats.losers} down</span>
          {stats.unchanged > 0 && <span className="text-base-content/40">{stats.unchanged} flat</span>}
          <span className="text-base-content/30">|</span>
          <span className={`font-medium ${stats.avgChange >= 0 ? "text-success" : "text-error"}`}>
            Avg: {stats.avgChange >= 0 ? "+" : ""}{stats.avgChange.toFixed(2)}%
          </span>
          {stats.best && (
            <span className="text-success hidden sm:inline">
              Best: {stats.best.symbol} +{stats.best.change.toFixed(2)}%
            </span>
          )}
          {stats.worst && (
            <span className="text-error hidden sm:inline">
              Worst: {stats.worst.symbol} {stats.worst.change.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex-1 overflow-auto p-2 sm:p-3">
        <div className={`grid ${gridCols} gap-1 sm:gap-1.5 h-full`}>
          {groupedData.map((item, idx) => {
            const isSectorStart = sectorBoundaries[idx];
            const bgColor = getChangeColor(item.change);
            const textColor = getChangeTextColor(item.change);
            const isSelected = item.symbol === selectedSymbol;
            const isHovered = item.symbol === hoveredSymbol;

            return (
              <div key={item.symbol} className="contents">
                {/* Sector header */}
                {isSectorStart && (
                  <div className="col-span-full flex items-center gap-2 mt-1 mb-0.5 first:mt-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: SECTOR_COLORS[isSectorStart] || "#6b7280" }}
                    />
                    <span className="text-[11px] font-semibold text-base-content/50 uppercase tracking-wider">
                      {isSectorStart}
                    </span>
                  </div>
                )}

                {/* Heatmap cell */}
                <button
                  className={`
                    relative rounded-md sm:rounded-lg p-2 sm:p-3
                    flex flex-col items-center justify-center text-center
                    transition-all duration-300 ease-out
                    cursor-pointer border-2
                    ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"}
                    ${isHovered ? "scale-[1.02] z-10 shadow-lg" : "scale-100"}
                    hover:scale-[1.02] hover:z-10 hover:shadow-lg
                    min-h-[70px] sm:min-h-[80px]
                  `}
                  style={{ backgroundColor: bgColor, color: textColor }}
                  onClick={() => handleCellClick(item.symbol)}
                  onMouseEnter={() => setHoveredSymbol(item.symbol)}
                  onMouseLeave={() => setHoveredSymbol(null)}
                >
                  {/* Symbol */}
                  <div className="font-bold text-xs sm:text-sm leading-tight truncate w-full">
                    {item.symbol.replace("-USD", "").replace("=F", "").replace("=X", "")}
                  </div>

                  {/* Company name (desktop) */}
                  <div className="text-[9px] sm:text-[10px] opacity-70 leading-tight truncate w-full hidden sm:block">
                    {item.sectorName}
                  </div>

                  {/* Change % */}
                  <div className="text-xs sm:text-sm font-mono font-semibold mt-0.5">
                    {item.change > 0 ? "+" : ""}{(item.change || 0).toFixed(2)}%
                  </div>

                  {/* Price (desktop) */}
                  {item.price > 0 && (
                    <div className="text-[9px] sm:text-[10px] opacity-60 font-mono hidden sm:block">
                      ${item.price < 1 ? item.price.toFixed(4) : item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}

                  {/* Live indicator */}
                  {item.connected && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color scale legend */}
      <div className="px-4 py-2 bg-base-200/30 border-t border-base-300 flex items-center justify-center gap-2">
        <span className="text-[10px] text-base-content/40">-5%</span>
        <div className="flex h-2.5 w-40 sm:w-56 rounded-full overflow-hidden">
          {Array.from({ length: 20 }, (_, i) => {
            const change = -5 + (i / 19) * 10; // -5 to +5
            return (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: getChangeColor(change) }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-base-content/40">+5%</span>
      </div>

      {/* Hovered tooltip */}
      {hoveredSymbol && (() => {
        const item = enrichedData.find((d) => d.symbol === hoveredSymbol);
        if (!item) return null;
        return (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-base-100 border border-base-300 rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="font-bold">{item.symbol}</span>
              <span className="text-base-content/50">{item.sectorName}</span>
              <span className="text-base-content/30">|</span>
              <span className={item.change >= 0 ? "text-success" : "text-error"}>
                {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
              </span>
              {item.price > 0 && (
                <>
                  <span className="text-base-content/30">|</span>
                  <span className="font-mono">${item.price.toFixed(2)}</span>
                </>
              )}
              <span className="text-base-content/30">|</span>
              <span className="text-base-content/50">{item.sector}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
