"use client";
import { useState, useEffect, useCallback } from "react";

export default function ModeToggle({ bffFetch }) {
  const [mode, setMode] = useState("paper");
  const [modeState, setModeState] = useState(null);
  const [modeHealth, setModeHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [targetMode, setTargetMode] = useState(null);
  const [confirmationToken, setConfirmationToken] = useState(null);
  const [acknowledgmentText, setAcknowledgmentText] = useState("");
  const [checkboxes, setCheckboxes] = useState({
    tested: false,
    understand: false,
    riskLimits: false,
    verifiedKeys: false,
  });

  const fetchMode = useCallback(async () => {
    try {
      const res = await bffFetch("/operational/mode");
      if (res.ok) {
        const data = await res.json();
        setMode(data.current_mode);
        setModeState(data);
      }
    } catch (e) {
      console.error("Mode fetch error:", e);
    }
  }, [bffFetch]);

  const fetchModeHealth = useCallback(async () => {
    try {
      const res = await bffFetch("/operational/mode/health");
      if (res.ok) {
        setModeHealth(await res.json());
      }
    } catch (e) {
      // Health check is optional
    }
  }, [bffFetch]);

  useEffect(() => { fetchMode(); fetchModeHealth(); }, [fetchMode, fetchModeHealth]);

  // Refresh mode every 30s to stay in sync with backend
  useEffect(() => {
    const interval = setInterval(fetchMode, 30000);
    return () => clearInterval(interval);
  }, [fetchMode]);

  const handleRequestModeChange = async (newMode) => {
    setLoading(true);
    try {
      const res = await bffFetch("/operational/mode/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_mode: newMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setTargetMode(newMode);
        setConfirmationToken(data.confirmation_token);
        setAcknowledgmentText("");
        setCheckboxes({ tested: false, understand: false, riskLimits: false, verifiedKeys: false });
        setShowConfirmModal(true);
      } else {
        const err = await res.json().catch(() => ({ detail: "Mode change request failed" }));
        alert(err.detail || err.error || "Mode change request failed");
      }
    } catch (e) {
      console.error("Mode request error:", e);
      alert("Failed to connect to backend");
    }
    setLoading(false);
  };

  const handleConfirmModeChange = async () => {
    setLoading(true);
    try {
      const res = await bffFetch("/operational/mode/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation_token: confirmationToken,
          acknowledgment_text: acknowledgmentText,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMode(data.current_mode);
        setModeState(data);
        setShowConfirmModal(false);
        setConfirmationToken(null);
        fetchModeHealth();
      } else {
        const err = await res.json().catch(() => ({ detail: "Mode confirmation failed" }));
        alert(err.detail || err.error || "Mode confirmation failed");
      }
    } catch (e) {
      console.error("Mode confirm error:", e);
      alert("Failed to connect to backend");
    }
    setLoading(false);
  };

  const allChecked = Object.values(checkboxes).every(Boolean);
  const isLiveMode = mode === "live";
  const isSimulation = mode === "simulation";

  const modeBadge = () => {
    if (isLiveMode) return <span className="badge badge-error badge-lg animate-pulse">LIVE TRADING</span>;
    if (isSimulation) return <span className="badge badge-ghost badge-lg">SIMULATION</span>;
    return <span className="badge badge-success badge-lg">PAPER TRADING</span>;
  };

  return (
    <div className={`card shadow-xl border ${isLiveMode ? "border-error bg-error/5" : "border-base-300 bg-base-100"}`}>
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Trading Mode</h2>
          {modeBadge()}
        </div>

        {/* Current Mode Info */}
        <div className="mt-2 space-y-1">
          <div className="text-sm opacity-70">
            Current mode: <strong className={isLiveMode ? "text-error" : ""}>{mode.toUpperCase()}</strong>
            {modeState?.previous_mode && (
              <span className="ml-2 text-xs">(was {modeState.previous_mode})</span>
            )}
          </div>
          {modeState?.last_changed_at && (
            <div className="text-xs opacity-50">
              Last changed {new Date(modeState.last_changed_at).toLocaleString()}
              {modeState.last_changed_by && ` by ${modeState.last_changed_by}`}
            </div>
          )}
        </div>

        {/* Mode Health */}
        {modeHealth && (
          <div className="flex gap-2 mt-1">
            <span className={`badge badge-sm ${modeHealth.healthy ? "badge-success" : "badge-error"}`}>
              {modeHealth.healthy ? "Healthy" : "Unhealthy"}
            </span>
            {modeHealth.executor_url && (
              <span className="text-xs opacity-50 font-mono truncate max-w-[200px]">
                {modeHealth.executor_url}
              </span>
            )}
          </div>
        )}

        {/* Mode Switch Buttons */}
        <div className="divider mt-1 mb-1"></div>
        <div className="flex gap-2">
          {mode !== "paper" && (
            <button
              className="btn btn-success btn-sm flex-1"
              onClick={() => handleRequestModeChange("paper")}
              disabled={loading}
            >
              Switch to Paper
            </button>
          )}
          {mode !== "simulation" && mode !== "live" && (
            <button
              className="btn btn-ghost btn-sm flex-1"
              onClick={() => handleRequestModeChange("simulation")}
              disabled={loading}
            >
              Simulation
            </button>
          )}
          {mode !== "live" && (
            <button
              className="btn btn-error btn-sm flex-1"
              onClick={() => handleRequestModeChange("live")}
              disabled={loading}
            >
              Switch to Live
            </button>
          )}
        </div>

        {isLiveMode && (
          <div className="alert alert-error mt-2 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Real money is at risk. All orders execute on the live Alpaca API.</span>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-lg">
              {targetMode === "live" ? (
                <>
                  <h3 className="font-bold text-lg text-error">LIVE TRADING ACTIVATION</h3>
                  <div className="alert alert-error mt-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>You are about to switch to <strong>LIVE TRADING</strong>. Real money will be at risk. Losses are irreversible.</span>
                  </div>
                  <div className="form-control mt-4 space-y-2">
                    <label className="label cursor-pointer justify-start gap-3">
                      <input type="checkbox" className="checkbox checkbox-error checkbox-sm" checked={checkboxes.tested} onChange={(e) => setCheckboxes({ ...checkboxes, tested: e.target.checked })} />
                      <span className="label-text">I have tested my strategy in paper mode</span>
                    </label>
                    <label className="label cursor-pointer justify-start gap-3">
                      <input type="checkbox" className="checkbox checkbox-error checkbox-sm" checked={checkboxes.understand} onChange={(e) => setCheckboxes({ ...checkboxes, understand: e.target.checked })} />
                      <span className="label-text">I understand that losses are real and irreversible</span>
                    </label>
                    <label className="label cursor-pointer justify-start gap-3">
                      <input type="checkbox" className="checkbox checkbox-error checkbox-sm" checked={checkboxes.riskLimits} onChange={(e) => setCheckboxes({ ...checkboxes, riskLimits: e.target.checked })} />
                      <span className="label-text">I have set appropriate risk limits</span>
                    </label>
                    <label className="label cursor-pointer justify-start gap-3">
                      <input type="checkbox" className="checkbox checkbox-error checkbox-sm" checked={checkboxes.verifiedKeys} onChange={(e) => setCheckboxes({ ...checkboxes, verifiedKeys: e.target.checked })} />
                      <span className="label-text">I have verified my Alpaca live API keys</span>
                    </label>
                  </div>
                  <div className="form-control mt-4">
                    <label className="label"><span className="label-text font-bold">Type &quot;I UNDERSTAND THE RISKS&quot; to confirm:</span></label>
                    <input
                      type="text" className="input input-bordered input-error w-full font-mono"
                      value={acknowledgmentText} onChange={(e) => setAcknowledgmentText(e.target.value)}
                      placeholder="I UNDERSTAND THE RISKS"
                      autoComplete="off"
                    />
                  </div>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                    <button
                      className="btn btn-error"
                      disabled={!allChecked || acknowledgmentText.trim().toUpperCase() !== "I UNDERSTAND THE RISKS" || loading}
                      onClick={handleConfirmModeChange}
                    >
                      {loading ? <span className="loading loading-spinner loading-xs"></span> : "ACTIVATE LIVE TRADING"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-lg">Switch to {targetMode === "simulation" ? "Simulation" : "Paper Trading"}</h3>
                  <p className="py-4">This will switch from {mode} to {targetMode} trading mode{mode === "live" ? ". All open live orders will be cancelled as a safety measure." : "."}</p>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                    <button className="btn btn-success" disabled={loading} onClick={handleConfirmModeChange}>
                      {loading ? <span className="loading loading-spinner loading-xs"></span> : `Switch to ${targetMode === "simulation" ? "Simulation" : "Paper"}`}
                    </button>
                  </div>
                </>
              )}
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setShowConfirmModal(false)}>close</button></form>
          </dialog>
        )}
      </div>
    </div>
  );
}
