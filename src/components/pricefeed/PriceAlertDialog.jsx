"use client";

/**
 * PriceAlertDialog — Modal for creating a new price alert.
 *
 * Collects: symbol, target price, direction, severity, cooldown, label.
 * Pre-fills symbol when opened from a watchlist item.
 */

import { useState, useEffect } from "react";

const DIRECTIONS = [
  { value: "above", label: "Above", icon: "▲" },
  { value: "below", label: "Below", icon: "▼" },
  { value: "crosses", label: "Crosses", icon: "⇅" },
];

const SEVERITIES = [
  { value: "info", label: "Info", color: "badge-info" },
  { value: "warning", label: "Warning", color: "badge-warning" },
  { value: "error", label: "Critical", color: "badge-error" },
];

export default function PriceAlertDialog({ symbol: initialSymbol, currentPrice, onClose, onCreate }) {
  const [symbol, setSymbol] = useState(initialSymbol || "");
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState("above");
  const [severity, setSeverity] = useState("info");
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fill with current price offset
  useEffect(() => {
    if (initialSymbol && currentPrice && !targetPrice) {
      // Default: 2% above current price
      const defaultTarget = (currentPrice * 1.02).toFixed(2);
      setTargetPrice(defaultTarget);
    }
  }, [initialSymbol, currentPrice]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      setError("Target price must be a positive number");
      return;
    }
    if (!symbol.trim()) {
      setError("Symbol is required");
      return;
    }

    setLoading(true);
    try {
      await onCreate({
        symbol: symbol.toUpperCase().trim(),
        target_price: price,
        direction,
        severity,
        cooldown_minutes: cooldownMinutes,
        label: label.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Quick-set buttons for target price
  function applyOffset(pct) {
    if (!currentPrice) return;
    const newPrice = direction === "below"
      ? currentPrice * (1 - pct / 100)
      : currentPrice * (1 + pct / 100);
    setTargetPrice(newPrice.toFixed(2));
  }

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
              <path d="M10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg">Set Price Alert</h3>
            {currentPrice && (
              <p className="text-xs text-base-content/50">
                Current: ${currentPrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol */}
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-medium">Symbol</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm font-mono uppercase"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder="AAPL"
              disabled={!!initialSymbol}
            />
          </div>

          {/* Target Price */}
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-medium">Target Price</span>
            </label>
            <div className="join">
              <span className="btn btn-sm btn-ghost join-item no-animation">$</span>
              <input
                type="number"
                className="input input-bordered input-sm join-item flex-1 font-mono"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
              />
            </div>
            {/* Quick offset buttons */}
            {currentPrice && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[1, 2, 5, 10].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    className="btn btn-xs btn-ghost font-mono min-h-[32px]"
                    onClick={() => applyOffset(pct)}
                  >
                    {direction === "below" ? "-" : "+"}{pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direction */}
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-medium">Direction</span>
            </label>
            <div className="flex gap-2">
              {DIRECTIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm flex-1 text-xs ${direction === d.value ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setDirection(d.value)}
                >
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-medium">Severity</span>
            </label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm flex-1 text-xs ${severity === s.value ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSeverity(s.value)}
                >
                  <span className={`badge badge-xs ${s.color}`}></span> {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cooldown + Label row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Cooldown (min)</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm font-mono"
                value={cooldownMinutes}
                onChange={e => setCooldownMinutes(parseInt(e.target.value) || 15)}
                min="1"
                max="1440"
              />
              <label className="label">
                <span className="label-text-alt text-[10px] text-base-content/40">Re-arm delay after trigger</span>
              </label>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Label (optional)</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g., Breakout level"
                maxLength={100}
              />
            </div>
          </div>

          {/* Preview */}
          {targetPrice && symbol && (
            <div className="p-3 bg-base-200 rounded-lg text-xs">
              <span className="text-base-content/50">Will alert when </span>
              <span className="font-bold font-mono">{symbol.toUpperCase()}</span>
              <span className="text-base-content/50"> {direction === "above" ? "rises above" : direction === "below" ? "falls below" : "crosses"}</span>
              <span className="font-bold font-mono text-primary"> ${parseFloat(targetPrice).toFixed(2)}</span>
              {currentPrice && (
                <>
                  <span className="text-base-content/40"> ({direction === "below" ? "-" : "+"}{Math.abs(((parseFloat(targetPrice) - currentPrice) / currentPrice) * 100).toFixed(1)}% from current)</span>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-error bg-error/10 rounded-lg p-3">{error}</div>
          )}

          {/* Actions */}
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm"
              disabled={loading || !symbol || !targetPrice}
            >
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "Create Alert"}
            </button>
          </div>
        </form>
      </div>

      {/* Backdrop */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose} disabled={loading}>close</button>
      </form>
    </dialog>
  );
}
