"use client";

import { useState, useCallback } from "react";
import { useStream } from "@/context/StreamContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function OptimizerCard() {
  const { subscriptions } = useStream();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const symbols = Object.keys(subscriptions).filter(
    (symbol) => subscriptions[symbol],
  );

  const optimize = useCallback(async () => {
    if (symbols.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch returns and current weights
      const returnsMatrix = {};
      const currentWeights = {};
      const equalWeight = 1 / symbols.length;

      for (const sym of symbols) {
        currentWeights[sym] = equalWeight;
        const res = await fetch(
          `/api/prices?symbol=${encodeURIComponent(sym)}&period=1y`,
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data.prices && data.prices.length > 1) {
          const returns = [];
          for (let i = 1; i < data.prices.length; i++) {
            returns.push(
              (data.prices[i] - data.prices[i - 1]) / data.prices[i - 1],
            );
          }
          returnsMatrix[sym] = returns;
        }
      }

      const res = await fetch("/api/optimise/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: Object.keys(returnsMatrix),
          returns_matrix: returnsMatrix,
          current_weights: currentWeights,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  if (symbols.length < 2) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">⚖️ Portfolio Optimizer</h3>
          <div className="text-sm text-base-content/50 py-4 text-center">
            Subscribe to 2+ symbols to optimize weights
          </div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = result
    ? symbols.map((sym) => ({
        symbol: sym,
        current: (result.current_weights?.[sym] || 0) * 100,
        optimal: (result.optimal_weights?.[sym] || 0) * 100,
        adjusted: (result.regime_adjusted_weights?.[sym] || 0) * 100,
      }))
    : [];

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-sm">
            ⚖️ Portfolio Optimizer
            {result && (
              <>
                <span className="badge badge-sm badge-info ml-2">
                  {((result.exposure_scalar || 1) * 100).toFixed(0)}% exposure
                </span>
                <span
                  className={`badge badge-sm ml-1 ${result.drawdown_constraint?.breached ? "badge-error" : "badge-success"}`}
                >
                  DD {result.drawdown_constraint?.breached ? "BREACH" : "OK"}
                </span>
              </>
            )}
          </h3>
          <button
            className={`btn btn-sm btn-secondary ${loading ? "loading" : ""}`}
            onClick={optimize}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs mr-1"></span>
            ) : (
              "⚖️"
            )}
            {loading ? "Optimizing..." : "Optimize"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error alert-sm mb-3">
            <span className="text-xs">{error}</span>
            <button className="btn btn-xs btn-ghost ml-auto" onClick={optimize}>
              Retry
            </button>
          </div>
        )}

        {result && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              <div className="stat bg-base-300 rounded-box py-2">
                <div className="stat-title text-xs">Exposure Scalar</div>
                <div className="stat-value text-sm">
                  {((result.exposure_scalar || 1) * 100).toFixed(0)}%
                </div>
              </div>
              <div className="stat bg-base-300 rounded-box py-2">
                <div className="stat-title text-xs">DD Constraint</div>
                <div
                  className={`stat-value text-sm ${result.drawdown_constraint?.breached ? "text-error" : "text-success"}`}
                >
                  {result.drawdown_constraint?.breached ? "BREACH" : "Within"}
                </div>
              </div>
              <div className="stat bg-base-300 rounded-box py-2">
                <div className="stat-title text-xs">Corr Regime</div>
                <div className="stat-value text-sm capitalize">
                  {result.correlation_regime || "—"}
                </div>
              </div>
              <div className="stat bg-base-300 rounded-box py-2">
                <div className="stat-title text-xs">Symbols</div>
                <div className="stat-value text-sm">{symbols.length}</div>
              </div>
            </div>

            {/* Weight Comparison Chart */}
            {chartData.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold mb-2">
                  Current vs Optimal vs Adjusted Weights
                </h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="symbol" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar
                        dataKey="current"
                        fill="#6b7280"
                        name="Current"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="optimal"
                        fill="#22c55e"
                        name="Optimal"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="adjusted"
                        fill="#f59e0b"
                        name="Regime Adj"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Drawdown Constraint Detail */}
            {result.drawdown_constraint && (
              <div
                className={`alert ${result.drawdown_constraint.breached ? "alert-error" : "alert-success"} mb-3`}
              >
                <span className="text-xs">
                  Current DD:{" "}
                  {((result.drawdown_constraint.current_dd || 0) * 100).toFixed(
                    1,
                  )}
                  % / Max DD:{" "}
                  {((result.drawdown_constraint.max_dd || 0) * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Detailed Weights Table */}
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Current</th>
                    <th>Optimal</th>
                    <th>Adjusted</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {symbols.map((sym) => {
                    const current = (result.current_weights?.[sym] || 0) * 100;
                    const optimal = (result.optimal_weights?.[sym] || 0) * 100;
                    const adjusted =
                      (result.regime_adjusted_weights?.[sym] || 0) * 100;
                    const delta = optimal - current;
                    return (
                      <tr key={sym}>
                        <td className="font-mono font-semibold">{sym}</td>
                        <td className="font-mono">{current.toFixed(1)}%</td>
                        <td className="font-mono">{optimal.toFixed(1)}%</td>
                        <td className="font-mono">{adjusted.toFixed(1)}%</td>
                        <td
                          className={`font-mono ${delta > 0 ? "text-success" : delta < 0 ? "text-error" : ""}`}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
