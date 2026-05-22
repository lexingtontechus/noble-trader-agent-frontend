"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
 *   - Enhanced status bar with tick counter, connection stats, market status
 *   - Toast notifications for connection events
 *   - CSS animations for price flashes and direction arrows
 */
export default function PriceFeedPage() {
  return (
    <PriceFeedProvider>
      <PriceFeedContent />
    </PriceFeedProvider>
  );
}

function PriceFeedContent() {
  const {
    connected,
    connectionMode,
    lastUpdate,
    watchlist,
    tickCount,
    ticksPerSecond,
    connectedSince,
    reconnectAttempt,
    marketStatus,
  } = usePriceFeed();
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

      {/* Enhanced status bar */}
      <StatusBar
        connected={connected}
        connectionMode={connectionMode}
        lastUpdate={lastUpdate}
        symbolCount={watchlist.length}
        tickCount={tickCount}
        ticksPerSecond={ticksPerSecond}
        connectedSince={connectedSince}
        reconnectAttempt={reconnectAttempt}
        marketStatus={marketStatus}
      />

      {/* Connection toast notifications */}
      <ConnectionToasts
        connected={connected}
        connectionMode={connectionMode}
        reconnectAttempt={reconnectAttempt}
      />

      {/* Global price flash animations */}
      <style jsx global>{`
        /* Price flash — green (up tick) */
        .flash-green {
          animation: flashGreen 0.6s ease-out;
        }
        @keyframes flashGreen {
          0% { background-color: rgba(34, 197, 94, 0.15); }
          100% { background-color: transparent; }
        }

        /* Price flash — red (down tick) */
        .flash-red {
          animation: flashRed 0.6s ease-out;
        }
        @keyframes flashRed {
          0% { background-color: rgba(239, 68, 68, 0.15); }
          100% { background-color: transparent; }
        }

        /* Direction arrow bounce up */
        .arrow-up {
          animation: arrowUp 0.3s ease-out;
        }
        @keyframes arrowUp {
          0% { transform: translateY(2px); opacity: 0.5; }
          100% { transform: translateY(0); opacity: 1; }
        }

        /* Direction arrow bounce down */
        .arrow-down {
          animation: arrowDown 0.3s ease-out;
        }
        @keyframes arrowDown {
          0% { transform: translateY(-2px); opacity: 0.5; }
          100% { transform: translateY(0); opacity: 1; }
        }

        /* Price value flash */
        .price-flash {
          transition: color 0.2s ease-out;
        }

        /* Scrollbar hide for mobile controls */
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

// ── Enhanced Status Bar ───────────────────────────────────────────────────

function StatusBar({
  connected,
  connectionMode,
  lastUpdate,
  symbolCount,
  tickCount,
  ticksPerSecond,
  connectedSince,
  reconnectAttempt,
  marketStatus,
}) {
  // Format uptime
  const [uptime, setUptime] = useState("");
  useEffect(() => {
    if (!connectedSince) {
      setUptime("");
      return;
    }
    const update = () => {
      const diff = Date.now() - connectedSince.getTime();
      const secs = Math.floor(diff / 1000);
      const mins = Math.floor(secs / 60);
      const hrs = Math.floor(mins / 60);
      if (hrs > 0) setUptime(`${hrs}h ${mins % 60}m`);
      else if (mins > 0) setUptime(`${mins}m ${secs % 60}s`);
      else setUptime(`${secs}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [connectedSince]);

  const marketLabel = {
    open: "Market Open",
    "pre-market": "Pre-Market",
    "after-hours": "After Hours",
    closed: "Market Closed",
  }[marketStatus] || "";

  const marketColor = {
    open: "text-success",
    "pre-market": "text-warning",
    "after-hours": "text-info",
    closed: "text-base-content/40",
  }[marketStatus] || "text-base-content/40";

  return (
    <div className="px-4 py-1.5 bg-base-200/30 border-t border-base-300 flex items-center justify-between text-[10px] text-base-content/40">
      <div className="flex items-center gap-3">
        <span>{symbolCount} symbols</span>

        {/* Connection mode */}
        <span className="flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectionMode === "websocket"
                ? "bg-success"
                : connectionMode === "polling"
                  ? "bg-warning"
                  : "bg-base-content/20"
            }`}
          />
          {connectionMode === "websocket" ? "WebSocket" : connectionMode === "polling" ? "Polling" : "Disconnected"}
        </span>

        {/* Tick counter (only when connected) */}
        {connected && (
          <span className="hidden sm:inline">
            {ticksPerSecond} ticks/s
          </span>
        )}

        {/* Uptime */}
        {connected && uptime && (
          <span className="hidden sm:inline">
            up {uptime}
          </span>
        )}

        {/* Reconnect attempt */}
        {reconnectAttempt > 0 && !connected && (
          <span className="text-warning">
            reconnect #{reconnectAttempt}
          </span>
        )}

        {/* Market status */}
        <span className={marketColor}>
          {marketLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {tickCount > 0 && (
          <span className="hidden sm:inline">
            {tickCount.toLocaleString()} ticks
          </span>
        )}
        {lastUpdate && (
          <span>
            {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Connection Toast Notifications ────────────────────────────────────────

function ConnectionToasts({ connected, connectionMode, reconnectAttempt }) {
  const [toasts, setToasts] = useState([]);
  const prevConnectedRef = useRef(false);
  const prevModeRef = useRef("");

  useEffect(() => {
    // Detect connection state changes
    const wasConnected = prevConnectedRef.current;
    const wasMode = prevModeRef.current;

    // Connected for the first time or reconnected
    if (connected && !wasConnected && connectionMode === "websocket") {
      addToast("WebSocket connected — live prices active", "success");
    }

    // Disconnected
    if (!connected && wasConnected) {
      addToast("Live feed disconnected — retrying...", "warning");
    }

    // Switched to polling
    if (connectionMode === "polling" && wasMode === "websocket") {
      addToast("Switched to polling mode", "info");
    }

    // Reconnection attempts
    if (reconnectAttempt > 0 && !connected) {
      addToast(`Reconnection attempt #${reconnectAttempt}`, "warning");
    }

    prevConnectedRef.current = connected;
    prevModeRef.current = connectionMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connectionMode, reconnectAttempt]);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]); // Max 3 toasts
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`alert alert-sm shadow-lg animate-slide-in ${
            toast.type === "success"
              ? "alert-success"
              : toast.type === "warning"
                ? "alert-warning"
                : "alert-info"
          }`}
        >
          <span className="text-xs">{toast.message}</span>
        </div>
      ))}

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
