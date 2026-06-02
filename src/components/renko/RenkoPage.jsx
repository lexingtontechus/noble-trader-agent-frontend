"use client";

import { useState, useEffect, useCallback, useRef, Component } from "react";
import dynamic from "next/dynamic";
import { notifySuccess, notifyError, notifyWarning } from "@/lib/notifications";
import useRenkoStream from "@/hooks/useRenkoStream";

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

// ── Readiness helpers ────────────────────────────────────────────────────────

// Compute readiness from brick count (matching pipeline.py logic)
function getReadiness(brickCount, hasPosition) {
  if (hasPosition) return { level: "hot", pct: 80, color: "bg-warning", label: "Hot — position open" };
  if (brickCount >= 200) return { level: "live_ready", pct: 100, color: "bg-success", label: "Live — ready to trade" };
  if (brickCount >= 50) return { level: "warm", pct: 60, color: "bg-info", label: `Warm — ${brickCount} bricks` };
  if (brickCount > 0) return { level: "warming", pct: Math.min((brickCount / 50) * 40, 40), color: "bg-warning", label: `Warming — ${brickCount}/50 bricks` };
  return { level: "cold", pct: 0, color: "bg-error", label: "Cold — no data" };
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

  // Handle cold starts / non-JSON responses
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Backend is starting up. Please wait a moment.");
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Backend returned an invalid response. The service may be starting up.");
  }

  if (!res.ok) {
    // Provide user-friendly messages for known error codes
    if (data.code === "COLD_START") {
      throw new Error("Backend is starting up. Please wait a moment and try again.");
    }
    if (data.code === "INVALID_RESPONSE") {
      throw new Error("Backend returned an invalid response. Please try again in a moment.");
    }
    if (data.code === "TIMEOUT") {
      throw new Error("Backend is not responding. It may be starting up — please try again.");
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

// ── Main Component ───────────────────────────────────────────────────────────
//
// Architecture: Cache-first with auto-rebuild fallback.
// The Redis/Supabase snapshot (renko:snapshot:{symbol}:{brickSize}) already
// contains ALL data: bricks, classified, signals, trades, stats, config, position.
// The backend's _get_pipeline_async() auto-restores from snapshot on first access.
//
// Flow:
//   1. Load from cache (GET /api/renko/warmup?symbol=X) — L1→L2→L3 fallback
//   2. If fresh cache hit → render immediately, no backend call
//   3. If stale cache → render + background refresh from backend
//   4. If cache miss → auto-rebuild via single warmup POST (backend snapshot
//      restore or Yahoo fetch). No more 6-call fetchFromBackend that all fail
//      independently on cold start.
//   5. Live stream feeds real-time ticks for intraday updates
//   6. "Force Rebuild" button available for manual full Yahoo fetch

export default function RenkoPage() {
  const [activeTab, setActiveTab] = useState("bricks");
  const [symbol, setSymbol] = useState("SPY");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  // Data state — populated from snapshot cache
  const [pipelineState, setPipelineState] = useState(null);
  const [bricks, setBricks] = useState([]);
  const [classified, setClassified] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState({});
  const [snapshotSource, setSnapshotSource] = useState(null); // 'redis' | 'supabase' | null
  const [snapshotAge, setSnapshotAge] = useState(null); // seconds

  // ── Live Renko Stream ──────────────────────────────────────────────
  const renkoStream = useRenkoStream(symbol, {
    enabled: streaming,
    onBrick: (brick) => {
      notifySuccess(
        `New ${brick.direction || ""} brick at ${brick.close_price ?? brick.close ?? "?"}`
      );
      loadFromCache(symbol); // Refresh from cache after brick event
    },
    onSignal: (signal) => {
      notifyWarning(`Signal: ${signal.pattern_type || signal.type || "unknown"}`, 8000);
      loadFromCache(symbol);
    },
    onError: (err) => {
      notifyError(`Stream error: ${err.message}`);
    },
  });

  // Refs for cleanup
  const intervalRef = useRef(null);
  const abortRef = useRef(null);

  // ── Populate state from snapshot data ───────────────────────────────
  const populateFromSnapshot = useCallback((data) => {
    setBricks(Array.isArray(data.bricks) ? data.bricks : []);
    setClassified(Array.isArray(data.classified) ? data.classified : []);
    setSignals(Array.isArray(data.signals) ? data.signals : []);
    setTrades(Array.isArray(data.trades) ? data.trades : []);
    setStats(data.stats || null);
    if (data.config) setConfig(data.config);
    setSnapshotSource(data.source || null);

    // Compute pipeline state from snapshot fields
    const brickCount = data.total_bricks || data.brick_count || 0;
    const totalTrades = data.total_trades || 0;
    const totalPnlBricks = data.total_pnl_bricks || 0;
    const journalStats = data.stats?.journal_stats || data.stats?.journal || {};

    // Extract last direction from bricks array
    const lastBrick = Array.isArray(data.bricks) && data.bricks.length > 0
      ? data.bricks[data.bricks.length - 1]
      : null;
    const lastDirection = lastBrick?.direction || data.stats?.current_direction || null;
    const lastSwing = Array.isArray(data.classified) && data.classified.length > 0
      ? data.classified[data.classified.length - 1]?.label || null
      : null;

    setPipelineState({
      brick_count: brickCount,
      last_brick_direction: lastDirection,
      last_swing_label: lastSwing,
      bull_run_count: data.stats?.bull_run_count ?? 0,
      bear_run_count: data.stats?.bear_run_count ?? 0,
      active_position: data.stats?.active_position || null,
      session_trades: totalTrades,
      session_pnl_bricks: totalPnlBricks,
      total_trades: totalTrades,
      total_pnl_bricks: totalPnlBricks,
      readiness: data.stats?.readiness || getReadiness(brickCount, !!data.stats?.active_position),
    });

    // Compute snapshot age
    if (data.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      setSnapshotAge(Math.round(age / 1000));
    } else if (data.stats?.snapshot_ts) {
      const age = Date.now() / 1000 - data.stats.snapshot_ts;
      setSnapshotAge(Math.round(age));
    } else {
      setSnapshotAge(null);
    }
  }, []);

  // ── Load from cache (L1 → L2 → L3 backend fallback) ──────────────────
  // This is the PRIMARY data loading method. The GET /api/renko/warmup
  // endpoint reads from Upstash Redis L1, then Supabase L2, then falls
  // back to the backend warmup POST (L3) which auto-restores from its
  // own L1/L2 or fetches from Yahoo. No separate backend pipeline call
  // needed — the snapshot contains everything.
  const loadFromCache = useCallback(async (sym, timeoutMs = 8000) => {
    try {
      const res = await fetch(`/api/renko/warmup?symbol=${encodeURIComponent(sym)}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || `Cache lookup failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.cached) {
        populateFromSnapshot(data);
        setLoading(false);
        return data.stale ? "stale" : "fresh";
      }
      return "miss";
    } catch (e) {
      console.warn("[RenkoPage] Cache load failed:", e.message);
      return "error";
    }
  }, [populateFromSnapshot]);

  // ── Fallback: fetch from backend GET endpoints ─────────────────────
  // Used ONLY for background refresh of stale data (where the pipeline
  // already exists in the backend's memory). NOT used for initial load
  // on cache miss — that goes through forceRebuild instead (single warmup
  // POST with retry logic, vs 6 separate GETs that all fail on cold start).
  const fetchFromBackend = useCallback(async (sym, showLoading = true) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const [stateData, bricksData, classifiedData, signalsData, tradesData, statsData] =
        await Promise.allSettled([
          renkoApiFetch("state", { params: { symbol: sym } }),
          renkoApiFetch("bricks", { params: { symbol: sym, last_n: "100" } }),
          renkoApiFetch("classified", { params: { symbol: sym, last_n: "100" } }),
          renkoApiFetch("signals", { params: { symbol: sym, last_n: "50" } }),
          renkoApiFetch("trades", { params: { symbol: sym, last_n: "50" } }),
          renkoApiFetch("stats", { params: { symbol: sym } }),
        ]);

      if (controller.signal.aborted) return;

      if (stateData.status === "fulfilled") setPipelineState(stateData.value);
      if (bricksData.status === "fulfilled") setBricks(Array.isArray(bricksData.value) ? bricksData.value : []);
      if (classifiedData.status === "fulfilled") setClassified(Array.isArray(classifiedData.value) ? classifiedData.value : []);
      if (signalsData.status === "fulfilled") setSignals(Array.isArray(signalsData.value) ? signalsData.value : []);
      if (tradesData.status === "fulfilled") setTrades(Array.isArray(tradesData.value) ? tradesData.value : []);
      if (statsData.status === "fulfilled") {
        setStats(statsData.value);
        if (statsData.value?.config) setConfig(statsData.value.config);
      }

      const allFailed = [stateData, bricksData, classifiedData, signalsData, tradesData, statsData]
        .every((r) => r.status === "rejected");
      if (allFailed) {
        const firstError = [stateData, bricksData, classifiedData, signalsData, tradesData, statsData]
          .find((r) => r.status === "rejected");
        setError(firstError?.reason?.message || "Backend unavailable. It may be starting up.");
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e.message || "Failed to fetch pipeline data");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // ── Force Rebuild (full Yahoo fetch — the old "warmup") ─────────────
  // Only needed when snapshot is missing or corrupted. The backend handles
  // all the Yahoo fetch + pipeline processing internally.
  const forceRebuild = useCallback(async (sym, _retryCount = 0) => {
    setRebuilding(true);
    try {
      const res = await fetch("/api/renko/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, period: "6mo", mode: "auto", include_state: true }),
        signal: AbortSignal.timeout(120000),
      });

      // Handle non-JSON (cold start)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error("Backend is starting up. Please try again.");
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Backend returned invalid response. It may be starting up.");
      }

      if (!res.ok) {
        throw new Error(data.error || data.detail || `Rebuild failed (HTTP ${res.status})`);
      }

      if (data.success || data.status === "ok") {
        // Populate from the warmup response (includes full state)
        const brickCount = data.brick_count ?? data.total_bricks ?? 0;
        populateFromSnapshot({
          bricks: data.bricks || [],
          classified: data.classified || [],
          signals: data.signals || [],
          trades: data.trades || [],
          stats: data.stats || {},
          config: data.config || data.stats?.config || {},
          total_bricks: brickCount,
          total_trades: data.total_trades || 0,
          total_pnl_bricks: data.total_pnl_bricks || 0,
          source: data.source || "yahoo_fetch",
          updated_at: new Date().toISOString(),
        });
        setLoading(false);

        const sourceLabel = data.source === "snapshot_restore" ? " (from cache)" :
                           data.source === "up_to_date" ? " (already current)" :
                           data.source === "stale_snapshot_restore" ? " (restored stale)" : "";
        notifySuccess(
          `${sym} rebuild complete!${sourceLabel} ${data.prices_fed || 0} prices → ${brickCount} bricks`
        );
      } else {
        throw new Error(data.error || data.detail || "Unknown error");
      }
    } catch (e) {
      // Auto-retry once on transient errors
      const isTransient = e.message?.includes("starting up") ||
                          e.message?.includes("invalid response") ||
                          e.message?.includes("not responding");
      if (isTransient && _retryCount < 1) {
        notifyWarning("Backend is starting up — retrying in 5s...");
        await new Promise((r) => setTimeout(r, 5000));
        return forceRebuild(sym, _retryCount + 1);
      }
      notifyError(`${sym} rebuild failed: ${e.message}`);
    } finally {
      setRebuilding(false);
    }
  }, [populateFromSnapshot]);

  // ── Initial load + auto-refresh ──────────────────────────────────────
  useEffect(() => {
    const initData = async () => {
      // Step 1: Try L1/L2/L3 cache (BFF has 3-tier fallback)
      // Use 65s timeout to accommodate BFF's L3 backend warmup fallback (up to 60s)
      const cacheStatus = await loadFromCache(symbol, 65000);

      if (cacheStatus === "fresh") {
        // Fresh cache — done! No backend call needed.
        return;
      }

      if (cacheStatus === "stale") {
        // Stale cache — data is displayed, but we should refresh from backend
        // in the background. The backend auto-restores from its own L1/L2.
        fetchFromBackend(symbol, false);
        return;
      }

      // Cache miss — auto-rebuild via single warmup POST instead of 6
      // separate GET calls. The warmup POST proxies to the backend's
      // /renko/warmup endpoint which handles: snapshot restore (fast) or
      // Yahoo fetch (slow). It also has retry logic for cold starts.
      // This avoids the 6-call fetchFromBackend which all fail independently
      // when the backend is cold starting on Render.
      await forceRebuild(symbol);
    };
    initData();

    // Auto-refresh: just reload from cache (fast, no backend round-trip)
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadFromCache(symbol);
      }, 15000); // 15s — less aggressive than 5s since we're just checking cache
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [symbol, autoRefresh, loadFromCache, fetchFromBackend]);

  // Handle visibility change — pause/resume polling
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (autoRefresh) {
        loadFromCache(symbol);
        intervalRef.current = setInterval(() => {
          loadFromCache(symbol);
        }, 15000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [autoRefresh, symbol, loadFromCache]);

  // Handle symbol change
  const handleSymbolChange = useCallback(async (newSymbol) => {
    setSymbol(newSymbol);
    setLoading(true);
    setBricks([]);
    setClassified([]);
    setSignals([]);
    setTrades([]);
    setPipelineState(null);
    setError(null);
    setSnapshotSource(null);
    setSnapshotAge(null);

    // Try cache first (long timeout for L3 fallback)
    const cacheStatus = await loadFromCache(newSymbol, 65000);
    if (cacheStatus === "fresh" || cacheStatus === "stale") {
      return;
    }
    // Cache miss — auto-rebuild (single warmup call instead of 6 fragile GETs)
    await forceRebuild(newSymbol);
  }, [loadFromCache, forceRebuild]);

  // Handle save config
  const handleSaveConfig = async (newConfig) => {
    setSaving(true);
    try {
      await renkoApiFetch("config", {
        method: "POST",
        body: newConfig,
      });
      notifySuccess("Configuration saved. Pipeline has been reset.");
      // Reload from cache after config change
      await loadFromCache(symbol);
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
      await loadFromCache(symbol);
    } catch (e) {
      notifyError(`Failed to reset pipeline: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle manual refresh (cache re-read)
  const handleRefresh = () => loadFromCache(symbol);

  // Pipeline status — derived from data, no separate endpoint needed
  const brickCount = pipelineState?.brick_count ?? 0;
  const hasPosition = !!pipelineState?.active_position;
  const readiness = pipelineState?.readiness || getReadiness(brickCount, hasPosition);
  const isActive = brickCount > 0;
  const lastDirection = pipelineState?.last_brick_direction;
  const sessionPnl = pipelineState?.session_pnl_bricks ?? 0;

  // Status badge from readiness
  const statusBadgeClass = {
    cold: "badge-ghost",
    warming: "badge-warning",
    warm: "badge-info",
    hot: "badge-warning",
    live_ready: "badge-success",
  }[readiness.level] || "badge-ghost";

  const statusLabel = {
    cold: "Idle",
    warming: "Warming",
    warm: "Active",
    hot: "In Position",
    live_ready: "Live",
  }[readiness.level] || "Idle";

  return (
    <RenkoErrorBoundary>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Renko Pipeline
            </h1>
            <span className={`badge ${statusBadgeClass}`}>
              {statusLabel}
            </span>
            {snapshotSource && (
              <span className="text-base-content/30 text-xs font-mono">
                {snapshotSource === "redis" ? "L1" : snapshotSource === "supabase" ? "L2" : ""}
                {snapshotAge != null && ` · ${snapshotAge < 60 ? `${snapshotAge}s` : `${Math.round(snapshotAge / 60)}m`}`}
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

            {/* Refresh button — re-reads from cache */}
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Loading...
                </>
              ) : (
                <>🔄 Refresh</>
              )}
            </button>

            {/* Force Rebuild — full Yahoo fetch (only if needed) */}
            <button
              className={`btn btn-sm ${rebuilding ? "btn-disabled" : "btn-outline"}`}
              onClick={() => forceRebuild(symbol)}
              disabled={rebuilding}
              title="Fetch 6 months of Yahoo data and rebuild pipeline. Only needed if cache is empty or stale."
            >
              {rebuilding ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Rebuilding...
                </>
              ) : (
                <>🔨 Rebuild</>
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
                  Loading pipeline data...
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
                  <h3 className="font-bold text-sm">Data Unavailable</h3>
                  <div className="text-xs opacity-80">{error}</div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={handleRefresh}
                    >
                      Retry Cache
                    </button>
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={() => forceRebuild(symbol)}
                      disabled={rebuilding}
                    >
                      Force Rebuild
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Readiness Progress Bar */}
                <div className="flex items-center gap-2 text-xs w-full">
                  <div className="flex-1">
                    <progress
                      className={`progress ${readiness.color} w-full h-2`}
                      value={readiness.pct}
                      max="100"
                    />
                  </div>
                  <span className="text-base-content/50 whitespace-nowrap min-w-[120px]">
                    {readiness.label}
                  </span>
                </div>

                {/* Quick Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-2">
                  <MetricCard
                    label="Bricks"
                    value={brickCount}
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
                    value={pipelineState?.total_trades ?? 0}
                    icon="📋"
                  />
                </div>

                {/* Stream Status + Cache Info */}
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
                  {/* Cache source indicator */}
                  {snapshotSource && (
                    <span className="text-base-content/30 ml-auto">
                      Source: {snapshotSource === "redis" ? "Redis L1" : snapshotSource === "supabase" ? "Supabase L2" : snapshotSource}
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
