"use client";
import { useState, useEffect, useCallback } from "react";

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

function getDateRange(preset) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "90d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "ytd":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return { from: "", to: "" };
  }
}

// ── Event type badge styling ─────────────────────────────────────────────────

function eventBadgeClass(eventType) {
  if (!eventType) return "badge-ghost";
  const t = eventType.toUpperCase();
  if (t.includes("REJECTED") || t.includes("FAILED") || t.includes("TRIGGERED") || t.includes("HALT_ACTIVATED") || t.includes("KILL_SWITCH_ACTIVATED")) return "badge-error";
  if (t.includes("FILLED") || t.includes("APPROVED") || t.includes("PASSED") || t.includes("DEACTIVATED")) return "badge-success";
  if (t.includes("SUBMITTED") || t.includes("STARTED") || t.includes("PLACED") || t.includes("EXECUTED")) return "badge-info";
  if (t.includes("CANCELLED") || t.includes("PAUSED") || t.includes("STOPPED") || t.includes("CHECK")) return "badge-warning";
  if (t.includes("SCHEDULED") || t.includes("PARTIAL")) return "badge-accent";
  return "badge-ghost";
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function formatDetails(evt) {
  if (evt.order_id) {
    return <span className="font-mono" title={evt.order_id}>{evt.order_id.slice(0, 8)}…</span>;
  }
  if (evt.metadata?.reason) {
    return String(evt.metadata.reason).slice(0, 30);
  }
  if (evt.metadata?.error) {
    return <span className="text-error">{String(evt.metadata.error).slice(0, 30)}</span>;
  }
  if (evt.metadata?.result) {
    return (
      <span className={evt.metadata.result === "allowed" ? "text-success" : "text-error"}>
        {evt.metadata.result}
      </span>
    );
  }
  return "—";
}

export default function ComplianceReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [datePreset, setDatePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // P3-5B: Audit events state
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditNote, setAuditNote] = useState(null);

  // P3-5B: Fill polling state
  const [fillPollActive, setFillPollActive] = useState(false);
  const [fillPollLoading, setFillPollLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      let dateFrom = "";
      let dateTo = "";
      if (datePreset === "custom") {
        dateFrom = customFrom;
        dateTo = customTo;
      } else {
        const range = getDateRange(datePreset);
        dateFrom = range.from;
        dateTo = range.to;
      }

      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/compliance/report?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        setNote(data.note || null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [datePreset, customFrom, customTo]);

  // Fetch audit events (last 50)
  const fetchAuditEvents = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    setAuditNote(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      const res = await fetch(`/api/compliance/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.events || []);
        setAuditNote(data.note || null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAuditError(errData.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setAuditError(e.message);
    }
    setAuditLoading(false);
  }, []);

  // Check fill polling status
  const checkFillPollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/fills/poll");
      if (res.ok) {
        const data = await res.json();
        setFillPollActive(data.active || false);
      }
    } catch {
      // Silently ignore
    }
  }, []);

  // Toggle fill polling
  const toggleFillPolling = async () => {
    setFillPollLoading(true);
    try {
      const action = fillPollActive ? "stop" : "start";
      const res = await fetch("/api/fills/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await checkFillPollStatus();
      }
    } catch (e) {
      console.error("Fill polling toggle error:", e);
    }
    setFillPollLoading(false);
  };

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchAuditEvents();
    checkFillPollStatus();
    // Refresh audit events and fill poll status every 30s
    const interval = setInterval(() => {
      fetchAuditEvents();
      checkFillPollStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAuditEvents, checkFillPollStatus]);

  const handleExportCsv = async () => {
    if (!report) return;
    const rows = [
      ["Metric", "Value"],
      ["Date Range From", report.dateRange?.from || ""],
      ["Date Range To", report.dateRange?.to || ""],
      ["Total Events", report.totalEvents],
      ["Total Trades", report.trades?.total || 0],
      ["Filled Orders", report.trades?.filled || 0],
      ["Rejected Orders", report.trades?.rejected || 0],
      ["Cancelled Orders", report.trades?.cancelled || 0],
      ["Fill Rate", report.trades?.fillRate || "0%"],
      ["Rejection Rate", report.trades?.rejectionRate || "0%"],
      ["Wins", report.winLoss?.wins ?? "N/A"],
      ["Losses", report.winLoss?.losses ?? "N/A"],
      ["Win/Loss Ratio", report.winLoss?.ratio || "N/A"],
      ["Average Trade Size", report.averageTradeSize || "0"],
      ["Risk Events", report.riskEvents || 0],
      ["Kill Switch Activations", report.killSwitch?.activations || 0],
      ["Kill Switch Cancel All", report.killSwitch?.cancelAll || 0],
      ["Kill Switch Close All", report.killSwitch?.closeAll || 0],
      ["Halt Activated", report.halt?.activated || 0],
      ["Halt Deactivated", report.halt?.deactivated || 0],
      ["Mode Changes", report.modeChanges || 0],
      ["Reconciliation Passed", report.reconciliation?.passed || 0],
      ["Reconciliation Failed", report.reconciliation?.failed || 0],
      ["Reconciliation Pass Rate", report.reconciliation?.passRate || "N/A"],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">Compliance Report</h2>
          <div className="flex gap-2 items-center flex-wrap">
            {/* P3-5B: Fill polling toggle */}
            <div className="flex items-center gap-2">
              {fillPollActive && (
                <span className="badge badge-success badge-sm gap-1">
                  <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
                  Live
                </span>
              )}
              <button
                className={`btn btn-sm min-h-[44px] sm:min-h-0 ${fillPollActive ? "btn-warning" : "btn-outline btn-sm"}`}
                onClick={toggleFillPolling}
                disabled={fillPollLoading}
              >
                {fillPollLoading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : fillPollActive ? (
                  "Stop Fill Poll"
                ) : (
                  "Start Fill Poll"
                )}
              </button>
            </div>
            <button
              className="btn btn-primary btn-sm min-h-[44px] sm:min-h-0"
              onClick={() => { fetchReport(); fetchAuditEvents(); }}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : "Refresh"}
            </button>
            {report && (
              <button className="btn btn-sm btn-outline min-h-[44px] sm:min-h-0" onClick={handleExportCsv}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex gap-2 mt-2 flex-wrap items-center">
          <div className="join">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`btn btn-xs join-item min-h-[36px] sm:min-h-0 ${datePreset === p.value ? "btn-active btn-accent" : ""}`}
                onClick={() => setDatePreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {datePreset === "custom" && (
            <>
              <input
                type="date"
                className="input input-bordered input-sm w-36"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="From"
              />
              <input
                type="date"
                className="input input-bordered input-sm w-36"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="To"
              />
            </>
          )}
        </div>

        {/* Note / Graceful Degradation */}
        {note && (
          <div className="alert alert-warning mt-2">
            <span className="text-sm">{note}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert alert-error mt-2">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && !report && (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        )}

        {/* Report Content */}
        {report && (
          <div className="mt-3 space-y-3">
            {/* Date Range Info */}
            <div className="text-xs opacity-50">
              Report period: {report.dateRange?.from} → {report.dateRange?.to} | {report.totalEvents} total events
            </div>

            {/* Trades Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Total Trades</div>
                <div className="stat-value text-xl">{report.trades?.total || 0}</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Filled</div>
                <div className="stat-value text-xl text-success">{report.trades?.filled || 0}</div>
                <div className="stat-desc text-xs">{report.trades?.fillRate}</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Rejected</div>
                <div className="stat-value text-xl text-error">{report.trades?.rejected || 0}</div>
                <div className="stat-desc text-xs">{report.trades?.rejectionRate}</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Cancelled</div>
                <div className="stat-value text-xl text-warning">{report.trades?.cancelled || 0}</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Avg Trade Size</div>
                <div className="stat-value text-xl">{report.averageTradeSize || "0"}</div>
              </div>
            </div>

            {/* Win/Loss & Risk */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Win/Loss Ratio</div>
                <div className="stat-value text-xl">
                  {report.winLoss?.ratio || "N/A"}
                </div>
                <div className="stat-desc text-xs">
                  {report.winLoss?.wins !== null ? `${report.winLoss.wins}W / ${report.winLoss.losses}L` : "No outcome data"}
                </div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Risk Events</div>
                <div className="stat-value text-xl text-error">{report.riskEvents || 0}</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Kill Switch</div>
                <div className="stat-value text-xl text-error">{report.killSwitch?.activations || 0}</div>
                <div className="stat-desc text-xs">
                  Cancel: {report.killSwitch?.cancelAll || 0} | Close: {report.killSwitch?.closeAll || 0}
                </div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Mode Changes</div>
                <div className="stat-value text-xl">{report.modeChanges || 0}</div>
              </div>
            </div>

            {/* Halt & Reconciliation */}
            <div className="grid grid-cols-2 gap-2">
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Halt Events</div>
                <div className="stat-value text-xl">
                  {report.halt?.activated || 0} / {report.halt?.deactivated || 0}
                </div>
                <div className="stat-desc text-xs">Activated / Deactivated</div>
              </div>
              <div className="stat bg-base-200 rounded-lg p-3">
                <div className="stat-title text-xs">Reconciliation</div>
                <div className="stat-value text-xl">
                  {report.reconciliation?.passRate || "N/A"}
                </div>
                <div className="stat-desc text-xs">
                  {report.reconciliation?.passed || 0} passed / {report.reconciliation?.failed || 0} failed
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No report (empty state) */}
        {!loading && !report && !error && !note && (
          <div className="text-center opacity-50 py-8">
            Click &quot;Refresh&quot; to generate a compliance report
          </div>
        )}

        {/* ── P3-5B: Recent Audit Events ─────────────────────────────────── */}
        <div className="divider mt-4 mb-2"></div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            Recent Audit Events
            {fillPollActive && (
              <span className="badge badge-success badge-xs gap-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></span>
                Live
              </span>
            )}
          </h3>
          <button
            className="btn btn-ghost btn-xs min-h-[36px] sm:min-h-0"
            onClick={fetchAuditEvents}
            disabled={auditLoading}
          >
            {auditLoading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : "Refresh"}
          </button>
        </div>

        {auditNote && (
          <div className="alert alert-warning mt-1 py-1">
            <span className="text-xs">{auditNote}</span>
          </div>
        )}

        {auditError && (
          <div className="alert alert-error mt-1 py-1">
            <span className="text-xs">{auditError}</span>
          </div>
        )}

        {auditLoading && auditEvents.length === 0 && (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}

        {auditEvents.length > 0 && (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block mt-2 max-h-96 overflow-y-auto rounded-lg border border-base-300" style={{ scrollbarGutter: "stable" }}>
              <table className="table table-xs w-full">
                <thead className="sticky top-0 bg-base-200 z-10">
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Symbol</th>
                    <th>Direction</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((evt, i) => (
                    <tr key={evt.id || i} className="hover">
                      <td className="whitespace-nowrap text-xs opacity-70">
                        {formatTimestamp(evt.created_at)}
                      </td>
                      <td>
                        <span className={`badge badge-xs ${eventBadgeClass(evt.event_type)}`}>
                          {evt.event_type?.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        {evt.symbol || "—"}
                      </td>
                      <td className="text-xs">
                        {evt.direction ? (
                          <span className={evt.direction === "buy" ? "text-success" : "text-error"}>
                            {evt.direction.toUpperCase()}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="text-xs">{evt.quantity || "—"}</td>
                      <td className="text-xs">{evt.price ? `$${evt.price}` : "—"}</td>
                      <td className="text-xs max-w-32 truncate" title={JSON.stringify(evt.metadata || evt.risk_metrics || {})}>
                        {formatDetails(evt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile Cards */}
            <div className="sm:hidden mt-2 space-y-2 max-h-96 overflow-y-auto">
              {auditEvents.map((evt, i) => (
                <div key={evt.id || i} className="card bg-base-200 p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-xs ${eventBadgeClass(evt.event_type)}`}>
                        {evt.event_type?.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {evt.symbol && <span className="font-mono font-bold text-sm">{evt.symbol}</span>}
                    </div>
                    <span className="text-[10px] text-base-content/50 whitespace-nowrap ml-2">
                      {formatTimestamp(evt.created_at)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {evt.direction && (
                      <div><span className="text-base-content/50">Dir:</span> <span className={evt.direction === "buy" ? "text-success" : "text-error"}>{evt.direction.toUpperCase()}</span></div>
                    )}
                    {evt.quantity && <div><span className="text-base-content/50">Qty:</span> {evt.quantity}</div>}
                    {evt.price && <div><span className="text-base-content/50">Price:</span> ${evt.price}</div>}
                    <div className="col-span-2"><span className="text-base-content/50">Details:</span> <span className="text-xs">{formatDetails(evt)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!auditLoading && auditEvents.length === 0 && !auditError && !auditNote && (
          <div className="text-center opacity-50 py-4 text-sm">
            No audit events found. Execute a trade or start fill polling to populate the audit trail.
          </div>
        )}
      </div>
    </div>
  );
}
