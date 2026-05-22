"use client";

import { useState, useEffect } from "react";
import { notifySuccess, notifyError } from "@/lib/notifications";

/**
 * ConfigPanel — Pipeline configuration form with all parameters.
 * Tab 4 of the Renko HFT Pipeline.
 */

function ConfigField({
  label,
  name,
  value,
  type = "number",
  step,
  min,
  max,
  options,
  onChange,
  description,
}) {
  if (type === "select" && options) {
    return (
      <div className="form-control">
        <label className="label py-1">
          <span className="label-text text-xs">{label}</span>
          {description && (
            <span className="label-text-alt text-[10px] text-base-content/40">
              {description}
            </span>
          )}
        </label>
        <select
          className="select select-sm select-bordered w-full font-mono"
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "toggle") {
    return (
      <div className="form-control">
        <label className="label cursor-pointer py-1">
          <div>
            <span className="label-text text-xs">{label}</span>
            {description && (
              <div className="text-[10px] text-base-content/40">
                {description}
              </div>
            )}
          </div>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={!!value}
            onChange={(e) => onChange(name, e.target.checked)}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="form-control">
      <label className="label py-1">
        <span className="label-text text-xs">{label}</span>
        {description && (
          <span className="label-text-alt text-[10px] text-base-content/40">
            {description}
          </span>
        )}
      </label>
      <input
        type={type}
        className="input input-sm input-bordered w-full font-mono"
        value={value ?? ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) =>
          onChange(
            name,
            type === "number" ? parseFloat(e.target.value) || 0 : e.target.value
          )
        }
      />
    </div>
  );
}

function ConfigSection({ title, icon, children }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <span className="text-xs">{icon}</span>
          </div>
          <h4 className="font-semibold text-sm">{title}</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ConfigPanel({ config = {}, onSave, onReset, saving }) {
  const [form, setForm] = useState({});

  // Initialize form from config
  useEffect(() => {
    if (config && Object.keys(config).length > 0) {
      setForm({ ...config });
    }
  }, [config]);

  const handleChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      await onSave(form);
    } catch (e) {
      notifyError(`Failed to save config: ${e.message}`);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "Reset the entire Renko pipeline? This will clear all bricks, trades, and state."
      )
    ) {
      return;
    }
    try {
      await onReset();
    } catch (e) {
      notifyError(`Failed to reset pipeline: ${e.message}`);
    }
  };

  const hasChanges = JSON.stringify(form) !== JSON.stringify(config);

  return (
    <div className="space-y-4">
      {/* Warning */}
      <div className="alert alert-warning">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span className="text-sm">
          Changing configuration will reset the pipeline. All bricks, trades, and
          state will be cleared.
        </span>
      </div>

      {/* Brick Engine */}
      <ConfigSection title="Brick Engine" icon="🧱">
        <ConfigField
          label="Brick Size"
          name="brick_size"
          value={form.brick_size}
          type="number"
          step={0.01}
          min={0.01}
          description="Price movement per brick"
          onChange={handleChange}
        />
        <ConfigField
          label="Brick Size Mode"
          name="brick_size_mode"
          value={form.brick_size_mode}
          type="select"
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "atr", label: "ATR-based" },
            { value: "adaptive", label: "Adaptive" },
          ]}
          description="How brick size is determined"
          onChange={handleChange}
        />
        <ConfigField
          label="Reversal Bricks"
          name="reversal_bricks"
          value={form.reversal_bricks}
          type="number"
          step={1}
          min={1}
          max={10}
          description="Bricks needed for reversal (typically 2 or 3)"
          onChange={handleChange}
        />
      </ConfigSection>

      {/* Pattern Detection */}
      <ConfigSection title="Pattern Detection" icon="🔍">
        <ConfigField
          label="Bull Trigger N"
          name="bull_trigger_n"
          value={form.bull_trigger_n}
          type="number"
          step={1}
          min={1}
          max={20}
          description="Consecutive UP bricks for bull signal"
          onChange={handleChange}
        />
        <ConfigField
          label="Bear Trigger N"
          name="bear_trigger_n"
          value={form.bear_trigger_n}
          type="number"
          step={1}
          min={1}
          max={20}
          description="Consecutive DOWN bricks for bear signal"
          onChange={handleChange}
        />
      </ConfigSection>

      {/* Risk Management */}
      <ConfigSection title="Risk Management" icon="🛡️">
        <ConfigField
          label="Stop Loss (bricks)"
          name="sl_bricks"
          value={form.sl_bricks}
          type="number"
          step={0.5}
          min={0.5}
          max={20}
          description="Stop loss distance in bricks"
          onChange={handleChange}
        />
        <ConfigField
          label="Take Profit (bricks)"
          name="tp_bricks"
          value={form.tp_bricks}
          type="number"
          step={0.5}
          min={0.5}
          max={50}
          description="Take profit distance in bricks"
          onChange={handleChange}
        />
        <ConfigField
          label="Trailing Stop"
          name="trailing_stop"
          value={form.trailing_stop}
          type="toggle"
          description="Enable trailing stop"
          onChange={handleChange}
        />
        <ConfigField
          label="Trail After Bricks"
          name="trail_after_bricks"
          value={form.trail_after_bricks}
          type="number"
          step={1}
          min={1}
          max={20}
          description="Start trailing after N bricks in profit"
          onChange={handleChange}
        />
        <ConfigField
          label="Trail Distance (bricks)"
          name="trail_distance_bricks"
          value={form.trail_distance_bricks}
          type="number"
          step={0.5}
          min={0.5}
          max={10}
          description="Trailing stop distance in bricks"
          onChange={handleChange}
        />
      </ConfigSection>

      {/* Signal Filter */}
      <ConfigSection title="Signal Filter" icon="🚦">
        <ConfigField
          label="Max Trades/Session"
          name="max_trades_per_session"
          value={form.max_trades_per_session}
          type="number"
          step={1}
          min={1}
          max={100}
          description="Maximum trades per session"
          onChange={handleChange}
        />
        <ConfigField
          label="Max Daily Loss (bricks)"
          name="max_daily_loss_bricks"
          value={form.max_daily_loss_bricks}
          type="number"
          step={1}
          min={1}
          max={100}
          description="Stop trading after this loss"
          onChange={handleChange}
        />
        <ConfigField
          label="Max Consecutive Losses"
          name="max_consecutive_losses"
          value={form.max_consecutive_losses}
          type="number"
          step={1}
          min={1}
          max={20}
          description="Stop after N consecutive losses"
          onChange={handleChange}
        />
        <ConfigField
          label="Cooldown (seconds)"
          name="cooldown_seconds"
          value={form.cooldown_seconds}
          type="number"
          step={5}
          min={0}
          max={3600}
          description="Min seconds between trades"
          onChange={handleChange}
        />
        <ConfigField
          label="Regime Gate"
          name="regime_gate"
          value={form.regime_gate}
          type="toggle"
          description="Only trade in favorable regimes"
          onChange={handleChange}
        />
        <ConfigField
          label="Symbol"
          name="symbol"
          value={form.symbol}
          type="select"
          options={[
            { value: "SPY", label: "SPY" },
            { value: "AAPL", label: "AAPL" },
            { value: "TSLA", label: "TSLA" },
            { value: "NVDA", label: "NVDA" },
            { value: "QQQ", label: "QQQ" },
            { value: "META", label: "META" },
            { value: "AMZN", label: "AMZN" },
            { value: "MSFT", label: "MSFT" },
          ]}
          description="Target symbol"
          onChange={handleChange}
        />
      </ConfigSection>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-error btn-outline"
          onClick={handleReset}
          disabled={saving}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Reset Pipeline
        </button>

        <button
          className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary ${saving ? "loading" : ""}`}
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
}
