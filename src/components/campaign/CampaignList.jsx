"use client";

/**
 * CampaignList — List of past and present campaigns.
 *
 * Shows summary cards for each campaign with quick actions.
 * Used on the campaigns tab of the Renko page or settings.
 */

import { useState, useEffect, useCallback } from "react";

const STATUS_BADGES = {
  draft: "badge-ghost",
  running: "badge-primary",
  paused: "badge-warning",
  completed: "badge-success",
  stopped_loss_streak: "badge-error",
  stopped_max_drawdown: "badge-error",
  stopped_manual: "badge-warning",
  error: "badge-error",
};

const STATUS_LABELS = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  stopped_loss_streak: "Loss Streak",
  stopped_max_drawdown: "Max DD",
  stopped_manual: "Manual Stop",
  error: "Error",
};

export default function CampaignList({ onSelect }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchCampaigns = useCallback(async () => {
    try {
      const status = filter !== "all" ? filter : undefined;
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("limit", "20");

      const res = await fetch(`/api/campaign?${params}`);
      const data = await res.json();
      if (res.ok) {
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error("[CampaignList] Fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchCampaigns();
    // Refresh every 15s for running campaigns
    const interval = setInterval(fetchCampaigns, 15000);
    return () => clearInterval(interval);
  }, [fetchCampaigns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "running", "paused", "completed", "stopped_loss_streak", "stopped_max_drawdown"].map(f => (
          <button
            key={f}
            className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs ${filter === f ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f] || f}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {campaigns.length === 0 && (
        <div className="text-center py-12">
          <div className="text-base-content/20 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-base-content/40">
            {filter === "all" ? "No campaigns yet" : `No ${STATUS_LABELS[filter]} campaigns`}
          </p>
          <p className="text-xs text-base-content/30 mt-1">
            Start a batch from the Signals tab
          </p>
        </div>
      )}

      {/* Campaign Cards */}
      <div className="space-y-2">
        {campaigns.map(c => {
          const progress = c.max_trades > 0 ? Math.round((c.trades_filled / c.max_trades) * 100) : 0;
          const winRate = c.trades_filled > 0 ? ((c.wins / c.trades_filled) * 100).toFixed(0) : "—";
          const pnlColor = (c.realized_pnl || 0) >= 0 ? "text-success" : "text-error";

          return (
            <div
              key={c.id}
              className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelect?.(c.id)}
            >
              <div className="card-body p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`badge badge-sm ${STATUS_BADGES[c.status] || "badge-ghost"}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                    <span className="font-mono text-xs text-base-content/50">{c.id?.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-base-content/40">{c.trades_filled}/{c.max_trades} trades</span>
                    <span>WR: <strong>{winRate}%</strong></span>
                    <span className={pnlColor}>
                      ${(c.realized_pnl || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <progress
                  className={`progress progress-xs w-full ${
                    progress >= 100 ? "progress-success" : "progress-primary"
                  }`}
                  value={c.trades_filled}
                  max={c.max_trades}
                />

                {/* Stopped reason */}
                {c.stopped_reason && (
                  <div className="text-xs text-base-content/50 mt-1">
                    {c.stopped_reason}
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-[10px] text-base-content/30 mt-1">
                  {c.started_at
                    ? `Started ${new Date(c.started_at).toLocaleString()}`
                    : `Created ${new Date(c.created_at).toLocaleString()}`}
                  {c.completed_at && ` • Completed ${new Date(c.completed_at).toLocaleString()}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
