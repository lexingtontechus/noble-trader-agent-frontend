"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStream } from "@/context/StreamContext";
import CorrelationCard from "./CorrelationCard_o";
import OptimizerCard from "./OptimizerCard_o";
import EmptyState from "@/components/shared/EmptyState";

export default function PortfolioOverview() {
  const { subscriptions, streamStates, alerts, activeStreamCount } =
    useStream();
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);

  const fetchPortfolio = useCallback(async () => {
    if (subscriptions.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const symbols = Object.keys(subscriptions)
        .filter((symbol) => subscriptions[symbol])
        .join(",");
      const res = await fetch(
        `/api/portfolio?symbols=${encodeURIComponent(symbols)}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPortfolio(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [subscriptions]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && subscriptions.size > 0) {
      intervalRef.current = setInterval(fetchPortfolio, 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchPortfolio, subscriptions.size]);

  // Empty state
  if (subscriptions.size === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Portfolio Overview</h2>
          <span className="badge badge-outline badge-sm">v3.0</span>
        </div>
        <EmptyState
          icon="📊"
          title="No Active Streams"
          description="Start streaming symbols from the Dashboard to see portfolio analysis."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Portfolio Overview</h2>
        <div className="flex items-center gap-2">
          <span className="badge badge-outline badge-sm">v3.0</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <span className="text-xs text-base-content/60">Auto 30s</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-xs"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>
          <button
            className="btn btn-xs btn-ghost"
            onClick={fetchPortfolio}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "🔄"
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error alert-sm">
          <span>{error}</span>
          <button
            className="btn btn-xs btn-ghost ml-auto"
            onClick={fetchPortfolio}
          >
            Retry
          </button>
        </div>
      )}

      {/* Risk Flags Banner */}
      {portfolio?.risk_flags && (
        <div className="flex flex-wrap gap-2">
          {portfolio.risk_flags.high_risk_count > 0 && (
            <span className="badge badge-error badge-sm">
              ⚠️ {portfolio.risk_flags.high_risk_count} High Risk
            </span>
          )}
          {portfolio.risk_flags.concentration_risk && (
            <span className="badge badge-warning badge-sm">
              🎯 Concentration Risk
            </span>
          )}
          {portfolio.risk_flags.regime_divergence && (
            <span className="badge badge-warning badge-sm">
              🔀 Regime Divergence
            </span>
          )}
          {portfolio.risk_flags.correlation_risk && (
            <span className="badge badge-error badge-sm">
              🔗 Correlation Risk
            </span>
          )}
          {alerts.length > 0 && (
            <span className="badge badge-info badge-sm">
              🔔 {alerts.length} Alerts
            </span>
          )}
        </div>
      )}

      {/* Portfolio Stats */}
      {portfolio && (
        <div className="stats stats-vertical sm:stats-horizontal shadow w-full">
          <div className="stat">
            <div className="stat-title">Portfolio VaR 95</div>
            <div className="stat-value text-lg">
              {((portfolio.portfolio_var_95 || 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">Active Symbols</div>
            <div className="stat-value text-lg">{activeStreamCount}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Corr Regime</div>
            <div className="stat-value text-lg capitalize">
              {portfolio.correlation_regime || "—"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">Exposure</div>
            <div className="stat-value text-lg">
              {((portfolio.exposure_scalar || 1) * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {/* Symbol Breakdown Table */}
      {portfolio?.breakdown && portfolio.breakdown.length > 0 && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body p-4">
            <h3 className="card-title text-sm mb-3">📋 Symbol Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Regime</th>
                    <th>Risk Mult</th>
                    <th>Kelly Size</th>
                    <th>VaR 95</th>
                    <th>Stream</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.breakdown.map((row, i) => {
                    const state = streamStates[row.symbol] || {};
                    return (
                      <tr key={i}>
                        <td className="font-mono font-semibold text-sm">
                          {row.symbol}
                        </td>
                        <td>
                          <span className="badge badge-sm badge-outline">
                            {row.regime_label || "—"}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <progress
                              className="progress progress-primary w-16"
                              value={row.risk_multiplier || 0}
                              max="3"
                            ></progress>
                            <span className="text-xs">
                              {(row.risk_multiplier || 0).toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-sm">
                          {((row.kelly_size || 0) * 100).toFixed(1)}%
                        </td>
                        <td className="font-mono text-sm">
                          {((row.var_95 || 0) * 100).toFixed(1)}%
                        </td>
                        <td>
                          <span
                            className={`badge badge-xs ${state.streaming ? "badge-success" : "badge-ghost"}`}
                          >
                            {state.streaming ? "LIVE" : "OFF"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Regime Alerts */}
      {alerts.length > 0 && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body p-4">
            <h3 className="card-title text-sm mb-3">🔔 Recent Alerts</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-2 text-xs bg-base-300 rounded px-2 py-1"
                >
                  <span
                    className={`badge badge-xs ${alert.severity === "critical" ? "badge-error" : alert.severity === "warning" ? "badge-warning" : "badge-info"}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="font-mono font-semibold">
                    {alert.symbol}
                  </span>
                  <span className="text-base-content/70 truncate flex-1">
                    {alert.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CORRELATION & OPTIMIZATION Divider */}
      <div className="divider text-base-content/40 text-xs">
        CORRELATION & OPTIMIZATION
      </div>

      {/* Correlation Card */}
      <CorrelationCard />

      {/* Optimizer Card */}
      <OptimizerCard />
    </div>
  );
}
