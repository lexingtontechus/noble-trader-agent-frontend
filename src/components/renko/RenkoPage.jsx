"use client";

import { useState, useEffect, useCallback, useRef, Component } from "react";
import dynamic from "next/dynamic";
import { notifySuccess, notifyError, notifyWarning } from "@/lib/notifications";
import useRenkoStream from "@/hooks/useRenkoStream";
// NOTE: Do NOT import from renko-client.js here — it pulls in @clerk/nextjs/server
// which requires "server-only" and breaks the client bundle.
// All backend calls go through the BFF route /api/renko/[action] via renkoApiFetch().

// Lazy-load heavy sub-components
const BrickChart = dynamic(() => import("./BrickChart"), { ssr: false });
const SignalsPanel = dynamic(() => import("./SignalsPanel"), { ssr: false });
const TradesPanel = dynamic(() => import("./TradesPanel"), { ssr: false });
const ConfigPanel = dynamic(() => import("./ConfigPanel"), { ssr: false });
const OrderTracker = dynamic(() => import("./OrderTracker"), { ssr: false });
const RiskDashboard = dynamic(() => import("./RiskDashboard"), { ssr: false });
const CampaignPanel = dynamic(() => import("@/components/campaign/CampaignPanel"), { ssr: false });

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
  { key: "orders", label: "📋 Orders", shortLabel: "Orders" },
  { key: "campaigns", label: "🎯 Campaigns", shortLabel: "Campaigns" },
  { key: "config", label: "⚙️ Config", shortLabel: "Config" },
  { key: "risk", label: "🛡️ Risk", shortLabel: "Risk" },
];

// ── Readiness Progress Bar ─────────────────────────────────────────────────

function ReadinessBar({ status, brickCount }) {
  const levels = {
    cold: { pct: 0, color: "bg-error", label: "Cold — needs warmup" },
    warming: { pct: Math.min((brickCount / 50) * 40, 40), color: "bg-warning", label: `Warming — ${brickCount}/50 bricks` },
    warm: { pct: 60, color: "bg-info", label: `Warm — ${brickCount} bricks` },
    hot: { pct: 80, color: "bg-warning", label: `Hot — position open` },
    live_ready: { pct: 100, color: "bg-success", label: "Live — ready to trade" },
  };
  const level = levels[status] || levels.cold;

  return (
    <div className="flex items-center gap-2 text-xs w-full">
      <div className="flex-1">
        <progress
          className={`progress ${level.color} w-full h-2`}
          value={level.pct}
          max="100"
        />
      </div>
      <span className="text-base-content/50 whitespace-nowrap min-w-[120px]">
        {level.label}
      </span>
    </div>
  );
}

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
  const [streaming, setStreaming] = useState(false);

  // Data state
  const [pipelineState, setPipelineState] = useState(null);
  const [bricks, setBricks] = useState([]);
  const [classified, setClassified] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState({});

  // Heartbeat state (instant data freshness check from trading:heartbeat:{symbol})
  const [heartbeat, setHeartbeat] = useState(null);

  // ── Live Renko Stream ──────────────────────────────────────────────
  const renkoStream = useRenkoStream(symbol, {
    enabled: streaming,
    onBrick: (brick) => {
      notifySuccess(
        `New ${brick.direction || ""} brick at ${brick.close_price ?? brick.close ?? "?"}`
      );
      fetchAllData(false);
    },
    onSignal: (signal) => {
      notifyWarning(`Signal: ${signal.pattern_type || signal.type || "unknown"}`, 8000);
      fetchAllData(false);
    },
    onError: (err) => {
      notifyError(`Stream error: ${err.message}`);
    },
  });

  // Refs for cleanup
  const abortControllerRef = useRef(null);
  const intervalRef = useRef(null);

  // ── Heartbeat-first initialization (O(1) Redis check) ─────────────
  // Returns: 'fresh' | 'stale' | 'cold' | false
  const checkHeartbeat = useCallback(async (sym) => {
    try {
      const hb = await renkoApiFetch("heartbeat", { params: { symbol: sym } });
      if (hb && hb.available) {
        setHeartbeat(hb);
        // Set minimal pipeline state from heartbeat (instant, no warmup needed)
        setPipelineState((prev) => ({
          ...prev,
          brick_count: hb.brick_count ?? 0,
          last_brick_direction: hb.direction || prev?.last_brick_direction,
          active_position: hb.has_position || false,
        }));

        if (hb.is_fresh && hb.status !== "cold") {
          // Data is fresh and pipeline is not cold — skip warmup entirely
          setLoading(false);
          return "fresh";
        } else if (hb.status !== "cold" && hb.brick_count > 0) {
          // Pipeline is warm but stale — show data, trigger background refresh
          return "stale";
        } else {
          // Pipeline is cold — needs full warmup
          return "cold";
        }
      }
    } catch (e) {
      console.warn("[RenkoPage] Heartbeat check failed:", e.message);
    }
    return false;
  }, []);

  // ── Load cached snapshot from Supabase (fallback, no backend call) ──
  // Returns: 'fresh' | 'stale' | false
  const loadCachedSnapshot = useCallback(async (sym) => {
    try {
      const res = await fetch(`/api/renko/warmup?symbol=${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cached) {
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
            total_pnl_bricks: 0,
          });
          setLoading(false);
          return data.stale ? "stale" : "fresh";
        }
      }
    } catch (e) {
      console.warn("[RenkoPage] Cache load failed:", e.message);
    }
    return false;
  }, []);

  // Fetch all data from backend — accepts optional symbolOverride to avoid stale closure
  const fetchAllData = useCallback(
    async (showLoading = true, symbolOverride = null) => {
      const activeSymbol = symbolOverride || symbol;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const [stateData, bricksData, classifiedData, signalsData, tradesData, statsData] =
          await Promise.allSettled([
            renkoApiFetch("state", { params: { symbol: activeSymbol } }),
            renkoApiFetch("bricks", { params: { symbol: activeSymbol, last_n: "100" } }),
            renkoApiFetch("classified", { params: { symbol: activeSymbol, last_n: "100" } }),
            renkoApiFetch("signals", { params: { symbol: activeSymbol, last_n: "50" } }),
            renkoApiFetch("trades", { params: { symbol: activeSymbol, last_n: "50" } }),
            renkoApiFetch("stats", { params: { symbol: activeSymbol } }),
          ]);

        if (controller.signal.aborted) return;

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
          if (statsData.value?.config) {
            setConfig(statsData.value.config);
          }
        }

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

  // ── Initial fetch: heartbeat-first, then cache, then warmup ────────
  useEffect(() => {
    const initData = async () => {
      // Step 1: Check heartbeat (O(1) Redis — sub-ms)
      const hbStatus = await checkHeartbeat(symbol);

      if (hbStatus === "fresh") {
        // Heartbeat says data is fresh — load snapshot for full data, skip warmup
        const cacheStatus = await loadCachedSnapshot(symbol);
        if (cacheStatus === "fresh" || cacheStatus === "stale") {
          return; // Got cached data — done!
        }
        // No cached snapshot but heartbeat is fresh — fetch from backend
        fetchAllData(false);
        return;
      }

      if (hbStatus === "stale") {
        // Data exists but stale — load cached snapshot for display, trigger warmup
        const cacheStatus = await loadCachedSnapshot(symbol);
        if (!cacheStatus) {
          await warmUpSymbol(symbol);
        } else {
          warmUpSymbol(symbol); // Background refresh
        }
        return;
      }

      if (hbStatus === "cold") {
        // Pipeline is cold — needs full warmup
        await warmUpSymbol(symbol);
        return;
      }

      // Heartbeat failed entirely — fall back to old cache → warmup flow
      const cacheStatus = await loadCachedSnapshot(symbol);
      if (cacheStatus === "fresh") {
        // Fresh cache — done
      } else if (cacheStatus === "stale") {
        warmUpSymbol(symbol);
      } else {
        await warmUpSymbol(symbol);
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

  // Warm up a specific symbol (used by handleSymbolChange and handleWarmUp)
  const warmUpSymbol = useCallback(async (sym) => {
    setWarmingUp(true);
    try {
      const data = await renkoApiFetch("warmup", {
        method: "POST",
        body: { symbol: sym, mode: "auto", include_state: true },
      });

      if (data.status === "ok") {
        if (data.bricks) setBricks(data.bricks);
        if (data.classified) setClassified(data.classified);
        if (data.signals) setSignals(data.signals);
        if (data.trades) setTrades(data.trades);
        if (data.stats) {
          setStats(data.stats);
          if (data.stats.state) setPipelineState(data.stats.state);
          if (data.stats.config) setConfig(data.stats.config);
        } else if (data.state) {
          setPipelineState(data.state);
        }

        const modeLabel = data.mode ? ` (${data.mode})` : "";
        const sourceLabel = data.source === "snapshot_restore" ? " (from cache)" :
                           data.source === "up_to_date" ? " (already up to date)" : "";
        const newBricksLabel = data.new_bricks ? ` (+${data.new_bricks} new)` : "";
        notifySuccess(
          `${sym} warm-up complete!${sourceLabel}${modeLabel} ${data.prices_fed || 0} prices → ${data.brick_count} bricks${newBricksLabel}`
        );
      } else {
        notifyError(`${sym} warm-up failed: ${data.detail || data.error || "Unknown error"}`);
      }
    } catch (e) {
      notifyError(`${sym} warm-up failed: ${e.message}`);
    } finally {
      setWarmingUp(false);
    }
  }, []);

  // Handle symbol change — heartbeat-first, then cache, then warmup
  const handleSymbolChange = useCallback(async (newSymbol) => {
    setSymbol(newSymbol);
    setLoading(true);
    setBricks([]);
    setClassified([]);
    setSignals([]);
    setTrades([]);
    setPipelineState(null);
    setHeartbeat(null);
    setError(null);

    // Step 1: Check heartbeat (instant)
    const hbStatus = await checkHeartbeat(newSymbol);
    if (hbStatus === "fresh") {
      const cacheStatus = await loadCachedSnapshot(newSymbol);
      if (cacheStatus) return;
      fetchAllData(false, newSymbol);
      return;
    }
    if (hbStatus === "stale") {
      const cacheStatus = await loadCachedSnapshot(newSymbol);
      warmUpSymbol(newSymbol);
      return;
    }

    // Step 2: No heartbeat or cold — try cache
    const cacheStatus = await loadCachedSnapshot(newSymbol);
    if (cacheStatus === "fresh") {
      return;
    }
    if (cacheStatus === "stale") {
      warmUpSymbol(newSymbol);
      return;
    }

    // Step 3: No cache — full warmup
    await warmUpSymbol(newSymbol);
  }, [checkHeartbeat, loadCachedSnapshot, warmUpSymbol]);

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
      const priceRes = await fetch(`/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`);
      let tickPrice;
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        tickPrice = priceData.price || priceData.close || 500;
      } else {
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

      await fetchAllData(false);
    } catch (e) {
      notifyError(`Tick failed: ${e.message}`);
    }
  };

  // Warming-up state (used by warmUpSymbol)
  const [warmingUp, setWarmingUp] = useState(false);

  // Manual warm-up button handler (uses shared warmUpSymbol)
  const handleWarmUp = () => warmUpSymbol(symbol);

  // Pipeline status — use heartbeat when available for richer info
  const pipelineStatus = heartbeat?.status || (pipelineState?.brick_count > 0 ? "warm" : "cold");
  const isActive = pipelineState?.brick_count > 0;
  const lastDirection = pipelineState?.last_brick_direction;
  const sessionPnl = pipelineState?.session_pnl_bricks ?? 0;

  // Heartbeat badge color
  const statusBadgeClass = {
    cold: "badge-ghost",
    warming: "badge-warning",
    warm: "badge-info",
    hot: "badge-warning",
    live_ready: "badge-success",
  }[pipelineStatus] || "badge-ghost";

  return (
    <RenkoErrorBoundary>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Renko HFT Pipeline
            </h1>
            <span className={`badge ${statusBadgeClass}`}>
              {pipelineStatus === "live_ready" ? "Live" :
               pipelineStatus === "warm" ? "Active" :
               pipelineStatus === "warming" ? "Warming" :
               pipelineStatus === "hot" ? "In Position" :
               "Idle"}
            </span>
            {heartbeat?.last_price > 0 && (
              <span className="text-base-content/50 font-mono text-sm">
                ${heartbeat.last_price.toFixed(2)}
              </span>
            )}
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

            {/* Warm Up button */}
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

            {/* Live Stream toggle */}
            <button
              className={`btn btn-sm ${streaming ? "btn-accent" : "btn-outline"}`}
              onClick={() => setStreaming(!streaming)}
              title={streaming ? "Stop live stream" : "Start live stream"}
            >
              {streaming ? "🔴 Live" : "⚪ Stream"}
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
                {/* Readiness Progress Bar */}
                <ReadinessBar
                  status={pipelineStatus}
                  brickCount={pipelineState?.brick_count ?? 0}
                />

                {/* Quick Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-2">
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

                {/* Stream Status + Heartbeat Info */}
                <div className="flex items-center gap-3 mt-2 text-xs">
                  {streaming ? (
                    renkoStream.connected ? (
                      <span className="badge badge-success badge-sm gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                        </span>
                        LIVE
                      </span>
                    ) : (
                      <span className="badge badge-warning badge-sm gap-1">
                        <span className="loading loading-spinner loading-xs"></span>
                        Connecting...
                      </span>
                    )
                  ) : (
                    <span className="badge badge-ghost badge-sm gap-1">
                      ⚪ Idle
                    </span>
                  )}
                  {renkoStream.lastPrice != null && streaming && (
                    <span className="text-base-content/50 font-mono">
                      Last: ${renkoStream.lastPrice.toFixed(2)}
                    </span>
                  )}
                  {renkoStream.lastTickTime && streaming && (
                    <span className="text-base-content/30">
                      {renkoStream.lastTickTime.toLocaleTimeString()}
                    </span>
                  )}
                  {streaming && renkoStream.tickCount > 0 && (
                    <span className="text-base-content/30">
                      Ticks: {renkoStream.tickCount} | Bricks: {renkoStream.brickCount}
                    </span>
                  )}
                  {/* Heartbeat freshness indicator */}
                  {heartbeat && (
                    <span className="text-base-content/30 ml-auto">
                      {heartbeat.is_fresh ? "✓ Fresh" : `Last: ${heartbeat.age_seconds ?? "?"}s ago`}
                      {heartbeat.source_mode && ` (${heartbeat.source_mode})`}
                    </span>
                  )}
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
          {activeTab === "orders" && (
            <OrderTracker symbol={symbol} />
          )}
          {activeTab === "config" && (
            <ConfigPanel
              config={config}
              onSave={handleSaveConfig}
              onReset={handleResetPipeline}
              saving={saving}
            />
          )}
          {activeTab === "campaigns" && (
            <CampaignPanel
              signals={signals}
              symbol={symbol}
              stats={stats}
            />
          )}
          {activeTab === "risk" && (
            <RiskDashboard
              trades={trades}
              stats={stats}
              state={pipelineState}
              config={config}
              bricks={bricks}
            />
          )}
        </div>
      </div>
    </RenkoErrorBoundary>
  );
}
