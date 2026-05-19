"use client";
import { useState, useEffect, useCallback } from "react";

export default function ModeToggle({ bffFetch }) {
  const [mode, setMode] = useState("paper");
  const [modeState, setModeState] = useState(null);
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

  useEffect(() => { fetchMode(); }, [fetchMode]);

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
        const err = await res.json();
        alert(err.detail || "Mode change request failed");
      }
    } catch (e) {
      console.error("Mode request error:", e);
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
      } else {
        const err = await res.json();
        alert(err.detail || "Mode confirmation failed");
      }
    } catch (e) {
      console.error("Mode confirm error:", e);
    }
    setLoading(false);
  };

  const allChecked = Object.values(checkboxes).every(Boolean);
  const isLiveMode = mode === "live";

  return (
    <div className={`card shadow-xl border ${isLiveMode ? "border-error bg-error/5" : "border-base-300 bg-base-100"}`}>
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Trading Mode</h2>
          {isLiveMode ? (
            <span className="badge badge-error badge-lg animate-pulse">LIVE TRADING</span>
          ) : mode === "simulation" ? (
            <span className="badge badge-ghost badge-lg">SIMULATION</span>
          ) : (
            <span className="badge badge-success badge-lg">PAPER TRADING</span>
          )}
        </div>

        {/* Current Mode Info */}
        <div className="mt-2">
          <div className="text-sm opacity-70">
            Current mode: <strong>{mode.toUpperCase()}</strong>
            {modeState?.previous_mode && (
              <span className="ml-2">(was {modeState.previous_mode})</span>
            )}
            {modeState?.last_changed_at && (
              <span className="ml-2 text-xs">
                changed {new Date(modeState.last_changed_at).toLocaleString()} by {modeState.last_changed_by}
              </span>
            )}
          </div>
        </div>

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
            Real money is at risk. All orders will be executed on the live Alpaca API.
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
                    <span>You are about to switch to LIVE TRADING. Real money will be at risk.</span>
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
                      type="text" className="input input-bordered input-error w-full"
                      value={acknowledgmentText} onChange={(e) => setAcknowledgmentText(e.target.value)}
                      placeholder="I UNDERSTAND THE RISKS"
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
                  <h3 className="font-bold text-lg">Switch to Paper Trading</h3>
                  <p className="py-4">This will switch from live to paper trading mode. All open live orders will be cancelled as a safety measure.</p>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                    <button className="btn btn-success" disabled={loading} onClick={handleConfirmModeChange}>
                      {loading ? <span className="loading loading-spinner loading-xs"></span> : "Switch to Paper"}
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
