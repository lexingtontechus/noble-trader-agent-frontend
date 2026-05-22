/**
 * Rate Limit Dashboard — P4-6A
 *
 * Displays real-time rate limit status, recent violations, and plan-based
 * limit configuration. Accessible from the Operational page (admin-only).
 *
 * Features:
 *   - Current rate limit tiers with plan-based effective limits
 *   - Recent violations table with filtering
 *   - Top abusers by identifier
 *   - Violation rate trend (last 24h)
 *   - Rate limit status headers from recent API calls
 */

"use client";

import { useState, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

const TIER_COLORS = {
  trade: "error",
  order: "warning",
  backtest: "info",
  ai: "secondary",
  write: "warning",
  data: "success",
  admin: "accent",
  auth: "neutral",
  public: "ghost",
  default: "ghost",
  custom: "ghost",
};

const TIER_DESCRIPTIONS = {
  trade: "Trade execution — strictest (10/min base)",
  order: "Order management (15/min base)",
  backtest: "CPU-heavy backtests (5/5min base)",
  ai: "AI/LLM services — expensive (10/min base)",
  write: "Write operations (10/min base)",
  data: "Data reads — prices, P&L, portfolio (60/min base)",
  admin: "Admin/ops operations (30/min base)",
  auth: "Authentication routes (20/min base)",
  public: "Public endpoints (100/min base)",
  default: "General API (30/min base)",
  custom: "Custom override per route",
};

const PLAN_BADGES = {
  free: "badge-ghost",
  premium: "badge-info",
  institutional: "badge-warning",
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function RateLimitDashboard() {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    tier: "all",
    identifierType: "all",
    hours: 24,
  });
  const [stats, setStats] = useState({
    totalViolations: 0,
    topAbusers: [],
    violationsByTier: {},
    violationsByHour: [],
  });

  // ── Fetch violations ──────────────────────────────────────────────────────

  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        hours: filter.hours,
        tier: filter.tier !== "all" ? filter.tier : "",
        identifierType: filter.identifierType !== "all" ? filter.identifierType : "",
      });

      const res = await fetch(`/api/operational/rate-limit-violations?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setViolations(data.violations || []);
      setStats(data.stats || {
        totalViolations: 0,
        topAbusers: [],
        violationsByTier: {},
        violationsByHour: [],
      });
    } catch (err) {
      console.error("[RateLimitDashboard] Fetch failed:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchViolations, 30_000);
    return () => clearInterval(interval);
  }, [fetchViolations]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rate Limit Dashboard</h2>
          <p className="text-sm text-base-content/60">
            Redis-backed distributed rate limiting with plan-aware limits
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-outline min-h-[44px] sm:min-h-0"
            onClick={fetchViolations}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat bg-base-200 rounded-box p-4">
          <div className="stat-title">Violations ({filter.hours}h)</div>
          <div className="stat-value text-2xl">{stats.totalViolations}</div>
          <div className="stat-desc">Rate limit breaches</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4">
          <div className="stat-title">Top Tier</div>
          <div className="stat-value text-2xl">
            {Object.entries(stats.violationsByTier || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"}
          </div>
          <div className="stat-desc">Most violated tier</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4">
          <div className="stat-title">Unique Users</div>
          <div className="stat-value text-2xl">
            {(stats.topAbusers || []).length}
          </div>
          <div className="stat-desc">Distinct identifiers flagged</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4">
          <div className="stat-title">Backend</div>
          <div className="stat-value text-2xl text-success">Redis</div>
          <div className="stat-desc">Upstash distributed rate limiter</div>
        </div>
      </div>

      {/* ── Rate Limit Tiers Reference ──────────────────────────────────── */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg">Rate Limit Tiers</h3>
          <p className="text-sm text-base-content/60 mb-3">
            Base limits are multiplied by plan: Free = 1x, Premium = 3x, Institutional = 10x
          </p>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Base Limit</th>
                  <th>Free</th>
                  <th>Premium</th>
                  <th>Institutional</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(TIER_DESCRIPTIONS).map(([tier, desc]) => {
                  const baseMax = { trade: 10, order: 15, backtest: 5, ai: 10, write: 10, data: 60, admin: 30, auth: 20, public: 100, default: 30, custom: "?" }[tier];
                  const window = tier === "backtest" ? "5min" : "1min";
                  return (
                    <tr key={tier}>
                      <td>
                        <span className={`badge badge-${TIER_COLORS[tier] || "ghost"} badge-sm`}>
                          {tier}
                        </span>
                      </td>
                      <td className="font-mono">{baseMax}/{window}</td>
                      <td className="font-mono text-error">{baseMax}/{window}</td>
                      <td className="font-mono text-info">{baseMax * 3}/{window}</td>
                      <td className="font-mono text-warning">{baseMax * 10}/{window}</td>
                      <td className="text-xs text-base-content/60">{desc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2">
            {Object.entries(TIER_DESCRIPTIONS).map(([tier, desc]) => {
              const baseMax = { trade: 10, order: 15, backtest: 5, ai: 10, write: 10, data: 60, admin: 30, auth: 20, public: 100, default: 30, custom: "?" }[tier];
              const window = tier === "backtest" ? "5min" : "1min";
              return (
                <div key={tier} className="card bg-base-300 p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`badge badge-${TIER_COLORS[tier] || "ghost"} badge-sm`}>{tier}</span>
                    <span className="font-mono text-sm">{baseMax}/{window}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm mb-2">
                    <div><span className="text-base-content/50">Free: </span><span className="font-mono text-error">{baseMax}/{window}</span></div>
                    <div><span className="text-base-content/50">Premium: </span><span className="font-mono text-info">{baseMax * 3}/{window}</span></div>
                    <div><span className="text-base-content/50">Inst: </span><span className="font-mono text-warning">{baseMax * 10}/{window}</span></div>
                  </div>
                  <div className="text-xs text-base-content/60">{desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="select select-sm select-bordered min-h-[44px] sm:min-h-0"
          value={filter.tier}
          onChange={(e) => setFilter((f) => ({ ...f, tier: e.target.value }))}
        >
          <option value="all">All Tiers</option>
          {Object.keys(TIER_DESCRIPTIONS).map((tier) => (
            <option key={tier} value={tier}>{tier}</option>
          ))}
        </select>
        <select
          className="select select-sm select-bordered min-h-[44px] sm:min-h-0"
          value={filter.identifierType}
          onChange={(e) => setFilter((f) => ({ ...f, identifierType: e.target.value }))}
        >
          <option value="all">All Types</option>
          <option value="user">User</option>
          <option value="ip">IP</option>
        </select>
        <select
          className="select select-sm select-bordered min-h-[44px] sm:min-h-0"
          value={filter.hours}
          onChange={(e) => setFilter((f) => ({ ...f, hours: parseInt(e.target.value) }))}
        >
          <option value={1}>Last 1h</option>
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 3 days</option>
          <option value={168}>Last 7 days</option>
        </select>
      </div>

      {/* ── Violations Table ─────────────────────────────────────────────── */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg">
            Recent Violations
            <span className="badge badge-ghost badge-sm">{violations.length}</span>
          </h3>
          {error && (
            <div className="alert alert-error alert-sm">
              <span>Error: {error}</span>
            </div>
          )}
          {loading && violations.length === 0 ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md"></span>
            </div>
          ) : violations.length === 0 ? (
            <div className="text-center py-8 text-base-content/40">
              No rate limit violations in the selected period. All clear!
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Identifier</th>
                      <th>Type</th>
                      <th>Tier</th>
                      <th>Path</th>
                      <th>Limit</th>
                      <th>Plan</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.slice(0, 50).map((v) => (
                      <tr key={v.id} className="hover">
                        <td className="text-xs font-mono">
                          {new Date(v.created_at).toLocaleTimeString()}
                        </td>
                        <td className="font-mono text-xs max-w-[150px] truncate" title={v.identifier}>
                          {v.identifier?.length > 20
                            ? `${v.identifier.substring(0, 8)}...${v.identifier.slice(-4)}`
                            : v.identifier}
                        </td>
                        <td>
                          <span className={`badge badge-xs ${v.identifier_type === "ip" ? "badge-warning" : "badge-info"}`}>
                            {v.identifier_type}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${TIER_COLORS[v.tier] || "ghost"} badge-xs`}>
                            {v.tier}
                          </span>
                        </td>
                        <td className="font-mono text-xs max-w-[200px] truncate" title={v.pathname}>
                          {v.pathname}
                        </td>
                        <td className="font-mono text-xs">
                          {v.limit_max}/{v.window_ms >= 60000 ? `${v.window_ms / 60000}min` : `${v.window_ms / 1000}s`}
                        </td>
                        <td>
                          <span className={`badge badge-xs ${PLAN_BADGES[v.plan] || "badge-ghost"}`}>
                            {v.plan || "—"}
                          </span>
                        </td>
                        <td className="text-xs">{v.role || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
                {violations.slice(0, 50).map((v) => (
                  <div key={v.id} className="card bg-base-300 p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-xs font-bold truncate max-w-[60%]" title={v.identifier}>
                        {v.identifier?.length > 20
                          ? `${v.identifier.substring(0, 8)}...${v.identifier.slice(-4)}`
                          : v.identifier}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        <span className={`badge badge-xs ${v.identifier_type === "ip" ? "badge-warning" : "badge-info"}`}>
                          {v.identifier_type}
                        </span>
                        <span className={`badge badge-xs badge-${TIER_COLORS[v.tier] || "ghost"}`}>
                          {v.tier}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-base-content/50">Time:</span> <span className="text-xs font-mono">{new Date(v.created_at).toLocaleTimeString()}</span></div>
                      <div><span className="text-base-content/50">Limit:</span> <span className="font-mono text-xs">{v.limit_max}/{v.window_ms >= 60000 ? `${v.window_ms / 60000}min` : `${v.window_ms / 1000}s`}</span></div>
                      <div className="col-span-2"><span className="text-base-content/50">Path:</span> <span className="font-mono text-xs truncate">{v.pathname}</span></div>
                      <div><span className="text-base-content/50">Plan:</span> <span className={`badge badge-xs ${PLAN_BADGES[v.plan] || "badge-ghost"}`}>{v.plan || "—"}</span></div>
                      <div><span className="text-base-content/50">Role:</span> <span className="text-xs">{v.role || "—"}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Top Abusers ─────────────────────────────────────────────────── */}
      {(stats.topAbusers || []).length > 0 && (
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title text-lg">Top Flagged Identifiers</h3>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Identifier</th>
                    <th>Type</th>
                    <th>Violations</th>
                    <th>Top Tier</th>
                    <th>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topAbusers.slice(0, 10).map((abuser, i) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{abuser.identifier}</td>
                      <td>
                        <span className={`badge badge-xs ${abuser.identifier_type === "ip" ? "badge-warning" : "badge-info"}`}>
                          {abuser.identifier_type}
                        </span>
                      </td>
                      <td className="font-mono">{abuser.count}</td>
                      <td>
                        <span className={`badge badge-xs badge-${TIER_COLORS[abuser.top_tier] || "ghost"}`}>
                          {abuser.top_tier}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-xs ${PLAN_BADGES[abuser.plan] || "badge-ghost"}`}>
                          {abuser.plan || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile Cards */}
            <div className="sm:hidden space-y-2">
              {stats.topAbusers.slice(0, 10).map((abuser, i) => (
                <div key={i} className="card bg-base-300 p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-xs font-bold">{abuser.identifier}</span>
                    <span className="badge badge-sm badge-error">{abuser.count} violations</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    <div><span className="text-base-content/50">Type:</span> <span className={`badge badge-xs ${abuser.identifier_type === "ip" ? "badge-warning" : "badge-info"}`}>{abuser.identifier_type}</span></div>
                    <div><span className="text-base-content/50">Tier:</span> <span className={`badge badge-xs badge-${TIER_COLORS[abuser.top_tier] || "ghost"}`}>{abuser.top_tier}</span></div>
                    <div><span className="text-base-content/50">Plan:</span> <span className={`badge badge-xs ${PLAN_BADGES[abuser.plan] || "badge-ghost"}`}>{abuser.plan || "—"}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
