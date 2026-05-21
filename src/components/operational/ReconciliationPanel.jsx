"use client";
import { useState, useEffect, useCallback } from "react";
import { useRole } from "@/hooks/useRole";

const STATUS_COLORS = {
  MATCHED: "badge-success",
  PARTIAL_FILL: "badge-warning",
  MISSED_FILL: "badge-error",
  PRICE_DEVIATION: "badge-warning",
  PENDING: "badge-ghost",
  ERROR: "badge-error",
};

const STATUS_ICONS = {
  MATCHED: "✓",
  PARTIAL_FILL: "⚠",
  MISSED_FILL: "✗",
  PRICE_DEVIATION: "⚠",
  PENDING: "○",
  ERROR: "✗",
};

export default function ReconciliationPanel({ bffFetch }) {
  const { isAdmin } = useRole();

  // State
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [autoRecon, setAutoRecon] = useState({ enabled: false, time: "16:05" });
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("summary"); // summary | details | history
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedSection, setExpandedSection] = useState(null);
  const [orderId, setOrderId] = useState("");
  const [orderResult, setOrderResult] = useState(null);
  const [autoHaltIndicator, setAutoHaltIndicator] = useState(null);

  // Default dates: today
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!dateFrom) setDateFrom(today);
    if (!dateTo) setDateTo(today);
  }, []);

  // Fetch reconciliation history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/reconciliation/history?limit=20");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);

        // Check for auto-halt in history
        const haltRun = (data.history || []).find(
          (h) => h.status === "failed" && h.details?.halted
        );
        if (haltRun) {
          setAutoHaltIndicator(haltRun);
        }
      }
    } catch (e) {
      console.error("Reconciliation history fetch error:", e);
    }
    setHistoryLoading(false);
  }, []);

  // Fetch auto-recon setting
  const fetchAutoRecon = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/reconciliation/auto");
      if (res.ok) {
        const data = await res.json();
        setAutoRecon(data);
      }
    } catch (e) {
      console.error("Auto-recon setting fetch error:", e);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchHistory();
    fetchAutoRecon();
  }, [fetchHistory, fetchAutoRecon]);

  // Run reconciliation
  const handleRunReconciliation = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = dateFrom || today;
      const to = dateTo || today;

      const res = await fetch("/api/reconciliation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: new Date(from).toISOString(),
          dateTo: new Date(to + "T23:59:59").toISOString(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastResult(data);
        setActiveTab("summary");
        // Refresh history
        fetchHistory();
      } else {
        const err = await res.json().catch(() => ({ error: "Reconciliation failed" }));
        console.error("Reconciliation error:", err.error);
      }
    } catch (e) {
      console.error("Reconciliation run error:", e);
    }
    setLoading(false);
  };

  // Toggle auto-reconciliation
  const handleToggleAutoRecon = async () => {
    try {
      const res = await fetch("/api/reconciliation/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !autoRecon.enabled,
          time: autoRecon.time,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoRecon(data);
      }
    } catch (e) {
      console.error("Toggle auto-recon error:", e);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!lastResult) return;

    const rows = [];
    // Header
    rows.push(["Category", "Order ID", "Symbol", "Direction", "Expected Price", "Fill Price", "Expected Qty", "Fill Qty", "Price Diff %", "Notes"]);

    // Matched
    for (const r of lastResult.matched || []) {
      rows.push(["Matched", r.orderId, r.symbol, r.direction, r.expectedPrice, r.fillPrice, r.expectedQty, r.fillQty, r.priceDiffPct, ""]);
    }
    // Price Discrepancy
    for (const r of lastResult.priceDiscrepancy || []) {
      rows.push(["Price Discrepancy", r.orderId, r.symbol, r.direction, r.expectedPrice, r.fillPrice, r.expectedQty, r.fillQty, r.priceDiffPct, `Tolerance: ${r.tolerancePct}%`]);
    }
    // Quantity Mismatch
    for (const r of lastResult.quantityMismatch || []) {
      rows.push(["Qty Mismatch", r.orderId, r.symbol, r.direction, r.expectedPrice, r.fillPrice, r.expectedQty, r.fillQty, "", `Diff: ${r.diff}`]);
    }
    // Missing Fills
    for (const r of lastResult.missingFills || []) {
      rows.push(["Missing Fill", r.orderId, r.symbol, r.direction, r.expectedPrice, "", r.expectedQty, "", "", r.note || ""]);
    }
    // Phantom Fills
    for (const r of lastResult.phantomFills || []) {
      rows.push(["Phantom Fill", r.orderId, r.symbol, r.direction, "", r.fillPrice, "", r.fillQty, "", r.note || ""]);
    }
    // Stale Orders
    for (const r of lastResult.staleOrders || []) {
      rows.push(["Stale Order", r.orderId, r.symbol, r.direction, r.expectedPrice, "", r.expectedQty, "", "", `${r.staleMinutes} min stale`]);
    }

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconciliation_${dateFrom || "unknown"}_${new Date().toISOString().slice(0, 19)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Legacy bffFetch for order-level reconciliation
  const handleOrderReconciliation = async () => {
    if (!orderId.trim() || !bffFetch) return;
    setLoading(true);
    setOrderResult(null);
    try {
      const res = await bffFetch(`/operational/reconcile/order?order_id=${encodeURIComponent(orderId.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setOrderResult(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: "Reconciliation failed" }));
        setOrderResult({ error: err.error || err.detail || "Reconciliation failed" });
      }
    } catch (e) {
      console.error("Order reconciliation error:", e);
      setOrderResult({ error: e.message });
    }
    setLoading(false);
  };

  // Match rate gauge color
  const matchRateColor = (rate) => {
    if (rate >= 95) return "text-success";
    if (rate >= 85) return "text-warning";
    return "text-error";
  };

  const matchRateBadge = (rate) => {
    if (rate >= 95) return "badge-success";
    if (rate >= 85) return "badge-warning";
    return "badge-error";
  };

  const statusBadge = (status) => {
    if (status === "passed") return "badge-success";
    if (status === "warning") return "badge-warning";
    return "badge-error";
  };

  const slippageColor = (bps) => {
    const abs = Math.abs(bps);
    if (abs > 200) return "text-error font-bold";
    if (abs > 50) return "text-warning";
    return "";
  };

  // Compute summary from lastResult
  const summary = lastResult?.summary || null;

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">
            Fill Reconciliation
            {lastResult?.halted && (
              <span className="badge badge-error badge-lg animate-pulse ml-2">HALT TRIGGERED</span>
            )}
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={handleRunReconciliation} disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "Run Now"}
            </button>
            {lastResult && (
              <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} title="Export CSV">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
            )}
          </div>
        </div>

        {/* Date range + Auto toggle */}
        <div className="flex flex-wrap items-end gap-2 mt-2">
          <div className="form-control">
            <label className="label py-0"><span className="label-text text-xs">From</span></label>
            <input
              type="date"
              className="input input-bordered input-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="form-control">
            <label className="label py-0"><span className="label-text text-xs">To</span></label>
            <input
              type="date"
              className="input input-bordered input-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs opacity-70">Auto-recon</span>
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-success"
                checked={autoRecon.enabled}
                onChange={handleToggleAutoRecon}
              />
              {autoRecon.enabled && (
                <span className="badge badge-success badge-sm">{autoRecon.time} ET</span>
              )}
            </div>
          )}
        </div>

        {/* Auto-halt indicator */}
        {autoHaltIndicator && (
          <div className="alert alert-error shadow-sm mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="flex-1">
              <span className="font-semibold text-sm">Auto-halt was triggered</span>
              <span className="text-xs ml-2 opacity-70">
                {new Date(autoHaltIndicator.created_at).toLocaleString()} —
                {autoHaltIndicator.discrepancy_count} discrepancies, {autoHaltIndicator.phantom_count} phantom fills
              </span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="tabs tabs-boxed mt-2" role="tablist">
          <button
            className={`tab tab-sm ${activeTab === "summary" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("summary")}
            role="tab"
          >
            Summary
          </button>
          <button
            className={`tab tab-sm ${activeTab === "details" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("details")}
            role="tab"
          >
            Details
          </button>
          <button
            className={`tab tab-sm ${activeTab === "history" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("history")}
            role="tab"
          >
            History
          </button>
        </div>

        {/* ── Summary Tab ────────────────────────────────────────────────── */}
        {activeTab === "summary" && (
          <div className="mt-3">
            {summary ? (
              <>
                {/* Match Rate Gauge */}
                <div className="flex items-center justify-center mb-4">
                  <div className="text-center">
                    <div className={`text-5xl font-bold ${matchRateColor(summary.matchRate)}`}>
                      {summary.matchRate.toFixed(1)}%
                    </div>
                    <div className="text-sm opacity-70 mt-1">Match Rate</div>
                    <span className={`badge ${matchRateBadge(summary.matchRate)} mt-1`}>
                      {summary.matchRate >= 95 ? "Excellent" : summary.matchRate >= 85 ? "Acceptable" : "Critical"}
                    </span>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Expected</div>
                    <div className="stat-value text-lg">{summary.totalExpected}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Filled</div>
                    <div className="stat-value text-lg text-success">{summary.totalFilled}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Matched</div>
                    <div className="stat-value text-lg text-success">{(lastResult?.matched || []).length}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Discrepancies</div>
                    <div className="stat-value text-lg text-warning">{summary.discrepancyCount}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Stale</div>
                    <div className="stat-value text-lg text-warning">{summary.staleCount}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-2">
                    <div className="stat-title text-xs">Phantom</div>
                    <div className="stat-value text-lg text-error">{summary.phantomCount}</div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-sm font-semibold">Status:</span>
                  <span className={`badge ${statusBadge(lastResult.status)}`}>
                    {lastResult.status.toUpperCase()}
                  </span>
                  {lastResult.halted && (
                    <span className="badge badge-error animate-pulse">AUTO-HALT ACTIVATED</span>
                  )}
                  <span className="text-xs opacity-50 ml-auto">
                    Run at: {new Date(lastResult.runAt).toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center py-8 opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-30"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <p className="text-sm">Run a reconciliation to see results</p>
                <p className="text-xs mt-1">Select a date range and click &quot;Run Now&quot;</p>
              </div>
            )}
          </div>
        )}

        {/* ── Details Tab ────────────────────────────────────────────────── */}
        {activeTab === "details" && (
          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
            {lastResult ? (
              <>
                {/* Price Discrepancies */}
                {(lastResult.priceDiscrepancy || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-base-200">
                    <input
                      type="checkbox"
                      checked={expandedSection === "priceDiscrepancy"}
                      onChange={() => setExpandedSection(expandedSection === "priceDiscrepancy" ? null : "priceDiscrepancy")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-warning badge-sm">{(lastResult.priceDiscrepancy || []).length}</span>
                      Price Discrepancies
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Expected</th><th>Fill</th><th>Diff %</th><th>Order ID</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.priceDiscrepancy || []).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>${r.expectedPrice?.toFixed(2)}</td>
                              <td>${r.fillPrice?.toFixed(2)}</td>
                              <td className="text-warning">{r.priceDiffPct}%</td>
                              <td className="font-mono text-xs opacity-50" title={r.orderId}>{r.orderId?.slice(0, 10)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Quantity Mismatches */}
                {(lastResult.quantityMismatch || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-base-200">
                    <input
                      type="checkbox"
                      checked={expandedSection === "quantityMismatch"}
                      onChange={() => setExpandedSection(expandedSection === "quantityMismatch" ? null : "quantityMismatch")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-warning badge-sm">{(lastResult.quantityMismatch || []).length}</span>
                      Quantity Mismatches
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Expected Qty</th><th>Fill Qty</th><th>Diff</th><th>Order ID</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.quantityMismatch || []).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>{r.expectedQty}</td>
                              <td>{r.fillQty}</td>
                              <td className={r.diff > 0 ? "text-success" : "text-error"}>{r.diff > 0 ? "+" : ""}{r.diff}</td>
                              <td className="font-mono text-xs opacity-50" title={r.orderId}>{r.orderId?.slice(0, 10)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Missing Fills */}
                {(lastResult.missingFills || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-base-200">
                    <input
                      type="checkbox"
                      checked={expandedSection === "missingFills"}
                      onChange={() => setExpandedSection(expandedSection === "missingFills" ? null : "missingFills")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-error badge-sm">{(lastResult.missingFills || []).length}</span>
                      Missing Fills
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Dir</th><th>Price</th><th>Qty</th><th>Min Ago</th><th>Order ID</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.missingFills || []).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>{r.direction}</td>
                              <td>${r.expectedPrice?.toFixed(2)}</td>
                              <td>{r.expectedQty}</td>
                              <td>{r.minutesSinceSubmit}m</td>
                              <td className="font-mono text-xs opacity-50" title={r.orderId}>{r.orderId?.slice(0, 10)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Phantom Fills */}
                {(lastResult.phantomFills || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-error/10 border border-error/20">
                    <input
                      type="checkbox"
                      checked={expandedSection === "phantomFills"}
                      onChange={() => setExpandedSection(expandedSection === "phantomFills" ? null : "phantomFills")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-error badge-sm">{(lastResult.phantomFills || []).length}</span>
                      Phantom Fills
                      <span className="text-xs opacity-60 ml-1">⚠ No matching order submitted</span>
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Dir</th><th>Fill Price</th><th>Fill Qty</th><th>Source</th><th>Order ID</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.phantomFills || []).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>{r.direction}</td>
                              <td>${r.fillPrice?.toFixed(2)}</td>
                              <td>{r.fillQty}</td>
                              <td><span className="badge badge-ghost badge-sm">{r.fillSource}</span></td>
                              <td className="font-mono text-xs opacity-50" title={r.orderId}>{r.orderId?.slice(0, 10)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Stale Orders */}
                {(lastResult.staleOrders || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-base-200">
                    <input
                      type="checkbox"
                      checked={expandedSection === "staleOrders"}
                      onChange={() => setExpandedSection(expandedSection === "staleOrders" ? null : "staleOrders")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-warning badge-sm">{(lastResult.staleOrders || []).length}</span>
                      Stale Orders
                      <span className="text-xs opacity-60 ml-1">No fill after 30+ min</span>
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Dir</th><th>Price</th><th>Qty</th><th>Stale (min)</th><th>Order ID</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.staleOrders || []).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>{r.direction}</td>
                              <td>${r.expectedPrice?.toFixed(2)}</td>
                              <td>{r.expectedQty}</td>
                              <td className="text-warning">{r.staleMinutes}m</td>
                              <td className="font-mono text-xs opacity-50" title={r.orderId}>{r.orderId?.slice(0, 10)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Matched */}
                {(lastResult.matched || []).length > 0 && (
                  <div className="collapse collapse-arrow bg-base-200">
                    <input
                      type="checkbox"
                      checked={expandedSection === "matched"}
                      onChange={() => setExpandedSection(expandedSection === "matched" ? null : "matched")}
                    />
                    <div className="collapse-title font-semibold text-sm flex items-center gap-2">
                      <span className="badge badge-success badge-sm">{(lastResult.matched || []).length}</span>
                      Matched
                    </div>
                    <div className="collapse-content">
                      <table className="table table-xs">
                        <thead>
                          <tr><th>Symbol</th><th>Dir</th><th>Expected</th><th>Fill</th><th>Slippage</th><th>Source</th></tr>
                        </thead>
                        <tbody>
                          {(lastResult.matched || []).slice(0, 30).map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono font-bold">{r.symbol}</td>
                              <td>{r.direction}</td>
                              <td>${r.expectedPrice?.toFixed(2)}</td>
                              <td>${r.fillPrice?.toFixed(2)}</td>
                              <td className={slippageColor(parseFloat(r.priceDiffPct) * 100)}>{r.priceDiffPct}%</td>
                              <td><span className="badge badge-ghost badge-xs">{r.fillSource}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* No issues found */}
                {!lastResult.priceDiscrepancy?.length &&
                  !lastResult.quantityMismatch?.length &&
                  !lastResult.missingFills?.length &&
                  !lastResult.phantomFills?.length &&
                  !lastResult.staleOrders?.length && (
                    <div className="text-center py-4">
                      <span className="text-success text-2xl">✓</span>
                      <p className="text-sm text-success font-semibold mt-1">All trades reconciled successfully</p>
                    </div>
                  )}
              </>
            ) : (
              <div className="text-center py-8 opacity-50">
                <p className="text-sm">No reconciliation results yet</p>
              </div>
            )}

            {/* Order-Specific Reconciliation (legacy) */}
            {bffFetch && (
              <>
                <div className="divider mt-3 mb-2"></div>
                <h3 className="font-semibold text-sm opacity-70 mb-1">Reconcile Single Order</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input input-bordered input-sm flex-1 font-mono"
                    placeholder="Alpaca Order ID"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleOrderReconciliation()}
                  />
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={handleOrderReconciliation}
                    disabled={loading || !orderId.trim()}
                  >
                    Check
                  </button>
                </div>
                {orderResult && (
                  <div className={`alert ${orderResult.error ? "alert-error" : orderResult.status === "MATCHED" ? "alert-success" : "alert-warning"} shadow-sm mt-2`}>
                    <div className="flex-1">
                      {orderResult.error ? (
                        <span className="text-sm">{orderResult.error}</span>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`badge ${STATUS_COLORS[orderResult.status] || "badge-ghost"}`}>
                            {STATUS_ICONS[orderResult.status] || "?"} {orderResult.status}
                          </span>
                          {orderResult.symbol && <span className="font-mono font-bold">{orderResult.symbol}</span>}
                          {orderResult.slippage_bps != null && (
                            <span className={slippageColor(orderResult.slippage_bps)}>
                              {orderResult.slippage_bps.toFixed(1)} bps slippage
                            </span>
                          )}
                          {orderResult.discrepancy_notes && (
                            <span className="text-xs opacity-60">{orderResult.discrepancy_notes}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── History Tab ────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="mt-3">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {history.map((run) => (
                  <div key={run.id} className="card bg-base-200 border border-base-300">
                    <div className="card-body p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`badge ${statusBadge(run.status)}`}>
                            {run.status.toUpperCase()}
                          </span>
                          <span className="font-mono text-sm">{run.run_date}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs opacity-70">
                          <span>Match: <strong className={matchRateColor(run.match_rate)}>{run.match_rate?.toFixed(1)}%</strong></span>
                          <span>Expected: {run.total_expected}</span>
                          <span>Filled: {run.total_filled}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs mt-1">
                        <span className={run.discrepancy_count > 0 ? "text-warning" : "text-success"}>
                          {run.discrepancy_count} discrepancies
                        </span>
                        <span className={run.stale_count > 0 ? "text-warning" : ""}>
                          {run.stale_count} stale
                        </span>
                        <span className={run.phantom_count > 0 ? "text-error font-bold" : ""}>
                          {run.phantom_count} phantom
                        </span>
                        {run.details?.halted && (
                          <span className="badge badge-error badge-sm animate-pulse">HALT</span>
                        )}
                        <span className="opacity-40 ml-auto">
                          {new Date(run.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 opacity-50">
                <p className="text-sm">No reconciliation history</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
