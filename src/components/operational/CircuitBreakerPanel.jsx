"use client";
import { useState, useEffect, useCallback } from "react";
import { useRole } from "@/hooks/useRole";
import InfoTip from "@/components/shared/InfoTip";

const BREAKER_TYPES = [
  { value: "max_position_size", label: "Max Position Size", description: "Max $ value per position", tip: "Maximum dollar value allowed per single position" },
  { value: "max_portfolio_heat", label: "Max Portfolio Heat", description: "Max total portfolio risk %", tip: "Maximum total portfolio risk exposure as a percentage" },
  { value: "daily_loss_limit", label: "Daily Loss Limit", description: "Max daily loss $ or %", tip: "Maximum allowed daily loss (dollar or percentage)" },
  { value: "max_drawdown", label: "Max Drawdown", description: "Max drawdown % from peak", tip: "Maximum drawdown from equity peak" },
  { value: "consecutive_loss_stop", label: "Consecutive Loss Stop", description: "Halt after N consecutive losses", tip: "Halt after N consecutive losing trades" },
  { value: "max_open_positions", label: "Max Open Positions", description: "Max concurrent open positions", tip: "Maximum number of concurrent open positions" },
  { value: "order_rate_limit", label: "Order Rate Limit", description: "Max orders per minute", tip: "Maximum number of orders per minute" },
  { value: "sector_concentration", label: "Sector Concentration", description: "Max % in single sector", tip: "Maximum portfolio percentage in a single market sector" },
  { value: "single_stock_concentration", label: "Single Stock Concentration", description: "Max % in single stock", tip: "Maximum portfolio percentage in a single stock" },
];

const UNITS = [
  { value: "percent", label: "%" },
  { value: "dollars", label: "$" },
  { value: "count", label: "#" },
];

const ACTIONS = [
  { value: "reject_order", label: "Reject Order", color: "badge-warning" },
  { value: "halt", label: "Halt Trading", color: "badge-error" },
  { value: "alert", label: "Alert Only", color: "badge-info" },
];

const PRESETS = {
  conservative: {
    label: "Conservative",
    description: "Tight limits for risk-averse trading",
    values: {
      max_position_size: { value: 10, unit: "percent", action: "reject_order" },
      max_open_positions: { value: 5, unit: "count", action: "reject_order" },
      daily_loss_limit: { value: -1, unit: "percent", action: "halt" },
      max_drawdown: { value: -3, unit: "percent", action: "halt" },
      consecutive_loss_stop: { value: 2, unit: "count", action: "halt" },
      order_rate_limit: { value: 5, unit: "count", action: "reject_order" },
      single_stock_concentration: { value: 10, unit: "percent", action: "reject_order" },
      max_portfolio_heat: { value: 30, unit: "percent", action: "halt" },
      sector_concentration: { value: 20, unit: "percent", action: "alert" },
    },
  },
  moderate: {
    label: "Moderate",
    description: "Balanced limits (default)",
    values: {
      max_position_size: { value: 25, unit: "percent", action: "reject_order" },
      max_open_positions: { value: 10, unit: "count", action: "reject_order" },
      daily_loss_limit: { value: -2, unit: "percent", action: "halt" },
      max_drawdown: { value: -5, unit: "percent", action: "halt" },
      consecutive_loss_stop: { value: 3, unit: "count", action: "halt" },
      order_rate_limit: { value: 10, unit: "count", action: "reject_order" },
      single_stock_concentration: { value: 20, unit: "percent", action: "reject_order" },
      max_portfolio_heat: { value: 50, unit: "percent", action: "halt" },
      sector_concentration: { value: 30, unit: "percent", action: "alert" },
    },
  },
  aggressive: {
    label: "Aggressive",
    description: "Loose limits for experienced traders",
    values: {
      max_position_size: { value: 40, unit: "percent", action: "reject_order" },
      max_open_positions: { value: 20, unit: "count", action: "reject_order" },
      daily_loss_limit: { value: -5, unit: "percent", action: "halt" },
      max_drawdown: { value: -10, unit: "percent", action: "halt" },
      consecutive_loss_stop: { value: 5, unit: "count", action: "halt" },
      order_rate_limit: { value: 20, unit: "count", action: "reject_order" },
      single_stock_concentration: { value: 35, unit: "percent", action: "alert" },
      max_portfolio_heat: { value: 75, unit: "percent", action: "halt" },
      sector_concentration: { value: 50, unit: "percent", action: "alert" },
    },
  },
};

export default function CircuitBreakerPanel() {
  const { isAdmin } = useRole();
  const [breakers, setBreakers] = useState([]);
  const [halts, setHalts] = useState([]);
  const [isHalted, setIsHalted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);

  const [addForm, setAddForm] = useState({
    breakerType: "max_position_size",
    thresholdValue: 25,
    thresholdUnit: "percent",
    action: "halt",
    cooldownMinutes: 30,
  });

  const [editForm, setEditForm] = useState(null); // { breakerType, thresholdValue, ... }
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // haltId

  const fetchData = useCallback(async () => {
    try {
      const [breakersRes, haltsRes] = await Promise.all([
        fetch("/api/circuit-breakers"),
        fetch("/api/circuit-breakers/halts"),
      ]);

      if (breakersRes.ok) {
        const data = await breakersRes.json();
        setBreakers(data.breakers || []);
      }
      if (haltsRes.ok) {
        const data = await haltsRes.json();
        setHalts(data.halts || []);
        setIsHalted(data.isHalted || false);
      }
    } catch (e) {
      console.error("Circuit breaker fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 30s
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAddBreaker = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/circuit-breakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        await fetchData();
        setShowAddForm(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add breaker");
      }
    } catch (e) {
      console.error("Add breaker error:", e);
    }
    setSaving(false);
  };

  const handleToggleBreaker = async (breaker) => {
    setSaving(true);
    try {
      const res = await fetch("/api/circuit-breakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          breakerType: breaker.breaker_type,
          thresholdValue: breaker.threshold_value,
          thresholdUnit: breaker.threshold_unit,
          action: breaker.action,
          cooldownMinutes: breaker.cooldown_minutes,
          isActive: !breaker.is_active,
        }),
      });
      if (res.ok) await fetchData();
    } catch (e) {
      console.error("Toggle breaker error:", e);
    }
    setSaving(false);
  };

  const handleDeleteBreaker = async (breakerType) => {
    if (!confirm(`Delete ${breakerType} breaker?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/circuit-breakers?breakerType=${breakerType}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchData();
    } catch (e) {
      console.error("Delete breaker error:", e);
    }
    setSaving(false);
  };

  const handleDeactivateHalt = async (haltId) => {
    setSaving(true);
    try {
      const res = await fetch("/api/circuit-breakers/halts/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ haltId }),
      });
      if (res.ok) {
        await fetchData();
        setConfirmDeactivate(null);
      }
    } catch (e) {
      console.error("Deactivate halt error:", e);
    }
    setSaving(false);
  };

  const handleDeactivateAll = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/circuit-breakers/halts/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivateAll: true }),
      });
      if (res.ok) {
        await fetchData();
        setConfirmDeactivate(null);
      }
    } catch (e) {
      console.error("Deactivate all halts error:", e);
    }
    setSaving(false);
  };

  const handleApplyPreset = async (presetKey) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    if (!confirm(`Apply "${preset.label}" preset? This will overwrite all existing breaker configs.`)) return;

    setSaving(true);
    try {
      for (const [breakerType, config] of Object.entries(preset.values)) {
        await fetch("/api/circuit-breakers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            breakerType,
            thresholdValue: config.value,
            thresholdUnit: config.unit,
            action: config.action,
            cooldownMinutes: 30,
            isActive: true,
          }),
        });
      }
      await fetchData();
      setShowPresetModal(false);
    } catch (e) {
      console.error("Apply preset error:", e);
    }
    setSaving(false);
  };

  const handleEditBreaker = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      const res = await fetch("/api/circuit-breakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          breakerType: editForm.breaker_type,
          thresholdValue: parseFloat(editForm.threshold_value),
          thresholdUnit: editForm.threshold_unit,
          action: editForm.action,
          cooldownMinutes: parseInt(editForm.cooldown_minutes) || 30,
          isActive: true,
        }),
      });
      if (res.ok) {
        await fetchData();
        setEditForm(null);
      }
    } catch (e) {
      console.error("Edit breaker error:", e);
    }
    setSaving(false);
  };

  const getBreakerLabel = (type) => BREAKER_TYPES.find(b => b.value === type)?.label || type;
  const getBreakerDescription = (type) => BREAKER_TYPES.find(b => b.value === type)?.description || "";
  const getBreakerTip = (type) => BREAKER_TYPES.find(b => b.value === type)?.tip || "";
  const getUnitLabel = (unit) => UNITS.find(u => u.value === unit)?.label || unit;
  const getActionInfo = (action) => ACTIONS.find(a => a.value === action) || { label: action, color: "badge-ghost" };

  const levelBadge = (level) => {
    const map = { global_halt: "badge-error", user_halt: "badge-warning", symbol_halt: "badge-info" };
    return map[level] || "badge-ghost";
  };

  const levelLabel = (level) => {
    const map = { global_halt: "GLOBAL", user_halt: "USER", symbol_halt: "SYMBOL" };
    return map[level] || level;
  };

  if (loading) {
    return (
      <div className="card bg-base-100 shadow-xl border border-base-300">
        <div className="card-body">
          <h2 className="card-title">Circuit Breakers</h2>
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">
            Circuit Breakers
            {isHalted ? (
              <InfoTip tip="Circuit breaker has triggered — trading is suspended">
                <span className="badge badge-error badge-lg animate-pulse ml-2">HALTED</span>
              </InfoTip>
            ) : (
              <InfoTip tip="Circuit breaker system is active and monitoring">
                <span className="badge badge-success badge-lg ml-2">Active</span>
              </InfoTip>
            )}
          </h2>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm btn-circle min-h-[44px] sm:min-h-0 sm:btn-sm"
              onClick={fetchData}
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
            {isAdmin && (
              <>
                <button className="btn btn-outline btn-sm min-h-[44px] sm:min-h-0" onClick={() => setShowPresetModal(true)}>
                  Presets
                </button>
                <button className="btn btn-primary btn-sm min-h-[44px] sm:min-h-0" onClick={() => setShowAddForm(true)}>
                  + Add Breaker
                </button>
              </>
            )}
          </div>
        </div>

        {/* Real-time Status */}
        <div className={`alert ${isHalted ? "alert-error" : halts.length > 0 ? "alert-warning" : "alert-success"} shadow-sm mt-2`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{isHalted ? "🔴" : halts.length > 0 ? "🟡" : "🟢"}</span>
            <div>
              <span className="font-semibold">
                {isHalted ? "Trading Halted" : halts.length > 0 ? "Warnings Active" : "All Clear"}
              </span>
              <span className="text-xs ml-2 opacity-70">
                {breakers.filter(b => b.is_active).length} active breakers
              </span>
            </div>
          </div>
        </div>

        {/* Active Halts Section */}
        {halts.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-sm opacity-70 mb-2">Active Halts ({halts.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {halts.map((halt) => (
                <div key={halt.id} className="alert alert-error shadow-sm py-2">
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    <span className={`badge ${levelBadge(halt.level)}`}>{levelLabel(halt.level)}</span>
                    <span className="badge badge-ghost">{halt.reason?.replace(/_/g, " ")}</span>
                    {halt.scope && halt.level !== "global_halt" && (
                      <span className="font-mono text-sm">[{halt.scope.slice(0, 12)}{halt.scope.length > 12 ? "..." : ""}]</span>
                    )}
                    {halt.triggered_by && (
                      <span className="text-xs opacity-60">by {halt.triggered_by.replace(/_/g, " ")}</span>
                    )}
                    {halt.activated_at && (
                      <span className="text-xs opacity-40">{new Date(halt.activated_at).toLocaleString()}</span>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      className="btn btn-success btn-sm min-h-[44px] sm:min-h-0 sm:btn-xs"
                      onClick={() => setConfirmDeactivate(halt.id)}
                      disabled={saving}
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && halts.length > 0 && (
              <button
                className="btn btn-error btn-sm btn-outline mt-2 w-full min-h-[44px] sm:min-h-0"
                onClick={() => setConfirmDeactivate("ALL")}
                disabled={saving}
              >
                DEACTIVATE ALL HALTS
              </button>
            )}
          </div>
        )}

        {/* Confirm Deactivation Modal */}
        {confirmDeactivate && (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg text-error">
                {confirmDeactivate === "ALL" ? "Deactivate All Halts?" : "Deactivate Halt?"}
              </h3>
              <div className="alert alert-warning mt-4">
                <span>
                  {confirmDeactivate === "ALL"
                    ? "This will deactivate ALL active trading halts. Trading will resume immediately."
                    : "This will deactivate this specific halt. Ensure the underlying issue has been resolved."}
                </span>
              </div>
              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setConfirmDeactivate(null)}>Cancel</button>
                <button
                  className="btn btn-error"
                  disabled={saving}
                  onClick={() => confirmDeactivate === "ALL" ? handleDeactivateAll() : handleDeactivateHalt(confirmDeactivate)}
                >
                  {saving ? <span className="loading loading-spinner loading-xs"></span> : "DEACTIVATE"}
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setConfirmDeactivate(null)}>close</button></form>
          </dialog>
        )}

        {/* Breakers Table */}
        <div className="divider mt-2 mb-2"></div>
        <h3 className="font-semibold text-sm opacity-70">Circuit Breaker Configuration</h3>
        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Breaker</th>
                <th>Threshold</th>
                <th>Action</th>
                <th>Triggers</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {breakers.map((breaker) => {
                const actionInfo = getActionInfo(breaker.action);
                return (
                  <tr key={breaker.breaker_type} className={!breaker.is_active ? "opacity-50" : ""}>
                    <td>
                      <div className="font-medium text-sm">{getBreakerLabel(breaker.breaker_type)}<InfoTip tip={getBreakerTip(breaker.breaker_type)} /></div>
                      <div className="text-xs opacity-50">{getBreakerDescription(breaker.breaker_type)}</div>
                    </td>
                    <td className="font-mono text-sm">
                      {breaker.threshold_unit === "dollars" ? "$" : ""}
                      {breaker.threshold_value}
                      {breaker.threshold_unit === "percent" ? "%" : breaker.threshold_unit === "count" ? "" : ""}
                      <span className="text-xs opacity-50 ml-1">{breaker.threshold_unit}</span>
                    </td>
                    <td>
                      <span className={`badge ${actionInfo.color} badge-sm`}>{actionInfo.label}</span>
                    </td>
                    <td className="text-sm">
                      {breaker.trigger_count || 0}
                      {breaker.last_triggered_at && (
                        <div className="text-xs opacity-40">{new Date(breaker.last_triggered_at).toLocaleString()}</div>
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm toggle-success"
                        checked={breaker.is_active}
                        onChange={() => handleToggleBreaker(breaker)}
                        disabled={!isAdmin}
                      />
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setEditForm({
                              breaker_type: breaker.breaker_type,
                              threshold_value: breaker.threshold_value,
                              threshold_unit: breaker.threshold_unit,
                              action: breaker.action,
                              cooldown_minutes: breaker.cooldown_minutes,
                            })}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => handleDeleteBreaker(breaker.breaker_type)}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile Cards */}
        <div className="sm:hidden space-y-2">
          {breakers.map((breaker) => {
            const actionInfo = getActionInfo(breaker.action);
            return (
              <div key={breaker.breaker_type} className={`card bg-base-200 p-3 ${!breaker.is_active ? "opacity-50" : ""}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-sm">{getBreakerLabel(breaker.breaker_type)}<InfoTip tip={getBreakerTip(breaker.breaker_type)} /></div>
                    <div className="text-xs text-base-content/50">{getBreakerDescription(breaker.breaker_type)}</div>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-success"
                    checked={breaker.is_active}
                    onChange={() => handleToggleBreaker(breaker)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <span className="text-base-content/50">Threshold:</span>{" "}
                    <span className="font-mono">
                      {breaker.threshold_unit === "dollars" ? "$" : ""}
                      {breaker.threshold_value}
                      {breaker.threshold_unit === "percent" ? "%" : breaker.threshold_unit === "count" ? "" : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-base-content/50">Action:</span>{" "}
                    <span className={`badge ${actionInfo.color} badge-xs`}>{actionInfo.label}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">Triggers:</span> {breaker.trigger_count || 0}
                    {breaker.last_triggered_at && (
                      <div className="text-xs text-base-content/40">{new Date(breaker.last_triggered_at).toLocaleString()}</div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-base-content/10">
                    <button
                      className="btn btn-ghost btn-sm flex-1 min-h-[44px] sm:min-h-0"
                      onClick={() => setEditForm({
                        breaker_type: breaker.breaker_type,
                        threshold_value: breaker.threshold_value,
                        threshold_unit: breaker.threshold_unit,
                        action: breaker.action,
                        cooldown_minutes: breaker.cooldown_minutes,
                      })}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm flex-1 min-h-[44px] sm:min-h-0 text-error"
                      onClick={() => handleDeleteBreaker(breaker.breaker_type)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Breaker Modal */}
        {showAddForm && (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">Add Circuit Breaker</h3>

              <div className="form-control w-full mt-4">
                <label className="label"><span className="label-text">Breaker Type</span></label>
                <select
                  className="select select-bordered w-full"
                  value={addForm.breakerType}
                  onChange={(e) => setAddForm({ ...addForm, breakerType: e.target.value })}
                >
                  {BREAKER_TYPES.map(bt => (
                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                  ))}
                </select>
                <label className="label"><span className="label-text-alt opacity-50">
                  {BREAKER_TYPES.find(b => b.value === addForm.breakerType)?.description}
                </span></label>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="form-control">
                  <label className="label"><span className="label-text">Threshold</span></label>
                  <input
                    type="number"
                    className="input input-bordered"
                    value={addForm.thresholdValue}
                    onChange={(e) => setAddForm({ ...addForm, thresholdValue: parseFloat(e.target.value) || 0 })}
                    step="0.1"
                  />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Unit</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={addForm.thresholdUnit}
                    onChange={(e) => setAddForm({ ...addForm, thresholdUnit: e.target.value })}
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label} ({u.value})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="form-control">
                  <label className="label"><span className="label-text">Action</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={addForm.action}
                    onChange={(e) => setAddForm({ ...addForm, action: e.target.value })}
                  >
                    {ACTIONS.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Cooldown (min)</span></label>
                  <input
                    type="number"
                    className="input input-bordered"
                    value={addForm.cooldownMinutes}
                    onChange={(e) => setAddForm({ ...addForm, cooldownMinutes: parseInt(e.target.value) || 30 })}
                    min="1"
                  />
                </div>
              </div>

              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddBreaker} disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs"></span> : "Add Breaker"}
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setShowAddForm(false)}>close</button></form>
          </dialog>
        )}

        {/* Edit Breaker Modal */}
        {editForm && (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">Edit: {getBreakerLabel(editForm.breaker_type)}</h3>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Threshold</span></label>
                  <input
                    type="number"
                    className="input input-bordered"
                    value={editForm.threshold_value}
                    onChange={(e) => setEditForm({ ...editForm, threshold_value: e.target.value })}
                    step="0.1"
                  />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Unit</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={editForm.threshold_unit}
                    onChange={(e) => setEditForm({ ...editForm, threshold_unit: e.target.value })}
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label} ({u.value})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="form-control">
                  <label className="label"><span className="label-text">Action</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={editForm.action}
                    onChange={(e) => setEditForm({ ...editForm, action: e.target.value })}
                  >
                    {ACTIONS.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Cooldown (min)</span></label>
                  <input
                    type="number"
                    className="input input-bordered"
                    value={editForm.cooldown_minutes}
                    onChange={(e) => setEditForm({ ...editForm, cooldown_minutes: e.target.value })}
                    min="1"
                  />
                </div>
              </div>

              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setEditForm(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEditBreaker} disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs"></span> : "Save Changes"}
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setEditForm(null)}>close</button></form>
          </dialog>
        )}

        {/* Preset Modal */}
        {showPresetModal && (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">Quick Presets</h3>
              <p className="text-sm opacity-70 mt-1">Apply a preset configuration to quickly set up circuit breakers.</p>

              <div className="space-y-3 mt-4">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <div key={key} className="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors" onClick={() => handleApplyPreset(key)}>
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{preset.label}</h4>
                          <p className="text-xs opacity-70">{preset.description}</p>
                        </div>
                        <div className="text-right text-xs opacity-50">
                          {Object.entries(preset.values).map(([type, config]) => (
                            <div key={type}>
                              {getBreakerLabel(type).replace("Max ", "").replace("Consecutive Loss Stop", "Loss Stop")}: {config.value}{config.unit === "percent" ? "%" : config.unit === "dollars" ? "$" : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setShowPresetModal(false)}>Cancel</button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setShowPresetModal(false)}>close</button></form>
          </dialog>
        )}
      </div>
    </div>
  );
}
