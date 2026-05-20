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

export default function AuditLogViewer({ bffFetch }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ event_type: "", symbol: "" });
  const [summary, setSummary] = useState(null);

  const limit = 25;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.symbol) params.set("symbol", filters.symbol.toUpperCase());
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

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (filters.event_type) params.set("event_type", filters.event_type);
      const res = await bffFetch(`/operational/audit-log/export?${params}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "audit_log.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Audit export error:", e);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Trade Audit Log</h2>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>Export CSV</button>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {Object.entries(summary).map(([period, counts]) => (
              <div key={period} className="stat bg-base-200 rounded-lg p-2">
                <div className="stat-title text-xs">Last {period}</div>
                <div className="stat-value text-lg">{Object.values(counts).reduce((a, b) => a + b, 0)}</div>
                <div className="stat-desc text-xs">
                  {Object.entries(counts).slice(0, 3).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" | ")}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mt-2 flex-wrap">
          <select className="select select-bordered select-sm" value={filters.event_type} onChange={(e) => { setFilters({ ...filters, event_type: e.target.value }); setOffset(0); }}>
            <option value="">All Events</option>
            <option value="ORDER_SUBMITTED">Order Submitted</option>
            <option value="ORDER_FILLED">Order Filled</option>
            <option value="ORDER_REJECTED">Order Rejected</option>
            <option value="HALT_ACTIVATED">Halt Activated</option>
            <option value="HALT_DEACTIVATED">Halt Deactivated</option>
            <option value="MODE_CHANGED">Mode Changed</option>
            <option value="RISK_LIMIT_BREACH">Risk Limit Breach</option>
            <option value="RECONCILIATION_FAILED">Reconciliation Failed</option>
          </select>
          <input
            type="text" className="input input-bordered input-sm w-28" placeholder="Symbol"
            value={filters.symbol} onChange={(e) => { setFilters({ ...filters, symbol: e.target.value }); setOffset(0); }}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ event_type: "", symbol: "" }); setOffset(0); }}>Clear</button>
        </div>

        {/* Events List */}
        <div className="space-y-1 mt-2 max-h-96 overflow-y-auto">
          {loading && <span className="loading loading-spinner loading-md"></span>}
          {!loading && events.length === 0 && <div className="text-center opacity-50 py-8">No audit events found</div>}
          {events.map((event, i) => (
            <div key={event.id || i} className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2 text-sm">
              <span className={`badge badge-sm ${EVENT_COLORS[event.event_type] || "badge-ghost"}`}>
                {event.event_type?.replace(/_/g, " ")}
              </span>
              {event.symbol && <span className="font-mono font-bold">{event.symbol}</span>}
              {event.direction && <span className="text-xs">{event.direction}</span>}
              {event.quantity && <span className="text-xs">{event.quantity}</span>}
              {event.price && <span className="text-xs">@ ${Number(event.price).toFixed(2)}</span>}
              {event.order_id && <span className="text-xs opacity-50 truncate max-w-[80px]">{event.order_id}</span>}
              <span className="text-xs opacity-40 ml-auto">{new Date(event.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 mt-2">
            <button className="btn btn-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
            <span className="btn btn-xs btn-disabled">Page {Math.floor(offset / limit) + 1} of {totalPages}</span>
            <button className="btn btn-xs" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
