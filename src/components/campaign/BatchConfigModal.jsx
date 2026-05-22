"use client";

/**
 * BatchConfigModal — Configure a batch trade campaign.
 *
 * Presented after the user clicks "Execute as Batch" from the signals/analysis view.
 * Collects: max trades, max consecutive losses, max drawdown %, position sizing mode.
 * Then creates the campaign via POST /api/campaign and starts it.
 */

import { useState } from "react";

const DEFAULT_CONFIG = {
  maxTrades: 10,
  maxConsecutiveLosses: 3,
  maxDrawdownPct: 5,
  kellyFraction: 50,        // displayed as %, sent as decimal
  positionSizingMode: "kelly",
  fixedQty: 1,
};

export default function BatchConfigModal({ signals = [], analysisId, onClose, onCreated }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Build trades list from signals
  const trades = signals
    .filter(s => s.direction === "LONG" || s.direction === "BUY" || s.direction === "SHORT" || s.direction === "SELL")
    .slice(0, config.maxTrades)
    .map((signal, i) => ({
      symbol: signal.symbol || "UNKNOWN",
      side: (signal.direction === "LONG" || signal.direction === "BUY") ? "buy" : "sell",
      qty: config.positionSizingMode === "fixed" ? config.fixedQty : 1, // Kelly sizing done server-side
      orderType: "bracket",
      stopLoss: signal.sl_price || null,
      takeProfit: signal.tp_price || null,
      signalDirection: signal.direction,
      confidence: signal.confidence || null,
      regime: signal.regime || null,
      kellyFraction: config.kellyFraction / 100,
    }));

  const winEstimate = Math.round(config.maxTrades * 0.6);
  const lossEstimate = config.maxTrades - winEstimate;

  async function handleCreate() {
    if (trades.length === 0) {
      setError("No valid signals to create trades from. Run the analysis pipeline first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create the campaign
      const createRes = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxTrades: config.maxTrades,
          maxConsecutiveLosses: config.maxConsecutiveLosses,
          maxDrawdownPct: config.maxDrawdownPct / 100,
          kellyFraction: config.kellyFraction / 100,
          positionSizingMode: config.positionSizingMode,
          fixedQty: config.positionSizingMode === "fixed" ? config.fixedQty : null,
          analysisId,
          signalSource: "renko",
          trades,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create campaign");
      }

      const campaignId = createData.campaign.id;

      // Step 2: Start the campaign
      const startRes = await fetch(`/api/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData.error || "Failed to start campaign");
      }

      onCreated?.(startData.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg">Execute as Batch</h3>
            <p className="text-xs text-base-content/50">Sequential trade execution with risk guards</p>
          </div>
        </div>

        {/* Campaign Parameters */}
        <div className="space-y-4">
          {/* Row 1: Trade Count + Consecutive Loss Limit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Max Trades</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm"
                min="1"
                max="50"
                value={config.maxTrades}
                onChange={e => updateConfig("maxTrades", parseInt(e.target.value) || 10)}
              />
              <label className="label">
                <span className="label-text-alt text-[10px] text-base-content/40">Total trades in batch</span>
              </label>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Max Consecutive Losses</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm"
                min="1"
                max="10"
                value={config.maxConsecutiveLosses}
                onChange={e => updateConfig("maxConsecutiveLosses", parseInt(e.target.value) || 3)}
              />
              <label className="label">
                <span className="label-text-alt text-[10px] text-base-content/40">Auto-stop after N losses in a row</span>
              </label>
            </div>
          </div>

          {/* Row 2: Max Drawdown + Kelly Fraction */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Max Drawdown</span>
              </label>
              <div className="join">
                <input
                  type="number"
                  className="input input-bordered input-sm join-item flex-1"
                  min="1"
                  max="50"
                  value={config.maxDrawdownPct}
                  onChange={e => updateConfig("maxDrawdownPct", parseInt(e.target.value) || 5)}
                />
                <span className="btn btn-sm btn-ghost join-item no-animation">%</span>
              </div>
              <label className="label">
                <span className="label-text-alt text-[10px] text-base-content/40">Stop if drawdown exceeds</span>
              </label>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-medium">Kelly Fraction</span>
              </label>
              <div className="join">
                <input
                  type="number"
                  className="input input-bordered input-sm join-item flex-1"
                  min="10"
                  max="100"
                  step="5"
                  value={config.kellyFraction}
                  onChange={e => updateConfig("kellyFraction", parseInt(e.target.value) || 50)}
                />
                <span className="btn btn-sm btn-ghost join-item no-animation">%</span>
              </div>
              <label className="label">
                <span className="label-text-alt text-[10px] text-base-content/40">Half-Kelly (50%) recommended</span>
              </label>
            </div>
          </div>

          {/* Position Sizing Mode */}
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-medium">Position Sizing</span>
            </label>
            <div className="flex gap-2">
              {["kelly", "fixed", "risk_parity"].map(mode => (
                <button
                  key={mode}
                  className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm ${config.positionSizingMode === mode ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => updateConfig("positionSizingMode", mode)}
                >
                  {mode === "kelly" ? "Kelly Criterion" : mode === "fixed" ? "Fixed Qty" : "Risk Parity"}
                </button>
              ))}
            </div>
            {config.positionSizingMode === "fixed" && (
              <input
                type="number"
                className="input input-bordered input-sm mt-2 w-32"
                min="1"
                max="10000"
                value={config.fixedQty}
                onChange={e => updateConfig("fixedQty", parseInt(e.target.value) || 1)}
                placeholder="Shares"
              />
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="mt-5 p-4 bg-base-200 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-base-content/60 uppercase tracking-wider">Campaign Preview</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="font-mono font-bold text-lg text-primary">{trades.length}</div>
              <div className="text-[10px] text-base-content/40 uppercase">Trades</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-lg text-success">{winEstimate}</div>
              <div className="text-[10px] text-base-content/40 uppercase">Est. Wins</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-lg text-error">{lossEstimate}</div>
              <div className="text-[10px] text-base-content/40 uppercase">Est. Losses</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-lg">{config.maxConsecutiveLosses}</div>
              <div className="text-[10px] text-base-content/40 uppercase">Loss Limit</div>
            </div>
          </div>

          {/* Trade List Preview */}
          {trades.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <div className="space-y-1">
                {trades.slice(0, 8).map((trade, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-base-300/40 rounded px-2 py-1">
                    <span className="font-mono text-base-content/30 w-5">{i + 1}.</span>
                    <span className={`badge badge-xs ${trade.side === "buy" ? "badge-success" : "badge-error"}`}>
                      {trade.side.toUpperCase()}
                    </span>
                    <span className="font-mono font-medium">{trade.symbol}</span>
                    {trade.confidence != null && (
                      <span className="ml-auto text-base-content/40">{(trade.confidence * 100).toFixed(0)}%</span>
                    )}
                  </div>
                ))}
                {trades.length > 8 && (
                  <div className="text-xs text-base-content/30 text-center">
                    +{trades.length - 8} more trades
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="mt-3 flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-lg p-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>
            Trades execute sequentially with bracket orders (SL/TP). The campaign auto-stops on {config.maxConsecutiveLosses} consecutive losses or {config.maxDrawdownPct}% drawdown. This is paper trading — no real money at risk.
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 text-sm text-error bg-error/10 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="modal-action">
          <button
            className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm"
            onClick={handleCreate}
            disabled={loading || trades.length === 0}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "Start Campaign"
            )}
          </button>
        </div>
      </div>

      {/* Backdrop click to close */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose} disabled={loading}>close</button>
      </form>
    </dialog>
  );
}
