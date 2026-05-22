"use client";

/**
 * CampaignRunner — Live campaign progress dashboard.
 *
 * Shows: trade progress, win/loss, consecutive losses, P&L,
 * stop conditions, and controls (pause/resume/stop).
 * Polls campaign status every 5s while running.
 */

import { useState, useEffect, useCallback } from "react";

const STATUS_STYLES = {
  draft: { badge: "badge-ghost", label: "Draft" },
  running: { badge: "badge-primary", label: "Running" },
  paused: { badge: "badge-warning", label: "Paused" },
  completed: { badge: "badge-success", label: "Completed" },
  stopped_loss_streak: { badge: "badge-error", label: "Stopped — Loss Streak" },
  stopped_max_drawdown: { badge: "badge-error", label: "Stopped — Max Drawdown" },
  stopped_manual: { badge: "badge-warning", label: "Stopped — Manual" },
  error: { badge: "badge-error", label: "Error" },
};

const TRADE_STATUS_STYLES = {
  pending: { badge: "badge-ghost", label: "Pending" },
  submitted: { badge: "badge-info", label: "Submitted" },
  filled: { badge: "badge-primary", label: "In Position" },
  partially_filled: { badge: "badge-info", label: "Partial Fill" },
  stopped_out: { badge: "badge-error", label: "Stop Loss" },
  taken_profit: { badge: "badge-success", label: "Take Profit" },
  cancelled: { badge: "badge-ghost", label: "Cancelled" },
  rejected: { badge: "badge-error", label: "Rejected" },
  error: { badge: "badge-error", label: "Error" },
};

export default function CampaignRunner({ campaignId, onClose }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaign/${campaignId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampaign(data.campaign);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchCampaign();
    const interval = setInterval(() => {
      // Only poll while running
      if (campaign?.status === "running") {
        fetchCampaign();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchCampaign, campaign?.status]);

  async function handleAction(action) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampaign(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center p-8 text-base-content/40">
        Campaign not found
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[campaign.status] || STATUS_STYLES.error;
  const isActive = campaign.status === "running";
  const isPaused = campaign.status === "paused";
  const isTerminal = ["completed", "stopped_loss_streak", "stopped_max_drawdown", "stopped_manual", "error"].includes(campaign.status);
  const progress = campaign.max_trades > 0
    ? Math.round((campaign.trades_filled / campaign.max_trades) * 100)
    : 0;
  const winRate = campaign.trades_filled > 0
    ? ((campaign.wins / campaign.trades_filled) * 100).toFixed(1)
    : "—";
  const pnlColor = (campaign.realized_pnl || 0) >= 0 ? "text-success" : "text-error";
  const lossStreakPct = campaign.max_consecutive_losses > 0
    ? Math.min((campaign.consecutive_losses / campaign.max_consecutive_losses) * 100, 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">Campaign</h3>
              <span className={`badge badge-sm ${statusStyle.badge}`}>{statusStyle.label}</span>
            </div>
            <p className="text-xs text-base-content/50">
              {campaign.id?.slice(0, 8)} • {campaign.signal_source} • {campaign.kelly_fraction * 100}% Kelly
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isActive && (
            <>
              <button
                className="btn btn-warning min-h-[44px] sm:min-h-0 sm:btn-sm"
                onClick={() => handleAction("pause")}
                disabled={actionLoading !== null}
              >
                {actionLoading === "pause" ? <span className="loading loading-spinner loading-xs"></span> : "Pause"}
              </button>
              <button
                className="btn btn-error min-h-[44px] sm:min-h-0 sm:btn-sm"
                onClick={() => handleAction("stop")}
                disabled={actionLoading !== null}
              >
                {actionLoading === "stop" ? <span className="loading loading-spinner loading-xs"></span> : "Stop"}
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm"
                onClick={() => handleAction("resume")}
                disabled={actionLoading !== null}
              >
                {actionLoading === "resume" ? <span className="loading loading-spinner loading-xs"></span> : "Resume"}
              </button>
              <button
                className="btn btn-error min-h-[44px] sm:min-h-0 sm:btn-sm"
                onClick={() => handleAction("stop")}
                disabled={actionLoading !== null}
              >
                Stop
              </button>
            </>
          )}
          {isTerminal && onClose && (
            <button className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Stop Reason */}
      {campaign.stopped_reason && (
        <div className={`alert ${campaign.status.includes("stopped_loss") ? "alert-error" : campaign.status.includes("stopped_max") ? "alert-warning" : "alert-info"} text-sm`}>
          <span>{campaign.stopped_reason}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-base-content/60 uppercase tracking-wider">Progress</span>
            <span className="font-mono text-sm">
              {campaign.trades_filled}/{campaign.max_trades} trades
            </span>
          </div>
          <progress
            className={`progress w-full ${progress >= 100 ? "progress-success" : "progress-primary"}`}
            value={campaign.trades_filled}
            max={campaign.max_trades}
          />
          <div className="flex justify-between text-[10px] text-base-content/40 mt-1">
            <span>Trade {campaign.trades_placed} placed</span>
            <span>{progress}% complete</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Win Rate" value={winRate} suffix="%" color={parseFloat(winRate) >= 50 ? "text-success" : "text-error"} />
        <StatCard label="W / L" value={`${campaign.wins} / ${campaign.losses}`} color="text-base-content" />
        <StatCard label="Realized P&L" value={`$${Math.abs(campaign.realized_pnl || 0).toFixed(2)}`} prefix={campaign.realized_pnl >= 0 ? "+" : "-"} color={pnlColor} />
        <StatCard label="Max Drawdown" value={`$${(campaign.max_drawdown || 0).toFixed(2)}`} color="text-warning" />
      </div>

      {/* Loss Streak Indicator */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-base-content/60 uppercase tracking-wider">Consecutive Losses</span>
            <span className={`font-mono font-bold ${lossStreakPct >= 66 ? "text-error" : lossStreakPct >= 33 ? "text-warning" : "text-success"}`}>
              {campaign.consecutive_losses} / {campaign.max_consecutive_losses}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: campaign.max_consecutive_losses }, (_, i) => (
              <div
                key={i}
                className={`h-3 flex-1 rounded-full ${
                  i < campaign.consecutive_losses
                    ? lossStreakPct >= 66
                      ? "bg-error"
                      : "bg-warning"
                    : "bg-base-300"
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] text-base-content/40 mt-1">
            Auto-stop after {campaign.max_consecutive_losses} consecutive losses
          </div>
        </div>
      </div>

      {/* Trades Table */}
      {campaign.trades?.length > 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-base-content/60 uppercase tracking-wider">Trades</span>
              <span className="badge badge-xs badge-ghost">{campaign.trades.length}</span>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">#</th>
                    <th className="text-xs">Symbol</th>
                    <th className="text-xs">Side</th>
                    <th className="text-xs">Qty</th>
                    <th className="text-xs">Status</th>
                    <th className="text-xs">Fill</th>
                    <th className="text-xs">Exit</th>
                    <th className="text-xs">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.trades.map((trade) => {
                    const tStyle = TRADE_STATUS_STYLES[trade.status] || TRADE_STATUS_STYLES.error;
                    const pnl = trade.realized_pnl || 0;
                    return (
                      <tr key={trade.id} className={trade.status === "pending" ? "opacity-40" : ""}>
                        <td className="font-mono text-xs">{trade.trade_index}</td>
                        <td className="font-mono text-xs font-medium">{trade.symbol}</td>
                        <td>
                          <span className={`badge badge-xs ${trade.side === "buy" ? "badge-success" : "badge-error"}`}>
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{trade.qty}</td>
                        <td>
                          <span className={`badge badge-xs ${tStyle.badge}`}>{tStyle.label}</span>
                        </td>
                        <td className="font-mono text-xs">{trade.fill_price ? `$${trade.fill_price.toFixed(2)}` : "—"}</td>
                        <td className="font-mono text-xs">{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : "—"}</td>
                        <td className={`font-mono text-xs font-medium ${pnl > 0 ? "text-success" : pnl < 0 ? "text-error" : ""}`}>
                          {pnl !== 0 ? `$${pnl.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-2 max-h-64 overflow-y-auto">
              {campaign.trades.map((trade) => {
                const tStyle = TRADE_STATUS_STYLES[trade.status] || TRADE_STATUS_STYLES.error;
                const pnl = trade.realized_pnl || 0;
                return (
                  <div
                    key={trade.id}
                    className={`bg-base-300/50 rounded-lg p-3 ${trade.status === "pending" ? "opacity-40" : ""}`}
                  >
                    {/* Top row: Symbol + Side + P&L */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base-content/30 text-xs">#{trade.trade_index}</span>
                        <span className="font-mono font-bold text-sm">{trade.symbol}</span>
                        <span className={`badge badge-xs ${trade.side === "buy" ? "badge-success" : "badge-error"}`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </div>
                      <span className={`font-mono text-sm font-bold ${pnl > 0 ? "text-success" : pnl < 0 ? "text-error" : ""}`}>
                        {pnl !== 0 ? `${pnl > 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                      </span>
                    </div>
                    {/* Detail grid */}
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <div className="text-base-content/50">Qty</div>
                        <div className="font-mono">{trade.qty}</div>
                      </div>
                      <div>
                        <div className="text-base-content/50">Fill</div>
                        <div className="font-mono">{trade.fill_price ? `$${trade.fill_price.toFixed(2)}` : "—"}</div>
                      </div>
                      <div>
                        <div className="text-base-content/50">Exit</div>
                        <div className="font-mono">{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : "—"}</div>
                      </div>
                    </div>
                    {/* Status badge */}
                    <div className="mt-1.5">
                      <span className={`badge badge-xs ${tStyle.badge}`}>{tStyle.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, prefix = "", suffix = "", color = "" }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-3">
        <div className="text-[10px] text-base-content/40 uppercase tracking-wider">{label}</div>
        <div className={`font-mono font-bold text-lg ${color}`}>
          {prefix}{value}{suffix}
        </div>
      </div>
    </div>
  );
}
