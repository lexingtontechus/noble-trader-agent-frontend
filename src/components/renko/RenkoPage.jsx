"use client";

import { useState, useEffect, useCallback, useRef, Component } from "react";
import dynamic from "next/dynamic";
import { notifySuccess, notifyError } from "@/lib/notifications";

// Lazy-load heavy sub-components
const BrickChart = dynamic(() => import("./BrickChart"), { ssr: false });
const SignalsPanel = dynamic(() => import("./SignalsPanel"), { ssr: false });
const TradesPanel = dynamic(() => import("./TradesPanel"), { ssr: false });
const ConfigPanel = dynamic(() => import("./ConfigPanel"), { ssr: false });

// ── Error Boundary ─────────────────────────────────────────────────────────

class RenkoErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[RenkoPage ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 className="font-bold">Rendering Error</h3>
            <div className="text-xs mt-1">
              {this.state.error?.message || "Unknown error"}
            </div>
            <button
              className="btn btn-sm btn-ghost mt-2"
              onClick={() =>
                this.setState({ hasError: false, error: null })
              }
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Symbols ─────────────────────────────────────────────────────────────────

const SYMBOLS = ["SPY", "AAPL", "TSLA", "NVDA", "QQQ", "META", "AMZN", "MSFT"];

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "bricks", label: "🧱 Brick Chart", shortLabel: "Bricks" },
  { key: "signals", label: "📊 Signals", shortLabel: "Signals" },
  { key: "trades", label: "💰 Trades", shortLabel: "Trades" },
  { key: "config", label: "⚙️ Config", shortLabel: "Config" },
];

// ── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, subtext, icon, colorClass = "" }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            {label}
          </span>
          {icon && <span className="text-base-content/20 text-xs">{icon}</span>}
        </div>
        <div className={`text-xl font-bold font-mono ${colorClass}`}>
          {value}
        </div>
        {subtext && (
          <div className="text-[10px] text-base-content/30 mt-0.5">
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

// ── BFF Fetch Helper ─────────────────────────────────────────────────────────

async function renkoApiFetch(action, options = {}) {
  const { method = "GET", body, params = {} } = options;

  const searchParams = new URLSearchParams(params);
  const url = `/api/renko/${action}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const fetchOptions = {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  // Handle cold starts
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Backend is starting up. Please wait a moment.");
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function RenkoPage() {
  const [activeTab, setActiveTab] = useState("bricks");
  const [symbol, setSymbol] = useState("SPY");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Data state
  const [pipelineState, setPipelineState] = useState(null);
  const [bricks, setBricks] = useState([]);
  const [classified, setClassified] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState({});

  // Refs for cleanup
  const abortControllerRef = useRef(null);
  const intervalRef = useRef(null);

  // ── Load cached snapshot from Supabase (fast, no backend call) ──────
  const loadCachedSnapshot = useCallback(async (sym) => {
    try {
      const res = await fetch(`/api/renko/warmup?symbol=${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cached) {
          // Populate state from cached snapshot
          setBricks(Array.isArray(data.bricks) ? data.bricks : []);
          setClassified(Array.isArray(data.classified) ? data.classified : []);
          setSignals(Array.isArray(data.signals) ? data.signals : []);
          setTrades(Array.isArray(data.trades) ? data.trades : []);
          setStats(data.stats || null);
          if (data.config) setConfig(data.config);
          setPipelineState(data.stats?.state || {
            brick_count: data.total_bricks || 0,
            last_brick_direction: null,
            last_swing_label: null,
            bull_run_count: 0,
            bear_run_count: 0,
            active_position: false,
            session_trades: data.total_trades || 0,
            session_pnl_bricks: 0,
            total_trades: data.total_trades || 0,
            total_pnl_bricks: data.total_pnl_bricks || 0,
          });
          setLoading(false);
          return true; // Cache hit
        }
      }
    } catch (e) {
      console.warn("[RenkoPage] Cache load failed:", e.message);
    }
    return false; // Cache miss
  }, []);

  // Fetch all data from backend
  const fetchAllData = useCallback(
    async (showLoading = true) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        // Fetch all endpoints in parallel via BFF
        const [stateData, bricksData, classifiedData, signalsData, tradesData, statsData] =
          await Promise.allSettled([
            renkoApiFetch("state", { params: { symbol } }),
            renkoApiFetch("bricks", { params: { symbol, last_n: "100" } }),
            renkoApiFetch("classified", { params: { symbol, last_n: "100" } }),
            renkoApiFetch("signals", { params: { symbol, last_n: "50" } }),
            renkoApiFetch("trades", { params: { symbol, last_n: "50" } }),
            renkoApiFetch("stats", { params: { symbol } }),
          ]);

        if (controller.signal.aborted) return;

        // Process results — use fulfilled values, ignore rejected
        if (stateData.status === "fulfilled") {
          setPipelineState(stateData.value);
        }
        if (bricksData.status === "fulfilled") {
          setBricks(
            Array.isArray(bricksData.value) ? bricksData.value : []
          );
        }
        if (classifiedData.status === "fulfilled") {
          setClassified(
            Array.isArray(classifiedData.value) ? classifiedData.value : []
          );
        }
        if (signalsData.status === "fulfilled") {
          setSignals(
            Array.isArray(signalsData.value) ? signalsData.value : []
          );
        }
        if (tradesData.status === "fulfilled") {
          setTrades(
            Array.isArray(tradesData.value) ? tradesData.value : []
          );
        }
        if (statsData.status === "fulfilled") {
          setStats(statsData.value);
          // Extract config from stats
          if (statsData.value?.config) {
            setConfig(statsData.value.config);
          }
        }

        // Check if all failed (likely cold start)
        const allFailed = [
          stateData,
          bricksData,
          classifiedData,
          signalsData,
          tradesData,
          statsData,
        ].every((r) => r.status === "rejected");

        if (allFailed) {
          const firstError = [stateData, bricksData, classifiedData, signalsData, tradesData, statsData]
            .find((r) => r.status === "rejected");
          setError(
            firstError?.reason?.message ||
              "Backend unavailable. It may be starting up."
          );
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e.message || "Failed to fetch pipeline data");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [symbol]
  );

  // Initial fetch + auto-refresh
  useEffect(() => {
    // Try loading from Supabase cache first (instant), then fall back to backend
    const initData = async () => {
      const cacheHit = await loadCachedSnapshot(symbol);
      if (!cacheHit) {
        // No cache — fetch from backend (may be empty if not warmed)
        await fetchAllData(true);
      }
    };
    initData();

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchAllData(false);
      }, 5000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchAllData, autoRefresh]);

  // Handle visibility change — pause/resume polling
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (autoRefresh) {
        fetchAllData(false);
        intervalRef.current = setInterval(() => {
          fetchAllData(false);
        }, 5000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [autoRefresh, fetchAllData]);

  // Handle symbol change — load cache for new symbol
  const handleSymbolChange = useCallback(async (newSymbol) => {
    setSymbol(newSymbol);
    setLoading(true);
    setBricks([]);
    setClassified([]);
    setSignals([]);
    setTrades([]);
    setPipelineState(null);

    // Try loading cached data for the new symbol
    const cacheHit = await loadCachedSnapshot(newSymbol);
    if (!cacheHit) {
      // No cache — fetch from backend pipeline
      await fetchAllData(true);
    }
  }, [loadCachedSnapshot, fetchAllData]);

  // Handle save config
  const handleSaveConfig = async (newConfig) => {
    setSaving(true);
    try {
      await renkoApiFetch("config", {
        method: "POST",
        body: newConfig,
      });
      notifySuccess("Configuration saved. Pipeline has been reset.");
      await fetchAllData(true);
    } catch (e) {
      notifyError(`Failed to save config: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle reset pipeline
  const handleResetPipeline = async () => {
    setSaving(true);
    try {
      await renkoApiFetch("reset", {
        method: "POST",
        params: { symbol },
      });
      notifySuccess("Pipeline reset successfully.");
      await fetchAllData(true);
    } catch (e) {
      notifyError(`Failed to reset pipeline: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle process tick (manual) — uses latest market price
  const handleProcessTick = async () => {
    try {
      // Fetch the latest price from our BFF endpoint
      const priceRes = await fetch(`/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`);
      let tickPrice;
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        tickPrice = priceData.price || priceData.close || 500;
      } else {
        // Fallback: use last known price from pipeline state + small random
        const lastPrice = bricks.length > 0 ? bricks[bricks.length - 1].close_price : 500;
        tickPrice = lastPrice + (Math.random() - 0.5) * 1.0;
      }

      const result = await renkoApiFetch("tick", {
        method: "POST",
        body: { price: Math.round(tickPrice * 100) / 100, symbol },
      });

      if (result?.bricks_created?.length > 0) {
        notifySuccess(
          `Brick created! ${result.bricks_created.length} new, signal: ${result.signal?.pattern_type || "none"}`
        );
      } else {
        notifySuccess("Tick processed: no new bricks (price didn't move enough)");
      }

      // Refresh data
      await fetchAllData(false);
    } catch (e) {
      notifyError(`Tick failed: ${e.message}`);
    }
  };

  // Handle warm-up pipeline with historical data
  const [warmingUp, setWarmingUp] = useState(false);

  const handleWarmUp = async () => {
    setWarmingUp(true);
    try {
      const res = await fetch("/api/renko/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, period: "6mo" }),
      });

      const data = await res.json();

      if (data.success) {
        // Populate state from the warmup response (includes cached data)
        if (data.bricks) setBricks(data.bricks);
        if (data.classified) setClassified(data.classified);
        if (data.signals) setSignals(data.signals);
        if (data.trades) setTrades(data.trades);
        if (data.stats) {
          setStats(data.stats);
          if (data.stats.state) setPipelineState(data.stats.state);
          if (data.stats.config) setConfig(data.stats.config);
        }

        const cachedLabel = data.cached ? " (from cache)" : "";
        notifySuccess(
          `Warm-up complete!${cachedLabel} ${data.prices_fed} prices → ${data.total_bricks} bricks, ${data.total_trades} trades`
        );
      } else {
        notifyError(`Warm-up failed: ${data.error || "Unknown error"}`);
      }
    } catch (e) {
      notifyError(`Warm-up failed: ${e.message}`);
    } finally {
      setWarmingUp(false);
    }
  };

  // Pipeline status
  const isActive = pipelineState?.brick_count > 0;
  const lastDirection = pipelineState?.last_brick_direction;
  const sessionPnl = pipelineState?.session_pnl_bricks ?? 0;

  return (
    <RenkoErrorBoundary>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Renko HFT Pipeline
            </h1>
            <span
              className={`badge ${isActive ? "badge-success" : "badge-ghost"}`}
            >
              {isActive ? "Active" : "Idle"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Symbol selector */}
            <select
              className="select select-sm select-bordered font-mono"
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Auto-refresh toggle */}
            <div className="form-control">
              <label className="label cursor-pointer gap-2">
                <span className="label-text text-xs">Auto</span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-primary"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              </label>
            </div>

            {/* Warm Up button — feeds 6mo of historical data */}
            <button
              className={`btn btn-sm ${warmingUp ? "btn-disabled" : "btn-secondary"}`}
              onClick={handleWarmUp}
              disabled={warmingUp}
            >
              {warmingUp ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Warming...
                </>
              ) : (
                <>🔥 Warm Up</>
              )}
            </button>

            {/* Process tick button */}
            <button
              className="btn btn-sm btn-primary"
              onClick={handleProcessTick}
              disabled={warmingUp}
            >
              ⚡ Tick
            </button>

            {/* Refresh button */}
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => fetchAllData(true)}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Pipeline State Banner */}
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            {loading && !pipelineState ? (
              <div className="flex items-center justify-center gap-3 py-6">
                <span className="loading loading-spinner loading-md text-primary" />
                <span className="text-base-content/50">
                  Loading pipeline state...
                </span>
              </div>
            ) : error && !pipelineState ? (
              <div className="alert alert-warning">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <div>
                  <h3 className="font-bold text-sm">Backend Unavailable</h3>
                  <div className="text-xs opacity-80">{error}</div>
                  <button
                    className="btn btn-xs btn-ghost mt-2"
                    onClick={() => fetchAllData(true)}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Quick Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  <MetricCard
                    label="Bricks"
                    value={pipelineState?.brick_count ?? 0}
                    icon="🧱"
                  />
                  <MetricCard
                    label="Last Direction"
                    value={
                      lastDirection ? (
                        <span
                          className={
                            lastDirection?.toUpperCase() === "UP"
                              ? "text-success"
                              : "text-error"
                          }
                        >
                          {lastDirection?.toUpperCase() === "UP" ? "▲" : "▼"}{" "}
                          {lastDirection?.toUpperCase()}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                    icon="📈"
                  />
                  <MetricCard
                    label="Last Swing"
                    value={pipelineState?.last_swing_label || "—"}
                    icon="🔄"
                  />
                  <MetricCard
                    label="Position"
                    value={
                      pipelineState?.active_position ? (
                        <span
                          className={
                            pipelineState.active_position.direction === "LONG" ||
                            pipelineState.active_position.direction === "BUY"
                              ? "text-success"
                              : "text-error"
                          }
                        >
                          {pipelineState.active_position.direction}
                        </span>
                      ) : (
                        <span className="text-base-content/30">None</span>
                      )
                    }
                    icon="📍"
                    colorClass=""
                  />
                  <MetricCard
                    label="Session P&L"
                    value={`${sessionPnl >= 0 ? "+" : ""}${sessionPnl} br`}
                    icon="💰"
                    colorClass={sessionPnl >= 0 ? "text-success" : "text-error"}
                  />
                  <MetricCard
                    label="Trades"
                    value={pipelineState?.session_trades ?? 0}
                    icon="📋"
                  />
                </div>

                {/* Run counts */}
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-success">▲</span>
                    <span className="text-base-content/50">
                      Bull Runs: {pipelineState?.bull_run_count ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-error">▼</span>
                    <span className="text-base-content/50">
                      Bear Runs: {pipelineState?.bear_run_count ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-base-content/30">
                      Total trades: {pipelineState?.total_trades ?? 0}
                    </span>
                    <span className="text-base-content/30">|</span>
                    <span className="text-base-content/30">
                      Total P&L:{" "}
                      <span
                        className={
                          (pipelineState?.total_pnl_bricks ?? 0) >= 0
                            ? "text-success"
                            : "text-error"
                        }
                      >
                        {pipelineState?.total_pnl_bricks ?? 0} bricks
                      </span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div
          role="tablist"
          className="tabs tabs-boxed bg-base-200 p-1 flex-wrap gap-1"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              className={`tab tab-sm ${activeTab === tab.key ? "tab-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div key={activeTab} className="animate-fade-in-up">
          {activeTab === "bricks" && (
            <BrickChart bricks={bricks} classified={classified} />
          )}
          {activeTab === "signals" && (
            <SignalsPanel
              signals={signals}
              stats={stats}
              state={pipelineState}
            />
          )}
          {activeTab === "trades" && (
            <TradesPanel
              trades={trades}
              state={pipelineState}
              stats={stats}
            />
          )}
          {activeTab === "config" && (
            <ConfigPanel
              config={config}
              onSave={handleSaveConfig}
              onReset={handleResetPipeline}
              saving={saving}
            />
          )}
        </div>
      </div>
    </RenkoErrorBoundary>
  );
}
