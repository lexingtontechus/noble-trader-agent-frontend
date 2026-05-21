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

const STATUS_ICONS = {
  MATCHED: "✓",
  PARTIAL_FILL: "⚠",
  MISSED_FILL: "✗",
  PRICE_DEVIATION: "⚠",
  PENDING: "○",
  ERROR: "✗",
};

export default function ReconciliationPanel({ bffFetch }) {
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [positionRecon, setPositionRecon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderResult, setOrderResult] = useState(null);

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

  // Auto-refresh status every 60s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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

  const handleOrderReconciliation = async () => {
    if (!orderId.trim()) return;
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

  const matched = status?.status_counts?.MATCHED || 0;
  const warnings = (status?.status_counts?.PARTIAL_FILL || 0) + (status?.status_counts?.PRICE_DEVIATION || 0);
  const critical = (status?.status_counts?.MISSED_FILL || 0) + (status?.status_counts?.ERROR || 0);

  const slippageColor = (bps) => {
    const abs = Math.abs(bps);
    if (abs > 200) return "text-error font-bold";
    if (abs > 50) return "text-warning";
    return "";
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Fill Reconciliation</h2>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleRunReconciliation} disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "Run Now"}
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
            {status.total_reconciled > 0 && ` (${status.total_reconciled} orders checked)`}
          </div>
        )}

        {/* Quick Actions */}
        <div className="divider mt-1 mb-1"></div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-ghost btn-sm" onClick={handlePositionReconciliation} disabled={loading}>
            Check Positions
          </button>
        </div>

        {/* Order-Specific Reconciliation */}
        <div className="mt-2">
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
        </div>

        {/* Position Reconciliation */}
        {positionRecon && (
          <>
            <div className="divider mt-2 mb-1"></div>
            <h3 className="font-semibold text-sm">Position Reconciliation</h3>
            <div className={`alert ${positionRecon.matched ? "alert-success" : "alert-warning"} shadow-sm`}>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    <span className="font-bold">Our DB: {positionRecon.our_positions}</span>
                    <span className="mx-2 text-base-content/30">|</span>
                    <span className="font-bold">Alpaca: {positionRecon.alpaca_positions}</span>
                  </div>
                  <span className={`badge ${positionRecon.matched ? "badge-success" : "badge-error"}`}>
                    {positionRecon.matched ? "MATCH" : "MISMATCH"}
                  </span>
                </div>
                {positionRecon.discrepancies?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {positionRecon.discrepancies.map((d, i) => (
                      <div key={i} className="text-xs text-warning flex items-center gap-1">
                        <span>⚠</span>
                        <span>{d.type}: {d.symbols?.join(", ") || d.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Recent Results */}
        {results.length > 0 && (
          <>
            <div className="divider mt-2 mb-1"></div>
            <h3 className="font-semibold text-sm">Recent Results ({results.length})</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.slice(0, 20).map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-1.5 text-sm">
                  <span className={`badge badge-sm ${STATUS_COLORS[r.status] || "badge-ghost"}`}>
                    {STATUS_ICONS[r.status] || "?"}
                  </span>
                  {r.symbol && <span className="font-mono font-bold">{r.symbol}</span>}
                  <span className="text-xs opacity-60 truncate max-w-[100px] font-mono" title={r.order_id}>
                    {r.order_id?.slice(0, 10)}...
                  </span>
                  {r.slippage_bps != null && (
                    <span className={`text-xs ${slippageColor(r.slippage_bps)}`}>
                      {r.slippage_bps.toFixed(1)} bps
                    </span>
                  )}
                  {r.discrepancy_notes && (
                    <span className="text-xs opacity-50 truncate max-w-[150px]">{r.discrepancy_notes}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
