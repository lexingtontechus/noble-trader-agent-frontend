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
    case "ytd": {
      return { from: `${now.getFullYear()}-01-01`, to: today };
    }
    default:
      return { from: "", to: "" };
  }
}

export default function AuditLogViewer({ bffFetch }) {
  // Data source toggle: "backend" (FastAPI proxy) or "local" (Supabase direct)
  const [dataSource, setDataSource] = useState("backend");
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
  const [datePreset, setDatePreset] = useState("30d");
  const [summary, setSummary] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Compliance summary stats (for local data source)
  const [complianceSummary, setComplianceSummary] = useState(null);

  // Trade journal panel state
  const [journalNotes, setJournalNotes] = useState({});
  const [journalLoading, setJournalLoading] = useState({});
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [journalInput, setJournalInput] = useState({ notes: "", tags: "" });

  const limit = 25;

  // Initialize date preset on mount
  useEffect(() => {
    if (datePreset !== "custom") {
      const range = getDateRange(datePreset);
      setFilters((prev) => ({
        ...prev,
        date_from: range.from,
        date_to: range.to,
      }));
    }
  }, [datePreset]);

  // Fetch events from the selected data source
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      if (dataSource === "local") {
        // Direct Supabase query via /api/compliance/audit-log
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (filters.event_type) params.set("event_type", filters.event_type);
        if (filters.symbol) params.set("symbol", filters.symbol.toUpperCase());
        if (filters.date_from) params.set("date_from", filters.date_from);
        if (filters.date_to) params.set("date_to", filters.date_to);
        const res = await fetch(`/api/compliance/audit-log?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
          setTotal(data.total || 0);
          // Compute compliance summary from local data
          computeComplianceSummary(data.events || []);
        }
      } else {
        // Backend (FastAPI proxy) — existing behavior
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
      }
    } catch (e) {
      console.error("Audit log fetch error:", e);
    }
    setLoading(false);
  }, [bffFetch, dataSource, offset, filters]);

  const fetchSummary = useCallback(async () => {
    try {
      if (dataSource === "backend") {
        const res = await bffFetch("/operational/audit-log/summary");
        if (res.ok) setSummary(await res.json());
      }
      // For local data source, summary is computed from the events
    } catch (e) {
      console.error("Audit summary fetch error:", e);
    }
  }, [bffFetch, dataSource]);

  // Compute compliance summary from local events
  const computeComplianceSummary = (evts) => {
    if (!evts || evts.length === 0) {
      setComplianceSummary(null);
      return;
    }
    const totalTrades = evts.filter((e) =>
      ["ORDER_SUBMITTED", "ORDER_FILLED", "ORDER_REJECTED", "ORDER_CANCELLED", "ORDER_PARTIAL_FILL"].includes(e.event_type)
    ).length;
    const filled = evts.filter((e) => e.event_type === "ORDER_FILLED").length;
    const rejected = evts.filter((e) => e.event_type === "ORDER_REJECTED").length;
    const riskEvents = evts.filter((e) => e.event_type === "RISK_LIMIT_BREACH").length;
    const reconPassed = evts.filter((e) => e.event_type === "RECONCILIATION_PASSED").length;
    const reconFailed = evts.filter((e) => e.event_type === "RECONCILIATION_FAILED").length;

    setComplianceSummary({
      totalTrades,
      fillRate: totalTrades > 0 ? ((filled / totalTrades) * 100).toFixed(1) : 0,
      rejectionRate: totalTrades > 0 ? ((rejected / totalTrades) * 100).toFixed(1) : 0,
      riskEvents,
      reconciliation: {
        passed: reconPassed,
        failed: reconFailed,
        passRate: (reconPassed + reconFailed) > 0
          ? ((reconPassed / (reconPassed + reconFailed)) * 100).toFixed(1)
          : "N/A",
      },
    });
  };

  useEffect(() => {
    fetchEvents();
    fetchSummary();
  }, [fetchEvents, fetchSummary]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { fetchEvents(); fetchSummary(); }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEvents, fetchSummary]);

  // Export handler — uses local compliance route for CSV export
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.symbol) params.set("symbol", filters.symbol.toUpperCase());
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);

      if (dataSource === "local") {
        // Use local compliance export route
        const res = await fetch(`/api/compliance/audit-log/export?${params}`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        // Use backend proxy export
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
      }
    } catch (e) {
      console.error("Audit export error:", e);
    }
  };

  // Journal note handlers
  const saveJournalNote = async (eventId) => {
    setJournalLoading((prev) => ({ ...prev, [eventId]: true }));
    try {
      const res = await fetch("/api/compliance/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: eventId,
          notes: journalInput.notes,
          tags: journalInput.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setJournalNotes((prev) => ({
          ...prev,
          [eventId]: data.entry?.journalNotes || { notes: journalInput.notes, tags: journalInput.tags.split(",").map((t) => t.trim()).filter(Boolean) },
        }));
      }
    } catch (e) {
      console.error("Journal save error:", e);
    }
    setJournalLoading((prev) => ({ ...prev, [eventId]: false }));
  };

  const openJournalPanel = (eventId) => {
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
      return;
    }
    setExpandedEvent(eventId);
    const existing = journalNotes[eventId];
    setJournalInput({
      notes: existing?.notes || "",
      tags: Array.isArray(existing?.tags) ? existing.tags.join(", ") : "",
    });
  };

  // Fetch journal entries for local data source events
  useEffect(() => {
    if (dataSource !== "local" || events.length === 0) return;
    const fetchJournals = async () => {
      try {
        const res = await fetch("/api/compliance/journal?limit=500");
        if (res.ok) {
          const data = await res.json();
          const notesMap = {};
          for (const entry of data.entries || []) {
            notesMap[entry.id] = entry.journalNotes;
          }
          setJournalNotes(notesMap);
        }
      } catch {
        // Silently fail
      }
    };
    fetchJournals();
  }, [dataSource, events.length]);

  const clearFilters = () => {
    setFilters({ event_type: "", symbol: "", date_from: "", date_to: "" });
    setDatePreset("custom");
    setOffset(0);
  };

  const hasActiveFilters = filters.event_type || filters.symbol || filters.date_from || filters.date_to;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const formatEventType = (type) => type?.replace(/_/g, " ") || "";

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">Trade Audit Log</h2>
          <div className="flex gap-2 items-center flex-wrap">
            {/* Data Source Toggle */}
            <div className="join">
              <button
                className={`btn btn-xs join-item ${dataSource === "backend" ? "btn-active btn-primary" : ""}`}
                onClick={() => { setDataSource("backend"); setOffset(0); }}
                title="Audit log from FastAPI backend"
              >
                Backend Audit
              </button>
              <button
                className={`btn btn-xs join-item ${dataSource === "local" ? "btn-active btn-secondary" : ""}`}
                onClick={() => { setDataSource("local"); setOffset(0); }}
                title="Audit log directly from Supabase"
              >
                Local Audit
              </button>
            </div>
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

        {/* Data source indicator */}
        <div className="flex items-center gap-2 mt-1">
          <span className={`badge badge-xs ${dataSource === "local" ? "badge-secondary" : "badge-primary"}`}></span>
          <span className="text-xs opacity-60">
            {dataSource === "local"
              ? "Direct Supabase query (bypasses FastAPI)"
              : "FastAPI backend proxy"}
          </span>
        </div>

        {/* Compliance Summary (for local data source) */}
        {(dataSource === "local" && complianceSummary) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-xs">Total Trades</div>
              <div className="stat-value text-lg">{complianceSummary.totalTrades}</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-xs">Fill Rate</div>
              <div className="stat-value text-lg text-success">{complianceSummary.fillRate}%</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-xs">Rejection Rate</div>
              <div className="stat-value text-lg text-error">{complianceSummary.rejectionRate}%</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-xs">Risk Events</div>
              <div className="stat-value text-lg text-warning">{complianceSummary.riskEvents}</div>
            </div>
          </div>
        )}

        {/* Summary (for backend data source) */}
        {(dataSource === "backend" && summary) && (
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
          {/* Date Preset Buttons */}
          <div className="join">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`btn btn-xs join-item ${datePreset === p.value ? "btn-active btn-accent" : ""}`}
                onClick={() => {
                  setDatePreset(p.value);
                  if (p.value !== "custom") {
                    const range = getDateRange(p.value);
                    setFilters((prev) => ({ ...prev, date_from: range.from, date_to: range.to }));
                  }
                  setOffset(0);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

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
          {datePreset === "custom" && (
            <>
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
            </>
          )}
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
            <div key={event.id || i}>
              <div className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2 text-sm hover:bg-base-300 transition-colors">
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
                {/* Journal indicator */}
                {dataSource === "local" && journalNotes[event.id] && (
                  <span className="badge badge-xs badge-accent" title="Has journal notes">📓</span>
                )}
                <span className="text-xs opacity-40 ml-auto whitespace-nowrap">
                  {new Date(event.created_at).toLocaleString()}
                </span>
                {/* Journal toggle button (local data source only) */}
                {dataSource === "local" && (
                  <button
                    className="btn btn-ghost btn-xs ml-1"
                    onClick={() => openJournalPanel(event.id)}
                    title="Add/edit journal note"
                  >
                    📝
                  </button>
                )}
              </div>

              {/* Trade Journal Panel (expandable) */}
              {dataSource === "local" && expandedEvent === event.id && (
                <div className="bg-base-300 rounded-b-lg px-3 py-2 ml-2 mr-2 border-t border-base-content/10">
                  <div className="text-xs font-semibold mb-1 opacity-70">Trade Journal</div>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full mb-1"
                    rows={2}
                    placeholder="Add notes about this trade..."
                    value={journalInput.notes}
                    onChange={(e) => setJournalInput({ ...journalInput, notes: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full mb-2"
                    placeholder="Tags (comma separated, e.g. momentum, breakout)"
                    value={journalInput.tags}
                    onChange={(e) => setJournalInput({ ...journalInput, tags: e.target.value })}
                  />
                  <div className="flex gap-2 items-center">
                    <button
                      className="btn btn-primary btn-xs"
                      disabled={journalLoading[event.id]}
                      onClick={() => saveJournalNote(event.id)}
                    >
                      {journalLoading[event.id] ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : "Save Note"}
                    </button>
                    {journalNotes[event.id] && (
                      <span className="text-xs opacity-50">
                        Last updated: {journalNotes[event.id].updatedAt
                          ? new Date(journalNotes[event.id].updatedAt).toLocaleString()
                          : "unknown"}
                      </span>
                    )}
                  </div>
                  {/* Existing tags */}
                  {journalNotes[event.id]?.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {journalNotes[event.id].tags.map((tag, ti) => (
                        <span key={ti} className="badge badge-sm badge-outline">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
