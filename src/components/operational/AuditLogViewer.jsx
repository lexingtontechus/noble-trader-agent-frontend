"use client";
import { useState, useEffect, useCallback } from "react";

const EVENT_COLORS = {
  SIGNAL_GENERATED: "badge-info",
  SIGNAL_FILTERED: "badge-ghost",
  ORDER_SUBMITTED: "badge-primary",
  ORDER_FILLED: "badge-success",
  ORDER_REJECTED: "badge-error",
  ORDER_CANCELLED: "badge-warning",
  ORDER_PARTIAL_FILL: "badge-warning",
  APPROVAL_GRANTED: "badge-success",
  APPROVAL_REVOKED: "badge-error",
  HALT_ACTIVATED: "badge-error",
  HALT_DEACTIVATED: "badge-success",
  MODE_CHANGED: "badge-secondary",
  POSITION_OPENED: "badge-info",
  POSITION_CLOSED: "badge-info",
  RISK_LIMIT_BREACH: "badge-error",
  RECONCILIATION_PASSED: "badge-success",
  RECONCILIATION_FAILED: "badge-error",
  KILL_SWITCH_CANCEL_ALL: "badge-error",
  KILL_SWITCH_CLOSE_ALL: "badge-error",
};

const EVENT_TYPES = [
  { value: "", label: "All Events" },
  { value: "ORDER_SUBMITTED", label: "Order Submitted" },
  { value: "ORDER_FILLED", label: "Order Filled" },
  { value: "ORDER_REJECTED", label: "Order Rejected" },
  { value: "ORDER_CANCELLED", label: "Order Cancelled" },
  { value: "ORDER_PARTIAL_FILL", label: "Partial Fill" },
  { value: "HALT_ACTIVATED", label: "Halt Activated" },
  { value: "HALT_DEACTIVATED", label: "Halt Deactivated" },
  { value: "MODE_CHANGED", label: "Mode Changed" },
  { value: "RISK_LIMIT_BREACH", label: "Risk Limit Breach" },
  { value: "RECONCILIATION_FAILED", label: "Reconciliation Failed" },
  { value: "RECONCILIATION_PASSED", label: "Reconciliation Passed" },
  { value: "KILL_SWITCH_CANCEL_ALL", label: "Kill Switch Cancel" },
  { value: "KILL_SWITCH_CLOSE_ALL", label: "Kill Switch Close" },
];

export default function AuditLogViewer({ bffFetch }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    event_type: "",
    symbol: "",
    date_from: "",
    date_to: "",
  });
  const [summary, setSummary] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const limit = 25;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.symbol) params.set("symbol", filters.symbol.toUpperCase());
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      const res = await bffFetch(`/operational/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error("Audit log fetch error:", e);
    }
    setLoading(false);
  }, [bffFetch, offset, filters]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await bffFetch("/operational/audit-log/summary");
      if (res.ok) setSummary(await res.json());
    } catch (e) {
      console.error("Audit summary fetch error:", e);
    }
  }, [bffFetch]);

  useEffect(() => { fetchEvents(); fetchSummary(); }, [fetchEvents, fetchSummary]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { fetchEvents(); fetchSummary(); }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEvents, fetchSummary]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      const res = await bffFetch(`/operational/audit-log/export?${params}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Audit export error:", e);
    }
  };

  const clearFilters = () => {
    setFilters({ event_type: "", symbol: "", date_from: "", date_to: "" });
    setOffset(0);
  };

  const hasActiveFilters = filters.event_type || filters.symbol || filters.date_from || filters.date_to;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const formatEventType = (type) => type?.replace(/_/g, " ") || "";

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Trade Audit Log</h2>
          <div className="flex gap-2 items-center">
            <label className="label cursor-pointer gap-2" title="Auto-refresh every 30s">
              <input type="checkbox" className="toggle toggle-xs toggle-primary" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span className="text-xs opacity-70">Auto</span>
            </label>
            <button className="btn btn-primary btn-sm" onClick={handleExport}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              CSV
            </button>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {Object.entries(summary).map(([period, counts]) => {
              const totalForPeriod = typeof counts === "object" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts;
              return (
                <div key={period} className="stat bg-base-200 rounded-lg p-2">
                  <div className="stat-title text-xs">Last {period}</div>
                  <div className="stat-value text-lg">{totalForPeriod}</div>
                  {typeof counts === "object" && (
                    <div className="stat-desc text-xs">
                      {Object.entries(counts).slice(0, 3).map(([k, v]) => `${formatEventType(k)}: ${v}`).join(" | ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mt-2 flex-wrap items-center">
          <select
            className="select select-bordered select-sm"
            value={filters.event_type}
            onChange={(e) => { setFilters({ ...filters, event_type: e.target.value }); setOffset(0); }}
          >
            {EVENT_TYPES.map((et) => (
              <option key={et.value} value={et.value}>{et.label}</option>
            ))}
          </select>
          <input
            type="text" className="input input-bordered input-sm w-28" placeholder="Symbol"
            value={filters.symbol} onChange={(e) => { setFilters({ ...filters, symbol: e.target.value }); setOffset(0); }}
          />
          <input
            type="date" className="input input-bordered input-sm w-36"
            value={filters.date_from} onChange={(e) => { setFilters({ ...filters, date_from: e.target.value }); setOffset(0); }}
            title="From date"
          />
          <input
            type="date" className="input input-bordered input-sm w-36"
            value={filters.date_to} onChange={(e) => { setFilters({ ...filters, date_to: e.target.value }); setOffset(0); }}
            title="To date"
          />
          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
          )}
          <span className="text-xs opacity-50 ml-auto">{total} events</span>
        </div>

        {/* Events List */}
        <div className="space-y-1 mt-2 max-h-96 overflow-y-auto">
          {loading && events.length === 0 && (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md text-primary"></span>
            </div>
          )}
          {!loading && events.length === 0 && (
            <div className="text-center opacity-50 py-8">No audit events found</div>
          )}
          {events.map((event, i) => (
            <div key={event.id || i} className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2 text-sm hover:bg-base-300 transition-colors">
              <span className={`badge badge-sm ${EVENT_COLORS[event.event_type] || "badge-ghost"}`}>
                {formatEventType(event.event_type)}
              </span>
              {event.symbol && <span className="font-mono font-bold">{event.symbol}</span>}
              {event.direction && (
                <span className={`text-xs font-semibold ${event.direction === "buy" ? "text-success" : "text-error"}`}>
                  {event.direction.toUpperCase()}
                </span>
              )}
              {event.quantity && <span className="text-xs">{event.quantity}</span>}
              {event.price && <span className="text-xs font-mono">@ ${Number(event.price).toFixed(2)}</span>}
              {event.order_id && (
                <span className="text-xs opacity-50 truncate max-w-[80px] font-mono" title={event.order_id}>
                  {event.order_id.slice(0, 8)}...
                </span>
              )}
              <span className="text-xs opacity-40 ml-auto whitespace-nowrap">
                {new Date(event.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 mt-3">
            <button
              className="btn btn-xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Prev
            </button>
            <span className="btn btn-xs btn-disabled">
              {currentPage} / {totalPages}
            </span>
            <button
              className="btn btn-xs"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
