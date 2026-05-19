"use client";
import { useState, useEffect, useCallback } from "react";

const STATUS_COLORS = {
  MATCHED: "badge-success",
  PARTIAL_FILL: "badge-warning",
  MISSED_FILL: "badge-error",
  PRICE_DEVIATION: "badge-warning",
  PENDING: "badge-ghost",
  ERROR: "badge-error",
};

export default function ReconciliationPanel({ bffFetch }) {
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [positionRecon, setPositionRecon] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await bffFetch("/operational/reconcile/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.position_reconciliation) {
          setPositionRecon(data.position_reconciliation);
        }
      }
    } catch (e) {
      console.error("Reconciliation status fetch error:", e);
    }
  }, [bffFetch]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleRunReconciliation = async () => {
    setLoading(true);
    try {
      const res = await bffFetch("/operational/reconcile/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setStatus(data);
      }
    } catch (e) {
      console.error("Reconciliation run error:", e);
    }
    setLoading(false);
  };

  const handlePositionReconciliation = async () => {
    setLoading(true);
    try {
      const res = await bffFetch("/operational/reconcile/positions");
      if (res.ok) {
        const data = await res.json();
        setPositionRecon(data);
      }
    } catch (e) {
      console.error("Position reconciliation error:", e);
    }
    setLoading(false);
  };

  const matched = status?.status_counts?.MATCHED || 0;
  const warnings = (status?.status_counts?.PARTIAL_FILL || 0) + (status?.status_counts?.PRICE_DEVIATION || 0);
  const critical = (status?.status_counts?.MISSED_FILL || 0) + (status?.status_counts?.ERROR || 0);

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Fill Reconciliation</h2>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleRunReconciliation} disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "Run Now"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handlePositionReconciliation} disabled={loading}>
              Check Positions
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="stat bg-base-200 rounded-lg p-2">
            <div className="stat-title text-xs">Matched</div>
            <div className="stat-value text-lg text-success">{matched}</div>
          </div>
          <div className="stat bg-base-200 rounded-lg p-2">
            <div className="stat-title text-xs">Warnings</div>
            <div className="stat-value text-lg text-warning">{warnings}</div>
          </div>
          <div className="stat bg-base-200 rounded-lg p-2">
            <div className="stat-title text-xs">Critical</div>
            <div className="stat-value text-lg text-error">{critical}</div>
          </div>
        </div>

        {status?.last_run && (
          <div className="text-xs opacity-50 mt-1">
            Last reconciliation: {new Date(status.last_run).toLocaleString()}
          </div>
        )}

        {/* Position Reconciliation */}
        {positionRecon && (
          <>
            <div className="divider mt-1 mb-1"></div>
            <h3 className="font-semibold text-sm">Position Reconciliation</h3>
            <div className={`alert ${positionRecon.matched ? "alert-success" : "alert-warning"} shadow-sm`}>
              <div>
                <span className="font-bold">Our DB: {positionRecon.our_positions} positions</span>
                <span className="mx-2">|</span>
                <span className="font-bold">Alpaca: {positionRecon.alpaca_positions} positions</span>
                <span className="mx-2">|</span>
                <span className={`badge ${positionRecon.matched ? "badge-success" : "badge-error"}`}>
                  {positionRecon.matched ? "MATCH" : "MISMATCH"}
                </span>
              </div>
            </div>
            {positionRecon.discrepancies?.length > 0 && (
              <div className="space-y-1 mt-1">
                {positionRecon.discrepancies.map((d, i) => (
                  <div key={i} className="text-xs text-warning">
                    {d.type}: {d.symbols?.join(", ") || d.message}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Recent Results */}
        {results.length > 0 && (
          <>
            <div className="divider mt-1 mb-1"></div>
            <h3 className="font-semibold text-sm">Recent Results</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.slice(0, 20).map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-1.5 text-sm">
                  <span className={`badge badge-sm ${STATUS_COLORS[r.status] || "badge-ghost"}`}>{r.status}</span>
                  {r.symbol && <span className="font-mono font-bold">{r.symbol}</span>}
                  <span className="text-xs opacity-60 truncate max-w-[100px]">{r.order_id}</span>
                  {r.slippage_bps != null && (
                    <span className={`text-xs ${Math.abs(r.slippage_bps) > 200 ? "text-error font-bold" : Math.abs(r.slippage_bps) > 50 ? "text-warning" : ""}`}>
                      {r.slippage_bps.toFixed(1)} bps
                    </span>
                  )}
                  {r.discrepancy_notes && <span className="text-xs opacity-50 truncate max-w-[150px]">{r.discrepancy_notes}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
