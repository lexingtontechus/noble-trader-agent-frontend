"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TickerCard from "@/components/dashboard/TickerCard";
import ComparisonTable from "@/components/dashboard/ComparisonTable";
import RegimeSummaryBanner from "@/components/dashboard/RegimeSummaryBanner";
import { useStream } from "@/context/StreamContext";
import StreamStatusPanel from "@/components/streaming/StreamStatusPanel";
import AlertHistory from "@/components/streaming/AlertHistory";

const DEFAULT_TICKERS = [
  { symbol: "GC=F", displayName: "Gold" },
  { symbol: "BTC-USD", displayName: "Bitcoin" },
  { symbol: "EURUSD=X", displayName: "USD/EUR" },
];

const PERIOD_MAP = {
  "6M": "6mo",
  "1Y": "1y",
  "2Y": "2y",
};

export default function Dashboard() {
  const [period, setPeriod] = useState("6M");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tickerData, setTickerData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [showComparison, setShowComparison] = useState(false);
  const intervalRef = useRef(null);
  const {
    subscriptions,
    subscribeAll,
    unsubscribeAll,
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

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh) {
      intervalRef.current = setInterval(
        () => {
          fetchAllTickers();
        },
        2 * 60 * 1000,
      );
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, fetchAllTickers]);

  const handleRetry = useCallback(
    (symbol) => {
      fetchTicker(symbol, period);
    },
    [period, fetchTicker],
  );

  const handlePeriodChange = useCallback((newPeriod) => {
    setPeriod(newPeriod);
    setTickerData({});
    setErrors({});
  }, []);

  // Build ticker objects for banner and comparison
  const tickerObjects = DEFAULT_TICKERS.map((t) => ({
    ...t,
    data: tickerData[t.symbol] || null,
  }));

  const anyLoading = Object.values(loading).some(Boolean);
  const allLoaded = DEFAULT_TICKERS.every((t) => tickerData[t.symbol]);
  const hasSubscriptions = subscriptions.size > 0;
  const allDefaultLive = DEFAULT_TICKERS.every((t) =>
    subscriptions.has(t.symbol),
  );

  return (
    <div className="space-y-6">
      {/* Streaming Control Bar — prominent at top */}
      <div className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Live status indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {anyConnected ? (
                  <span className="badge badge-success gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    LIVE
                  </span>
                ) : (
                  <span className="badge badge-ghost gap-1">
                    <span className="h-2 w-2 rounded-full bg-base-content/30"></span>
                    OFFLINE
                  </span>
                )}
                <span className="text-xs text-base-content/60">
                  {activeStreamCount} stream{activeStreamCount !== 1 ? "s" : ""}{" "}
                  active
                </span>
              </div>
            </div>

            {/* Right: Go Live All / Stop All */}
            <div className="flex items-center gap-2">
              {!hasSubscriptions ? (
                <button
                  className="btn btn-sm btn-primary gap-1 shadow-md"
                  onClick={() =>
                    subscribeAll(DEFAULT_TICKERS.map((t) => t.symbol))
                  }
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
                      strokeWidth="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  📡 Go Live — All Tickers
                </button>
              ) : (
                <>
                  {!allDefaultLive && (
                    <button
                      className="btn btn-sm btn-primary btn-outline gap-1"
                      onClick={() =>
                        subscribeAll(DEFAULT_TICKERS.map((t) => t.symbol))
                      }
                    >
                      📡 Go Live All
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-error gap-1 shadow-md"
                    onClick={unsubscribeAll}
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
                        strokeWidth="2"
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                      />
                    </svg>
                    ⏹ Stop All
                  </button>
                </>
              )}
            </div>
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
              className={`btn btn-sm ${period === p ? "btn-active btn-primary" : ""}`}
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
            className="btn btn-sm btn-ghost"
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

          {/* Comparison toggle */}
          {allLoaded && (
            <button
              className={`btn btn-sm ${showComparison ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? "Hide Comparison" : "Compare"}
            </button>
          )}
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-base-content/40">
          Last updated: {lastUpdated.toLocaleTimeString()}
          {autoRefresh && (
            <span className="ml-2 badge badge-xs badge-primary badge-outline">
              auto 2m
            </span>
          )}
        </div>
      )}

      {/* Regime Summary Banner */}
      <RegimeSummaryBanner tickers={tickerObjects} />

      {/* Comparison Table */}
      {showComparison && allLoaded && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">Ticker Comparison</h3>
            <ComparisonTable tickers={tickerObjects} />
          </div>
        </div>
      )}

      {/* Streaming Status + Alerts */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-6">
        <div className="col-span-1">
          <StreamStatusPanel />
        </div>
        <div className="col-span-1">
          <AlertHistory />
        </div>
      </div>

      {/* Ticker Cards Grid */}
      <div className="flex flex-wrap gap-2">
        {/*grid grid-cols-1 lg:grid-cols-3 gap-6">*/}
        {DEFAULT_TICKERS.map((t) => (
          <TickerCard
            key={t.symbol}
            symbol={t.symbol}
            displayName={t.displayName}
            data={tickerData[t.symbol] || null}
            loading={loading[t.symbol] || false}
            error={errors[t.symbol] || null}
            onRetry={() => handleRetry(t.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
