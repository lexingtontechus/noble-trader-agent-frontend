"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TickerCard from "@/components/dashboard/TickerCard";
import ComparisonTable from "@/components/dashboard/ComparisonTable";
import RegimeSummaryBanner from "@/components/dashboard/RegimeSummaryBanner";
import { useStream } from "@/context/StreamContext";
import StreamStatusPanel from "@/components/streaming/StreamStatusPanel";
import AlertHistory from "@/components/streaming/AlertHistory";
import { notifySuccess, notifyError } from "@/lib/notifications";
import LiveBadge from "@/components/streaming/LiveBadge";
import dynamic from 'next/dynamic'
const EvolutionPanel = dynamic(() => import('@/components/evolution/EvolutionPanel'), { ssr: false })

const DEFAULT_TICKERS = [
  { symbol: "GC=F", displayName: "Gold", icon: "🥇" },
  { symbol: "BTC-USD", displayName: "Bitcoin", icon: "₿" },
  { symbol: "EURUSD=X", displayName: "USD/EUR", icon: "💱" },
];

const PERIOD_MAP = {
  "6M": "6mo",
  "1Y": "1y",
  "2Y": "2y",
};

// Auto-refresh interval: 5 minutes
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

// Debounce delay for period changes (300ms)
const PERIOD_DEBOUNCE_MS = 300;

export default function Dashboard() {
  const [period, setPeriod] = useState("6M");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tickerData, setTickerData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState(DEFAULT_TICKERS[0].symbol);
  const intervalRef = useRef(null);
  const periodDebounceRef = useRef(null);
  const initialLoadDone = useRef(false);
  const {
    subscriptions,
    subscribeAll,
    activeStreamCount,
    anyConnected,
  } = useStream();

  const fetchTicker = useCallback(async (symbol, periodKey) => {
    const apiPeriod = PERIOD_MAP[periodKey] || "6mo";

    setLoading((prev) => ({ ...prev, [symbol]: true }));
    setErrors((prev) => ({ ...prev, [symbol]: null }));

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, period: apiPeriod }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setTickerData((prev) => ({ ...prev, [symbol]: data }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [symbol]: err.message }));
      notifyError(`Failed to load ${symbol}: ${err.message}`);
    } finally {
      setLoading((prev) => ({ ...prev, [symbol]: false }));
    }
  }, []);

  const fetchAllTickers = useCallback(() => {
    DEFAULT_TICKERS.forEach((t) => fetchTicker(t.symbol, period));
    setLastUpdated(new Date());
  }, [period, fetchTicker]);

  // Initial fetch + period change
  useEffect(() => {
    fetchAllTickers();
  }, [fetchAllTickers]);

  // Auto-refresh interval (5 minutes)
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchAllTickers();
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, fetchAllTickers]);

  // Notify on initial load only (not on every auto-refresh)
  useEffect(() => {
    const allDone = DEFAULT_TICKERS.every(
      (t) => !loading[t.symbol] && (tickerData[t.symbol] || errors[t.symbol]),
    );
    const anySucceeded = DEFAULT_TICKERS.some((t) => tickerData[t.symbol]);
    if (allDone && anySucceeded && !initialLoadDone.current) {
      initialLoadDone.current = true;
      notifySuccess("Dashboard loaded", 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tickerData, errors]);

  const handleRetry = useCallback(
    (symbol) => {
      fetchTicker(symbol, period);
    },
    [period, fetchTicker],
  );

  const handlePeriodChange = useCallback((newPeriod) => {
    // Debounce: clear any pending period change, set new timeout
    if (periodDebounceRef.current) {
      clearTimeout(periodDebounceRef.current);
    }

    // Immediately update the visual period selector
    setPeriod(newPeriod);

    // Debounce the actual data fetch — keep stale data while loading
    periodDebounceRef.current = setTimeout(() => {
      // Don't clear tickerData — let new data replace it when it arrives (optimistic)
      setErrors({});
      // Fetch will be triggered by period state change → fetchAllTickers dependency
    }, PERIOD_DEBOUNCE_MS);
  }, []);

  // Build ticker objects for banner and comparison
  const tickerObjects = DEFAULT_TICKERS.map((t) => ({
    ...t,
    data: tickerData[t.symbol] || null,
  }));

  const anyLoading = Object.values(loading).some(Boolean);
  const allLoaded = DEFAULT_TICKERS.every((t) => tickerData[t.symbol]);
  const hasSubscriptions = subscriptions.size > 0;

  // Active ticker info
  const activeTicker = DEFAULT_TICKERS.find((t) => t.symbol === activeTab);

  return (
    <div className="space-y-6">
      {/* Streaming Control Bar — prominent at top */}
      <div className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body p-3">
          <div className="flex items-center gap-3">
            <LiveBadge connected={anyConnected} />
            {!anyConnected && (
              <span className="text-xs text-base-content/60">
                OFFLINE
              </span>
            )}
            <span className="text-xs text-base-content/60">
              {activeStreamCount} stream{activeStreamCount !== 1 ? "s" : ""}{" "}
              active
            </span>
            {!hasSubscriptions && (
              <button
                className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary gap-1 shadow-md"
                onClick={() =>
                  subscribeAll(DEFAULT_TICKERS.map((t) => t.symbol))
                }
              >
                📡 Go Live — All Tickers
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Period Selector */}
        <div className="btn-group">
          {Object.keys(PERIOD_MAP).map((p) => (
            <button
              key={p}
              className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm ${period === p ? "btn-active btn-primary" : ""}`}
              onClick={() => handlePeriodChange(p)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-4">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-base-content/60">Auto-refresh</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>

          {/* Manual refresh */}
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost"
            onClick={fetchAllTickers}
            disabled={anyLoading}
          >
            {anyLoading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
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
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
          </button>

          {/* Last Updated */}
          {lastUpdated && (
            <span className="text-xs text-base-content/40">
              {lastUpdated.toLocaleTimeString()}
              {autoRefresh && (
                <span className="ml-1 badge badge-xs badge-primary badge-outline">
                  auto 5m
                </span>
              )}
            </span>
          )}

          {/* Comparison toggle */}
          {allLoaded && (
            <button
              className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm ${showComparison ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? "Hide Comparison" : "Compare"}
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner — when ALL tickers fail */}
      {Object.values(errors).filter(Boolean).length === DEFAULT_TICKERS.length && (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="font-medium">Backend appears offline</div>
            <div className="text-xs opacity-70">All ticker fetches failed. The analysis backend may be experiencing issues.</div>
          </div>
          <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost" onClick={fetchAllTickers}>Retry All</button>
        </div>
      )}

      {/* Regime Summary Banner — compact at-a-glance for all tickers */}
      <RegimeSummaryBanner tickers={tickerObjects} />

      {/* Streaming Status + Alerts — equal-height cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <StreamStatusPanel />
        <AlertHistory />
      </div>

      {/* Comparison Table */}
      {showComparison && allLoaded && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">Ticker Comparison</h3>
            <ComparisonTable tickers={tickerObjects} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Ticker Tab Layout — DaisyUI boxed tabs (button-style)
          One ticker at a time, full-width content.
          Each tab shows a compact status indicator
          (regime badge or loading/error state).
          ═══════════════════════════════════════════ */}
      <div role="tablist" className="tabs tabs-boxed bg-base-300 p-1">
        {DEFAULT_TICKERS.map((t) => {
          const isLoading = loading[t.symbol];
          const hasError = errors[t.symbol];
          const data = tickerData[t.symbol];
          const regimeLabel = data?.analysis?.regime?.regime_label;
          const isActive = activeTab === t.symbol;

          return (
            <button
              key={t.symbol}
              role="tab"
              className={`tab tab-lg flex-1 transition-all ${
                isActive
                  ? "tab-active bg-primary text-primary-content shadow-md"
                  : "hover:bg-base-200"
              }`}
              onClick={() => setActiveTab(t.symbol)}
            >
              <span className="flex items-center gap-2">
                <span>{t.icon}</span>
                <span className="font-semibold">{t.displayName}</span>
                {isLoading && (
                  <span className="loading loading-spinner loading-xs text-primary" />
                )}
                {!isLoading && hasError && (
                  <span className="badge badge-error font-bold">!</span>
                )}
                {!isLoading && !hasError && regimeLabel && (
                  <span className={`badge font-bold ${
                    regimeLabel.toLowerCase().includes("bull") ? "badge-success" :
                    regimeLabel.toLowerCase().includes("bear") ? "badge-error" :
                    "badge-warning"
                  }`}>
                    {regimeLabel}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content — only the active ticker */}
      <div className="min-h-[400px]">
        {DEFAULT_TICKERS.map((t) => (
          <div
            key={t.symbol}
            role="tabpanel"
            className={activeTab === t.symbol ? "" : "hidden"}
          >
            <TickerCard
              symbol={t.symbol}
              displayName={t.displayName}
              data={tickerData[t.symbol] || null}
              loading={loading[t.symbol] || false}
              error={errors[t.symbol] || null}
              onRetry={() => handleRetry(t.symbol)}
            />
          </div>
        ))}
      </div>

      {/* Strategy Evolution Panel */}
      <div className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <path d="M9 3h6" /><path d="M10 9V3" /><path d="M14 9V3" /><path d="M9 9l-4.5 8.5a2 2 0 0 0 1.7 2.9h10.6a2 2 0 0 0 1.7-2.9L15 9" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm">Strategy Evolution</h3>
            <span className="badge badge-xs badge-ghost ml-auto">Phase 5</span>
          </div>
          <EvolutionPanel />
        </div>
      </div>
    </div>
  );
}
