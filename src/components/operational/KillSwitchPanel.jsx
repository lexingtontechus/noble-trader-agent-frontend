"use client";
import { useState, useEffect, useCallback } from "react";

export default function KillSwitchPanel({ bffFetch }) {
  const [halts, setHalts] = useState([]);
  const [isHalted, setIsHalted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activateForm, setActivateForm] = useState({
    level: "global_halt",
    reason: "manual",
    scope: "",
    notes: "",
  });
  const [confirmStep, setConfirmStep] = useState(0); // 0=hidden, 1=first confirm, 2=final confirm

  const fetchStatus = useCallback(async () => {
    try {
      const res = await bffFetch("/operational/kill-switch/status");
      if (res.ok) {
        const data = await res.json();
        setIsHalted(data.is_halted);
        setHalts(data.active_halts || []);
      }
    } catch (e) {
      console.error("Kill switch status fetch error:", e);
    }
  }, [bffFetch]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleActivate = async () => {
    setLoading(true);
    try {
      const res = await bffFetch("/operational/kill-switch/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activateForm),
      });
      if (res.ok) {
        await fetchStatus();
        setShowActivateModal(false);
        setConfirmStep(0);
      }
    } catch (e) {
      console.error("Activate halt error:", e);
    }
    setLoading(false);
  };

  const handleDeactivate = async (level, scope) => {
    setLoading(true);
    try {
      await bffFetch("/operational/kill-switch/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, scope }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Deactivate halt error:", e);
    }
    setLoading(false);
  };

  const handleCancelAll = async () => {
    if (!confirm("Cancel ALL open orders? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await bffFetch("/operational/kill-switch/cancel-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Cancelled ${data.cancelled_count} orders`);
      }
    } catch (e) {
      console.error("Cancel all error:", e);
    }
    setLoading(false);
  };

  const handleCloseAll = async () => {
    if (!confirm("Close ALL open positions? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await bffFetch("/operational/kill-switch/close-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Closed ${data.closed_count} positions`);
      }
    } catch (e) {
      console.error("Close all error:", e);
    }
    setLoading(false);
  };

  const levelBadge = (level) => {
    const map = {
      global_halt: "badge-error",
      user_halt: "badge-warning",
      symbol_halt: "badge-info",
    };
    return map[level] || "badge-ghost";
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-error">
            Emergency Controls
          </h2>
          <div className="flex gap-2 items-center">
            {isHalted ? (
              <span className="badge badge-error badge-lg animate-pulse">TRADING HALTED</span>
            ) : (
              <span className="badge badge-success badge-lg">Trading Active</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={fetchStatus}>Refresh</button>
          </div>
        </div>

        {/* Activate Halt */}
        <div className="divider mt-1 mb-1"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            className="btn btn-error btn-outline"
            onClick={() => { setActivateForm({ ...activateForm, level: "global_halt" }); setShowActivateModal(true); setConfirmStep(1); }}
            disabled={isHalted}
          >
            Activate Global Halt
          </button>
          <button
            className="btn btn-warning btn-outline"
            onClick={() => { setActivateForm({ ...activateForm, level: "user_halt" }); setShowActivateModal(true); setConfirmStep(1); }}
          >
            Halt User Trading
          </button>
          <button
            className="btn btn-info btn-outline"
            onClick={() => { setActivateForm({ ...activateForm, level: "symbol_halt" }); setShowActivateModal(true); setConfirmStep(1); }}
          >
            Halt Symbol Trading
          </button>
        </div>

        {/* Emergency Actions */}
        <div className="divider mt-2 mb-2"></div>
        <h3 className="font-semibold text-sm opacity-70">Emergency Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button className="btn btn-error btn-sm" onClick={handleCancelAll} disabled={loading}>
            Cancel All Open Orders
          </button>
          <button className="btn btn-error btn-sm" onClick={handleCloseAll} disabled={loading}>
            Close All Positions
          </button>
        </div>

        {/* Active Halts */}
        {halts.length > 0 && (
          <>
            <div className="divider mt-2 mb-2"></div>
            <h3 className="font-semibold text-sm opacity-70">Active Halts</h3>
            <div className="space-y-2">
              {halts.map((halt, i) => (
                <div key={i} className="alert alert-warning shadow-sm">
                  <div className="flex-1">
                    <span className={`badge ${levelBadge(halt.level)} mr-2`}>{halt.level}</span>
                    <span className="badge badge-ghost mr-2">{halt.reason}</span>
                    {halt.scope && <span className="font-mono text-sm mr-2">[{halt.scope}]</span>}
                    <span className="text-xs opacity-60">by {halt.triggered_by}</span>
                  </div>
                  <button
                    className="btn btn-success btn-xs"
                    onClick={() => handleDeactivate(halt.level, halt.scope)}
                    disabled={loading}
                  >
                    Deactivate
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Activation Modal */}
        {showActivateModal && (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg text-error">
                {confirmStep === 2 ? "FINAL CONFIRMATION" : "Activate Trading Halt"}
              </h3>
              {confirmStep === 1 && (
                <>
                  <p className="py-2">You are about to activate a <strong>{activateForm.level.replace("_", " ").toUpperCase()}</strong>.</p>
                  <div className="form-control w-full mb-2">
                    <label className="label"><span className="label-text">Reason</span></label>
                    <select className="select select-bordered w-full" value={activateForm.reason} onChange={(e) => setActivateForm({ ...activateForm, reason: e.target.value })}>
                      <option value="manual">Manual</option>
                      <option value="circuit_breaker">Circuit Breaker</option>
                      <option value="max_drawdown">Max Drawdown</option>
                      <option value="data_feed_error">Data Feed Error</option>
                      <option value="compliance">Compliance</option>
                      <option value="reconciliation_failure">Reconciliation Failure</option>
                    </select>
                  </div>
                  {(activateForm.level === "user_halt" || activateForm.level === "symbol_halt") && (
                    <div className="form-control w-full mb-2">
                      <label className="label"><span className="label-text">{activateForm.level === "user_halt" ? "User ID" : "Symbol"}</span></label>
                      <input type="text" className="input input-bordered w-full" value={activateForm.scope} onChange={(e) => setActivateForm({ ...activateForm, scope: e.target.value })} placeholder={activateForm.level === "user_halt" ? "Enter user ID" : "e.g. AAPL"} />
                    </div>
                  )}
                  <div className="form-control w-full mb-2">
                    <label className="label"><span className="label-text">Notes (optional)</span></label>
                    <textarea className="textarea textarea-bordered w-full" value={activateForm.notes} onChange={(e) => setActivateForm({ ...activateForm, notes: e.target.value })} placeholder="Reason for halt..."></textarea>
                  </div>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => { setShowActivateModal(false); setConfirmStep(0); }}>Cancel</button>
                    <button className="btn btn-error" onClick={() => setConfirmStep(2)}>Proceed to Confirm</button>
                  </div>
                </>
              )}
              {confirmStep === 2 && (
                <>
                  <div className="alert alert-error mb-4">
                    <span>This will <strong>IMMEDIATELY HALT</strong> all trading at the <strong>{activateForm.level.replace("_", " ").toUpperCase()}</strong> level. No new orders will be accepted until the halt is deactivated.</span>
                  </div>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setConfirmStep(1)}>Go Back</button>
                    <button className="btn btn-error" onClick={handleActivate} disabled={loading}>
                      {loading ? <span className="loading loading-spinner loading-xs"></span> : "ACTIVATE HALT"}
                    </button>
                  </div>
                </>
              )}
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => { setShowActivateModal(false); setConfirmStep(0); }}>close</button></form>
          </dialog>
        )}
      </div>
    </div>
  );
}
