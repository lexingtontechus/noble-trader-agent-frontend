"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_REFRESH_MS = 30_000;
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return "Never";
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 0) return "Just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return "Invalid";
  }
}

function formatUptime(seconds) {
  if (!seconds) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function isTimestampStale(isoString) {
  if (!isoString) return true;
  return Date.now() - new Date(isoString).getTime() > STALE_THRESHOLD_MS;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status, size = "sm" }) {
  const sizeClass = size === "lg" ? "w-4 h-4" : "w-2.5 h-2.5";
  let colorClass = "bg-base-300"; // unknown
  if (status === "healthy") colorClass = "bg-success";
  else if (status === "degraded") colorClass = "bg-warning";
  else if (status === "unhealthy") colorClass = "bg-error";
  else if (status === "idle") colorClass = "bg-info";
  else if (status === "no_keys") colorClass = "bg-warning";

  return <span className={`${sizeClass} ${colorClass} rounded-full inline-block flex-shrink-0`} />;
}

function OverallStatusHero({ overall, lastChecked, version, uptime }) {
  const config = {
    healthy: { emoji: "\u{1F7E2}", label: "Healthy", badgeClass: "badge-success", cardClass: "border-success/30 bg-success/5" },
    degraded: { emoji: "\u{1F7E1}", label: "Degraded", badgeClass: "badge-warning", cardClass: "border-warning/30 bg-warning/5" },
    unhealthy: { emoji: "\u{1F534}", label: "Unhealthy", badgeClass: "badge-error", cardClass: "border-error/30 bg-error/5" },
  };
  const c = config[overall] || config.unhealthy;

  return (
    <div className={`card border-2 ${c.cardClass} shadow-sm`}>
      <div className="card-body p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{c.emoji}</span>
            <div>
              <h2 className="text-2xl font-bold">System Status: {c.label}</h2>
              <p className="text-sm text-base-content/60 mt-1">
                Last checked: {lastChecked ? new Date(lastChecked).toLocaleTimeString() : "Unknown"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${c.badgeClass} badge-lg`}>{c.label.toUpperCase()}</span>
            <span className="badge badge-ghost badge-sm">v{version || "?"}</span>
            <span className="badge badge-outline badge-sm">
              Uptime: {formatUptime(uptime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ title, icon, check, expanded, onToggle }) {
  if (!check) return null;
  const statusLabel = check.status || "unknown";

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div
        className="card-body p-4 cursor-pointer hover:bg-base-200/50 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{icon}</span>
            <div>
              <h3 className="font-semibold text-sm">{title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusDot status={check.status} />
                <span className="text-xs text-base-content/60 capitalize">{statusLabel}</span>
                {check.latencyMs !== undefined && (
                  <span className="text-xs text-base-content/40">{check.latencyMs}ms</span>
                )}
              </div>
            </div>
          </div>
          <span className="text-base-content/30 text-xs">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-base-200 text-xs space-y-1.5">
            {check.url && (
              <div className="flex justify-between">
                <span className="text-base-content/50">URL</span>
                <span className="font-mono truncate ml-2 max-w-[200px]">{check.url}</span>
              </div>
            )}
            {check.mode && (
              <div className="flex justify-between">
                <span className="text-base-content/50">Mode</span>
                <span className="badge badge-xs badge-outline">{check.mode}</span>
              </div>
            )}
            {check.accountStatus && (
              <div className="flex justify-between">
                <span className="text-base-content/50">Account</span>
                <span className="capitalize">{check.accountStatus}</span>
              </div>
            )}
            {check.tablesAccessible !== undefined && (
              <div className="flex justify-between">
                <span className="text-base-content/50">Tables</span>
                <span>{check.tablesAccessible}/{check.totalTables || "?"} accessible</span>
              </div>
            )}
            {check.error && (
              <div className="text-error break-all">
                Error: {check.error}
              </div>
            )}
            {check.lastChecked && (
              <div className="flex justify-between">
                <span className="text-base-content/50">Last Check</span>
                <span>{new Date(check.lastChecked).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CronJobsTable({ jobs }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="text-xl">⏰</span> Cron Jobs
          </h3>
          <p className="text-sm text-base-content/50 mt-2">No cron jobs found or unable to query cron schema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <span className="text-xl">⏰</span> Cron Jobs ({jobs.length})
        </h3>
        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Job</th>
                <th>Schedule</th>
                <th>Last Run</th>
                <th>Status</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const rowClass = !job.lastRun
                  ? "text-base-content/30"
                  : job.lastStatus === "succeeded"
                    ? "bg-success/5"
                    : job.lastStatus === "failed"
                      ? "bg-error/5"
                      : "";

                return (
                  <tr key={job.name} className={rowClass}>
                    <td className="font-mono text-xs">{job.name}</td>
                    <td className="font-mono text-xs">{job.schedule}</td>
                    <td className="text-xs">{job.lastRun ? timeAgo(job.lastRun) : "Never"}</td>
                    <td>
                      {!job.lastRun ? (
                        <span className="badge badge-ghost badge-xs">never</span>
                      ) : job.lastStatus === "succeeded" ? (
                        <span className="badge badge-success badge-xs">OK</span>
                      ) : job.lastStatus === "failed" ? (
                        <span className="badge badge-error badge-xs">FAIL</span>
                      ) : (
                        <span className="badge badge-ghost badge-xs">{job.lastStatus}</span>
                      )}
                    </td>
                    <td>
                      {job.active ? (
                        <span className="text-success">✓</span>
                      ) : (
                        <span className="text-error">✗</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile Cards */}
        <div className="sm:hidden space-y-2">
          {jobs.map((job) => (
            <div key={job.name} className={`card bg-base-200 p-3 ${!job.lastRun ? "opacity-50" : job.lastStatus === "succeeded" ? "border border-success/20" : job.lastStatus === "failed" ? "border border-error/20" : ""}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono font-bold text-xs">{job.name}</span>
                <div className="flex items-center gap-2">
                  {!job.lastRun ? (
                    <span className="badge badge-ghost badge-xs">never</span>
                  ) : job.lastStatus === "succeeded" ? (
                    <span className="badge badge-success badge-xs">OK</span>
                  ) : job.lastStatus === "failed" ? (
                    <span className="badge badge-error badge-xs">FAIL</span>
                  ) : (
                    <span className="badge badge-ghost badge-xs">{job.lastStatus}</span>
                  )}
                  {job.active ? (
                    <span className="text-success text-xs">✓</span>
                  ) : (
                    <span className="text-error text-xs">✗</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-base-content/50">Schedule:</span> <span className="font-mono text-xs">{job.schedule}</span></div>
                <div><span className="text-base-content/50">Last Run:</span> <span className="text-xs">{job.lastRun ? timeAgo(job.lastRun) : "Never"}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataFreshnessCards({ data }) {
  if (!data) return null;

  const items = [
    { key: "analysis", label: "Last Analysis", icon: "📊", timestamp: data.lastAnalysis, stale: data.isStale?.analysis },
    { key: "fill", label: "Last Fill", icon: "📝", timestamp: data.lastFill, stale: data.isStale?.fill },
    { key: "snapshot", label: "Last Snapshot", icon: "📸", timestamp: data.lastSnapshot, stale: data.isStale?.snapshot },
    { key: "reconciliation", label: "Last Reconciliation", icon: "🔄", timestamp: data.lastReconciliation, stale: data.isStale?.reconciliation },
  ];

  return (
    <div>
      <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
        <span className="text-xl">⏱️</span> Data Freshness
        <span className="text-xs text-base-content/40">(stale &gt; {data.staleThreshold})</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => {
          const isStale = item.stale !== undefined ? item.stale : isTimestampStale(item.timestamp);
          return (
            <div
              key={item.key}
              className={`card border shadow-sm ${
                isStale ? "border-warning/40 bg-warning/5" : "border-base-300 bg-base-100"
              }`}
            >
              <div className="card-body p-3">
                <div className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span className="text-xs font-medium text-base-content/70">{item.label}</span>
                </div>
                <div className="text-sm font-semibold mt-1">
                  {item.timestamp ? timeAgo(item.timestamp) : "Never"}
                </div>
                {item.timestamp && (
                  <div className="text-[10px] text-base-content/40">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                )}
                {isStale && (
                  <div className="text-warning text-xs font-medium mt-1">
                    ⚠️ Stale (&gt;{data.staleThreshold})
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CircuitBreakerCard({ data }) {
  if (!data) return null;

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span className="text-xl">🛡️</span> Circuit Breakers
          <StatusDot status={data.status} />
        </h3>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-2xl font-bold">{data.activeBreakers ?? 0}</div>
            <div className="text-xs text-base-content/50">Active Breakers</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${(data.activeHalts ?? 0) > 0 ? "text-error" : "text-success"}`}>
              {data.activeHalts ?? 0}
            </div>
            <div className="text-xs text-base-content/50">Active Halts</div>
          </div>
        </div>
        {data.halts && data.halts.length > 0 && (
          <div className="mt-3 space-y-2">
            {data.halts.map((h) => (
              <div key={h.id} className="alert alert-error alert-sm py-1.5 px-3">
                <span className="text-xs">
                  <strong>{h.level}</strong>: {h.reason} (scope: {h.scope})
                </span>
              </div>
            ))}
          </div>
        )}
        {data.lastTriggeredBreaker && (
          <div className="mt-2 text-xs text-base-content/50">
            Last triggered: <strong>{data.lastTriggeredBreaker.breaker_type}</strong>
            {data.lastTriggeredBreaker.last_triggered_at &&
              ` — ${timeAgo(data.lastTriggeredBreaker.last_triggered_at)}`}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTrailCard({ data }) {
  if (!data) return null;

  const breakdown = data.eventTypeBreakdown || {};
  const topEvents = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span className="text-xl">📋</span> Audit Trail
          <StatusDot status={data.status} />
        </h3>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-2xl font-bold">{data.eventsLast24h ?? 0}</div>
            <div className="text-xs text-base-content/50">Events (24h)</div>
          </div>
          <div>
            <div className="text-sm font-semibold">
              {data.lastEventAt ? timeAgo(data.lastEventAt) : "Never"}
            </div>
            <div className="text-xs text-base-content/50">Last Event</div>
          </div>
        </div>
        {topEvents.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs text-base-content/50 mb-1">Event Breakdown</div>
            {topEvents.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="font-mono text-base-content/70 truncate mr-2">{type}</span>
                <span className="badge badge-ghost badge-xs">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FillPollerCard({ data }) {
  if (!data) return null;

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span className="text-xl">📡</span> Fill Poller
          <StatusDot status={data.isRunning ? "healthy" : data.status === "idle" ? "idle" : data.status} />
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          <div>
            <div className={`text-lg font-bold ${data.isRunning ? "text-success" : "text-base-content/40"}`}>
              {data.isRunning ? "Running" : "Idle"}
            </div>
            <div className="text-xs text-base-content/50">Your Poller</div>
          </div>
          <div>
            <div className="text-lg font-bold">{data.activePollers ?? 0}</div>
            <div className="text-xs text-base-content/50">Active Pollers</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-sm font-semibold">
              {data.lastPollAt ? timeAgo(data.lastPollAt) : "N/A"}
            </div>
            <div className="text-xs text-base-content/50">Last Poll</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorLogCard({ errors }) {
  if (!errors || errors.length === 0) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="text-xl">🚨</span> Recent Errors
          </h3>
          <p className="text-sm text-success mt-1">No recent errors found. All clear! 🎉</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <span className="text-xl">🚨</span> Recent Errors ({errors.length})
        </h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-error/5 rounded-lg">
              <span className="text-error text-xs mt-0.5">✗</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge badge-error badge-xs">{err.event_type}</span>
                  {err.symbol && <span className="font-mono text-xs">{err.symbol}</span>}
                  <span className="text-[10px] text-base-content/40 ml-auto">{timeAgo(err.created_at)}</span>
                </div>
                {err.metadata?.reason && (
                  <p className="text-xs text-base-content/60 mt-0.5 truncate">{err.metadata.reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SystemHealthDashboard() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(DEFAULT_REFRESH_MS);
  const intervalRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health/detailed");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealthData(data);
      setLastFetch(Date.now());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    fetchHealth();

    function startInterval() {
      stopInterval();
      intervalRef.current = setInterval(fetchHealth, refreshInterval);
    }

    function stopInterval() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    startInterval();

    // Pause when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        fetchHealth();
        startInterval();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchHealth, refreshInterval]);

  const toggleCard = (key) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Loading state
  if (loading && !healthData) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body p-6 flex items-center justify-center min-h-[200px]">
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="ml-3 text-base-content/60">Loading system health...</span>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error && !healthData) {
    return (
      <div className="card bg-base-100 border border-error/30 shadow-sm">
        <div className="card-body p-6 text-center">
          <span className="text-4xl mb-2">⚠️</span>
          <h3 className="font-semibold">Failed to load system health</h3>
          <p className="text-sm text-base-content/60 mt-1">{error}</p>
          <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary mt-3" onClick={fetchHealth}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const checks = healthData?.checks || {};

  return (
    <div className="space-y-4">
      {/* Header with refresh controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          🏥 System Health Dashboard
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="select select-xs select-bordered"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            aria-label="Refresh interval"
          >
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
            <option value={300000}>5m</option>
          </select>
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-outline"
            onClick={fetchHealth}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "↻ Refresh"
            )}
          </button>
          {lastFetch && (
            <span className="text-[10px] text-base-content/40">
              Updated {timeAgo(new Date(lastFetch).toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Overall Status Hero */}
      <OverallStatusHero
        overall={healthData?.overall || "unhealthy"}
        lastChecked={healthData?.timestamp}
        version={healthData?.version}
        uptime={healthData?.uptime?.uptimeSeconds}
      />

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <ServiceCard
          title="Backend (FastAPI)"
          icon="🐍"
          check={checks.backend}
          expanded={expandedCards.backend}
          onToggle={() => toggleCard("backend")}
        />
        <ServiceCard
          title="Supabase"
          icon="🗄️"
          check={checks.supabase}
          expanded={expandedCards.supabase}
          onToggle={() => toggleCard("supabase")}
        />
        <ServiceCard
          title="Alpaca"
          icon="📈"
          check={checks.alpaca}
          expanded={expandedCards.alpaca}
          onToggle={() => toggleCard("alpaca")}
        />
      </div>

      {/* Cron Jobs Table */}
      <CronJobsTable jobs={checks.cronJobs?.jobs} />

      {/* Data Freshness */}
      <DataFreshnessCards data={checks.dataFreshness} />

      {/* Circuit Breakers + Audit Trail + Fill Poller */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CircuitBreakerCard data={checks.circuitBreakers} />
        <AuditTrailCard data={checks.auditTrail} />
        <FillPollerCard data={checks.fillPoller} />
      </div>

      {/* Error Log */}
      <ErrorLogCard errors={healthData?.recentErrors} />
    </div>
  );
}
