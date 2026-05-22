"use client";

import { useState } from "react";
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
 * Mobile:
 *   ┌─────────────────────────────────────────────┐
 *   │              TickerTape                      │
 *   ├─────────────────────────────────────────────┤
 *   │                                              │
 *   │     LiveCandlestickChart (full width)         │
 *   │                                              │
 *   ├─────────────────────────────────────────────┤
 *   │  Status bar                                  │
 *   └─────────────────────────────────────────────┘
 *   + Mobile watchlist as overlay bottom sheet
 *
 * Features:
 *   - TickerTape: scrolling real-time prices for all watchlist symbols
 *   - WatchlistPanel: add/remove symbols, see prices & change %
 *   - LiveCandlestickChart: professional OHLC chart with live updates
 *   - Responsive: watchlist becomes toggleable bottom sheet on mobile
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
  const [showMobileWatchlist, setShowMobileWatchlist] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Ticker Tape — full width */}
      <TickerTape />

      {/* Main content area: Watchlist + Chart */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Watchlist — sidebar, hidden on mobile */}
        <div className="hidden md:flex w-64 shrink-0 border-r border-base-300 bg-base-100 overflow-hidden">
          <WatchlistPanel />
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-base-100 relative">
          <LiveCandlestickChart />

          {/* Mobile: Watchlist toggle button */}
          <button
            className="md:hidden btn btn-sm btn-circle btn-ghost absolute bottom-2 left-2 z-20 bg-base-100/80 border border-base-300 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
            onClick={() => setShowMobileWatchlist(!showMobileWatchlist)}
            aria-label={showMobileWatchlist ? "Hide watchlist" : "Show watchlist"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile: Watchlist as fixed bottom sheet overlay */}
        {showMobileWatchlist && (
          <div className="md:hidden fixed inset-0 z-30">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowMobileWatchlist(false)}
            />

            {/* Bottom sheet */}
            <div className="absolute bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 rounded-t-xl max-h-[50dvh] overflow-hidden flex flex-col shadow-2xl">
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-base-300" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="text-sm font-bold">Watchlist</span>
                <button
                  className="btn btn-ghost btn-sm min-h-[44px] sm:min-h-0"
                  onClick={() => setShowMobileWatchlist(false)}
                >
                  ✕
                </button>
              </div>

              {/* Watchlist content */}
              <div className="flex-1 overflow-y-auto">
                <WatchlistPanel />
              </div>
            </div>
          </div>
        )}
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
