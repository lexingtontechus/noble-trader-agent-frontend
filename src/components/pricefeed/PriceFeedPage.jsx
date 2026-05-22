"use client";

import { PriceFeedProvider, usePriceFeed } from "@/context/PriceFeedContext";
import TickerTape from "./TickerTape";
import WatchlistPanel from "./WatchlistPanel";
import LiveCandlestickChart from "./LiveCandlestickChart";

/**
 * PriceFeedPage — Real-time market data dashboard.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │              TickerTape (scrolling)          │
 *   ├──────────┬──────────────────────────────────┤
 *   │          │                                    │
 *   │Watchlist │     LiveCandlestickChart           │
 *   │  Panel   │     (TradingView Lightweight)      │
 *   │          │                                    │
 *   │  250px   │           flex-1                   │
 *   │          │                                    │
 *   └──────────┴──────────────────────────────────┘
 *
 * Features:
 *   - TickerTape: scrolling real-time prices for all watchlist symbols
 *   - WatchlistPanel: add/remove symbols, see prices & change %
 *   - LiveCandlestickChart: professional OHLC chart with live updates
 *   - Responsive: watchlist collapses on mobile
 */
export default function PriceFeedPage() {
  return (
    <PriceFeedProvider>
      <PriceFeedContent />
    </PriceFeedProvider>
  );
}

function PriceFeedContent() {
  const { connected, connectionMode, lastUpdate, watchlist } = usePriceFeed();

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Ticker Tape — full width */}
      <TickerTape />

      {/* Main content area: Watchlist + Chart */}
      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist — sidebar, hidden on mobile */}
        <div className="hidden md:flex w-64 shrink-0 border-r border-base-300 bg-base-100 overflow-hidden">
          <WatchlistPanel />
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-base-100">
          <LiveCandlestickChart />
        </div>
      </div>

      {/* Mobile: Watchlist as bottom sheet / collapsible */}
      <div className="md:hidden border-t border-base-300 max-h-[40vh] overflow-y-auto bg-base-100">
        <MobileWatchlist />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 bg-base-200/30 border-t border-base-300 flex items-center justify-between text-[10px] text-base-content/40">
        <div className="flex items-center gap-3">
          <span>
            {watchlist.length} symbols
          </span>
          <span>
            {connectionMode === "websocket" ? "WebSocket" : connectionMode === "polling" ? "Polling" : "Disconnected"}
          </span>
          {connected && (
            <span className="text-success">Connected</span>
          )}
        </div>
        {lastUpdate && (
          <span>
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * MobileWatchlist — Simplified watchlist for mobile screens.
 * Shows symbols in a horizontal scrollable row with price + change.
 */
function MobileWatchlist() {
  const { watchlist, selectedSymbol, setSelectedSymbol } = usePriceFeed();

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">Watchlist</span>
        <span className="text-[10px] text-base-content/40">Tap to select</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {watchlist.map((item) => (
          <button
            key={item.symbol}
            className={`shrink-0 px-3 py-2 rounded-lg border transition-colors ${
              selectedSymbol === item.symbol
                ? "border-primary bg-primary/10"
                : "border-base-300 bg-base-200"
            }`}
            onClick={() => setSelectedSymbol(item.symbol)}
          >
            <div className="text-xs font-bold">{item.symbol}</div>
            {item.price != null ? (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-mono">${formatPrice(item.price, item.symbol)}</span>
                <span
                  className={`text-[9px] font-mono ${
                    item.change > 0 ? "text-success" : item.change < 0 ? "text-error" : "text-base-content/30"
                  }`}
                >
                  {item.change > 0 ? "+" : ""}{item.change.toFixed(1)}%
                </span>
              </div>
            ) : (
              <div className="text-[10px] text-base-content/30 mt-0.5">—</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
