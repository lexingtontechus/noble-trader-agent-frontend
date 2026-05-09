"use client";

import { useState, useCallback } from "react";
import { useStream } from "@/context/StreamContext";

const REGIME_COLORS = {
  low_corr: "badge-success",
  mid_corr: "badge-warning",
  high_corr: "badge-error",
  crisis: "badge-error",
};

const REGIME_LABELS = {
  low_corr: "Low Correlation",
  mid_corr: "Mid Correlation",
  high_corr: "High Correlation",
  crisis: "Crisis Mode",
};

function getHeatColor(value) {
  if (value > 0.7) return "bg-error/60";
  if (value > 0.4) return "bg-warning/60";
  return "bg-success/40";
}

function getRhoColor(value) {
  if (value > 0.7) return "text-error";
  if (value > 0.4) return "text-warning";
  return "text-success";
}

export default function CorrelationCard() {
  const { subscriptions } = useStream();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const symbols = [...subscriptions];

  const detect = useCallback(async () => {
    if (symbols.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch returns for each symbol
      const returnsMatrix = {};
      for (const sym of symbols) {
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

      const res = await fetch("/api/correlation/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: Object.keys(returnsMatrix),
          returns_matrix: returnsMatrix,
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

  // Not enough symbols
  if (symbols.length < 2) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">🔗 Correlation Detection</h3>
          <div className="text-sm text-base-content/50 py-4 text-center">
            Subscribe to 2+ symbols to detect correlation
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-sm">
            🔗 Correlation Detection
            {result?.correlation_regime && (
              <span
                className={`badge badge-sm ml-2 ${REGIME_COLORS[result.correlation_regime] || "badge-ghost"}`}
              >
                {REGIME_LABELS[result.correlation_regime] ||
                  result.correlation_regime}
              </span>
            )}
          </h3>
          <button
            className={`btn btn-sm btn-primary ${loading ? "loading" : ""}`}
            onClick={detect}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs mr-1"></span>
            ) : (
              "🔍"
            )}
            {loading ? "Detecting..." : "Detect"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error alert-sm mb-3">
            <span className="text-xs">{error}</span>
            <button className="btn btn-xs btn-ghost ml-auto" onClick={detect}>
              Retry
            </button>
          </div>
        )}

        {/* Mean |ρ| and Blended Risk */}
        {result && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="stat bg-base-300 rounded-box">
                <div className="stat-title text-xs">Mean |ρ|</div>
                <div
                  className={`stat-value text-lg ${getRhoColor(result.mean_abs_rho || 0)}`}
                >
                  {(result.mean_abs_rho || 0).toFixed(3)}
                </div>
              </div>
              <div className="stat bg-base-300 rounded-box">
                <div className="stat-title text-xs">Blended Risk Mult</div>
                <div className="stat-value text-lg">
                  {(result.blended_risk_multiplier || 1).toFixed(2)}x
                </div>
              </div>
            </div>

            {/* Correlation Heatmap */}
            {result.correlation_matrix && (
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th></th>
                      {symbols.map((sym) => (
                        <th key={sym} className="text-center font-mono text-xs">
                          {sym}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {symbols.map((sym1, i) => (
                      <tr key={sym1}>
                        <td className="font-mono text-xs font-semibold">
                          {sym1}
                        </td>
                        {symbols.map((sym2, j) => {
                          const val = result.correlation_matrix?.[i]?.[j] ?? 0;
                          return (
                            <td key={sym2} className="text-center p-1">
                              <div
                                className={`${getHeatColor(Math.abs(val))} rounded px-2 py-1`}
                              >
                                <span className="font-mono text-xs">
                                  {val.toFixed(2)}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
