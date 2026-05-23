"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PriceFeedProvider, usePriceFeed } from "@/context/PriceFeedContext";
import TickerTape from "./TickerTape";
import WatchlistPanel from "./WatchlistPanel";
import LiveCandlestickChart from "./LiveCandlestickChart";
import TradingViewAdvancedChart from "./TradingViewAdvancedChart";
import SectorHeatmap from "./SectorHeatmap";
import EconomicCalendar from "./EconomicCalendar";
import PriceAlertPanel from "./PriceAlertPanel";
import OrderFlowPanel from "./OrderFlowPanel";
import MultiFeedDashboard from "./MultiFeedDashboard";

/**
 * PriceFeedPage — Real-time market data dashboard.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │              TickerTape (scrolling)          │
 *   ├──────────┬──────────────────────────────────┤
 *   │          │  [Live] [Advanced] ← Chart Mode   │
 *   │Watchlist │                                    │
 *   │  Panel   │  LiveCandlestickChart              │
 *   │          │  OR                                 │
 *   │          │  TradingViewAdvancedChart           │
 *   │          │                                    │
 *   │  250px   │           flex-1                   │
 *   │          │                                    │
 *   └──────────┴──────────────────────────────────┘
 *   │              StatusBar                       │
 *   └─────────────────────────────────────────────┘
 *
 * Features:
 *   - Dual chart modes: Live (WebSocket) + Advanced (TradingView)
 *   - TickerTape: scrolling real-time prices for all watchlist symbols
 *   - WatchlistPanel: add/remove symbols, see prices & change %
 *   - LiveCandlestickChart: professional OHLC chart with live WS updates
 *   - TradingViewAdvancedChart: 100+ indicators, drawing tools, pro features
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
    chartMode,
    setChartMode,
    setSelectedSymbol,
    prices,
  } = usePriceFeed();
  const [showMobileWatchlist, setShowMobileWatchlist] = useState(false);
  const [showMobileAlerts, setShowMobileAlerts] = useState(false);
  const [showOrderFlow, setShowOrderFlow] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-48px)] sm:h-[calc(100dvh-4rem)]">
      {/* Ticker Tape — full width */}
      <TickerTape />

      {/* Main content area: Watchlist + Chart + Alerts */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Watchlist — sidebar, hidden on mobile */}
        <div className="hidden md:flex w-64 shrink-0 border-r border-base-300 bg-base-100 overflow-hidden">
          <WatchlistPanel />
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-base-100 relative">
          {/* Chart mode toggle */}
          <div className="px-3 sm:px-4 py-1.5 border-b border-base-300 flex items-center justify-between bg-base-200/30">
            <ChartModeToggle chartMode={chartMode} setChartMode={setChartMode} connected={connected} />
          </div>

          {/* Chart + Order Flow area */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Chart content — conditional rendering */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {chartMode === "live" ? <LiveCandlestickChart /> : chartMode === "heatmap" ? <SectorHeatmap /> : chartMode === "calendar" ? <EconomicCalendar /> : chartMode === "flow" ? <OrderFlowPanel /> : chartMode === "feeds" ? <MultiFeedDashboard /> : <TradingViewAdvancedChart />}
            </div>

            {/* Order Flow side panel (toggleable alongside any chart mode) */}
            {showOrderFlow && chartMode !== "flow" && (
              <div className="hidden lg:flex w-72 shrink-0 border-l border-base-300 bg-base-100 overflow-hidden">
                <OrderFlowPanel />
              </div>
            )}
          </div>

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

          {/* Mobile: Alerts toggle button */}
          <button
            className="md:hidden btn btn-sm btn-circle btn-ghost absolute bottom-2 right-12 z-20 bg-base-100/80 border border-base-300 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
            onClick={() => setShowMobileAlerts(!showMobileAlerts)}
            aria-label={showMobileAlerts ? "Hide alerts" : "Show alerts"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
              <path d="M10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* Order Flow toggle button (desktop + mobile) */}
          <button
            className={`btn btn-sm btn-circle btn-ghost absolute bottom-2 right-2 z-20 border ${showOrderFlow ? "bg-accent/20 border-accent" : "bg-base-100/80 border-base-300"} min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0`}
            onClick={() => setShowOrderFlow(!showOrderFlow)}
            aria-label={showOrderFlow ? "Hide order flow" : "Show order flow"}
            title="Toggle Order Flow panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Alerts — sidebar, hidden on mobile */}
        <div className="hidden md:flex w-56 shrink-0 border-l border-base-300 bg-base-100 overflow-hidden">
          <PriceAlertPanel
            onSymbolSelect={(sym) => setSelectedSymbol(sym)}
            currentPrices={prices}
          />
        </div>

        {/* Mobile: Watchlist as fixed bottom sheet overlay */}
        {showMobileWatchlist && (
          <SwipeableBottomSheet
            onClose={() => setShowMobileWatchlist(false)}
            title="Watchlist"
            maxHeight="50dvh"
          >
            <WatchlistPanel />
          </SwipeableBottomSheet>
        )}

        {/* Mobile: Alerts as fixed bottom sheet overlay */}
        {showMobileAlerts && (
          <SwipeableBottomSheet
            onClose={() => setShowMobileAlerts(false)}
            title="Price Alerts"
            maxHeight="60dvh"
          >
            <PriceAlertPanel
              onSymbolSelect={(sym) => {
                setSelectedSymbol(sym);
                setShowMobileAlerts(false);
              }}
              currentPrices={prices}
            />
          </SwipeableBottomSheet>
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
        chartMode={chartMode}
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

// ── Chart Mode Toggle ────────────────────────────────────────────────────

function ChartModeToggle({ chartMode, setChartMode, connected }) {
  return (
    <div className="flex items-center gap-1">
      <div className="join">
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "live" ? "btn-primary" : "btn-ghost"
          }`}
          onClick={() => setChartMode("live")}
          title="WebSocket live chart"
        >
          <span className="flex items-center gap-1.5">
            {connected && chartMode === "live" && (
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 hidden sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Live</span>
          </span>
        </button>
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "advanced" ? "btn-secondary" : "btn-ghost"
          }`}
          onClick={() => setChartMode("advanced")}
          title="TradingView Advanced Chart"
        >
          <span className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 hidden sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Advanced</span>
          </span>
        </button>
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "heatmap" ? "btn-accent" : "btn-ghost"
          }`}
          onClick={() => setChartMode("heatmap")}
          title="Market Heatmap"
        >
          <span className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 hidden sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 6a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5zM4 13a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z" />
            </svg>
            <span>Heatmap</span>
          </span>
        </button>
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "calendar" ? "btn-info" : "btn-ghost"
          }`}
          onClick={() => setChartMode("calendar")}
          title="Economic Calendar"
        >
          <span className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 hidden sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">Calendar</span>
          </span>
        </button>
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "flow" ? "btn-warning" : "btn-ghost"
          }`}
          onClick={() => setChartMode("flow")}
          title="Order Flow & Level 2"
        >
          <span className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Flow</span>
          </span>
        </button>
        <button
          className={`btn join-item btn-xs sm:btn-xs min-h-[36px] sm:min-h-0 ${
            chartMode === "feeds" ? "btn-info" : "btn-ghost"
          }`}
          onClick={() => setChartMode("feeds")}
          title="Multi-Feed Aggregation"
        >
          <span className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="hidden sm:inline">Feeds</span>
          </span>
        </button>
      </div>

      {/* Mode description */}
      <span className="hidden lg:inline text-[10px] text-base-content/30 ml-2">
        {chartMode === "live" ? "WebSocket feed" : chartMode === "heatmap" ? "Market pulse" : chartMode === "calendar" ? "Econ events" : chartMode === "flow" ? "Order flow & depth" : chartMode === "feeds" ? "Source aggregation" : "TradingView Pro"}
      </span>
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
  chartMode,
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

        {/* Chart mode indicator */}
        <span className="flex items-center gap-1">
          {chartMode === "live" ? (
            <>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-success" : "bg-base-content/20"}`} />
              Live Chart
            </>
          ) : chartMode === "heatmap" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Heatmap
            </>
          ) : chartMode === "calendar" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              Calendar
            </>
          ) : chartMode === "flow" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              Order Flow
            </>
          ) : chartMode === "feeds" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              Feeds
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              TradingView
            </>
          )}
        </span>

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

// ── Swipeable Bottom Sheet ─────────────────────────────────────────────────

function SwipeableBottomSheet({ onClose, title, maxHeight = "50dvh", children }) {
  const sheetRef = useRef(null);
  const touchStartRef = useRef({ y: 0, time: 0 });
  const [translateY, setTranslateY] = useState(0);

  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = {
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchMove = useCallback((e) => {
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    if (deltaY > 0) {
      // Only allow downward drag (dismiss direction)
      setTranslateY(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const velocity = translateY / Math.max(Date.now() - touchStartRef.current.time, 1);

    // Dismiss if dragged more than 100px or with velocity > 0.5
    if (translateY > 100 || velocity > 0.5) {
      onClose();
    }
    setTranslateY(0);
  }, [translateY, onClose]);

  return (
    <div className="md:hidden fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 rounded-t-xl flex flex-col shadow-2xl transition-transform"
        style={{
          maxHeight,
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
          transition: translateY > 0 ? "none" : "transform 0.3s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle — functional for swipe */}
        <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-base-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-sm font-bold">{title}</span>
          <button
            className="btn btn-ghost btn-sm min-h-[44px] sm:min-h-0"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
