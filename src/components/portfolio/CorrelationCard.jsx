"use client";

import { useState, useCallback } from "react";

/**
 * CorrelationCard — Detects and displays correlation regime across portfolio symbols.
 *
 * Shows:
 * - Correlation regime label (low_corr / mid_corr / high_corr / crisis)
 * - Mean |ρ| with color coding
 * - Correlation heatmap (n×n matrix)
 * - Blended risk multiplier (portfolio-level risk scalar)
 *
 * Props:
 * - symbols: string[] — list of subscribed symbols
 * - returnsMatrix: Object<string, number[]> — symbol → returns array
 * - loading: boolean
 * - onRunCorrelation: () => void
 * - data: correlation result from FastAPI
 */

const REGIME_CONFIG = {
  low_corr: {
    label: "Low Correlation",
    cls: "badge-success",
    desc: "Assets moving independently — full exposure OK",
  },
  mid_corr: {
    label: "Mid Correlation",
    cls: "badge-warning",
    desc: "Some co-movement — moderate diversification",
  },
  high_corr: {
    label: "High Correlation",
    cls: "badge-error",
    desc: "Assets moving together — reduce exposure",
  },
  crisis: {
    label: "Crisis",
    cls: "badge-error",
    desc: "Extreme co-movement — maximal risk reduction",
  },
};

function rhoColor(rho) {
  const abs = Math.abs(rho);
  if (abs >= 0.8) return "rgba(239, 68, 68, 0.7)"; // red
  if (abs >= 0.6) return "rgba(249, 115, 22, 0.6)"; // orange
  if (abs >= 0.4) return "rgba(234, 179, 8, 0.5)"; // yellow
  if (abs >= 0.2) return "rgba(34, 197, 94, 0.4)"; // green
  return "rgba(34, 197, 94, 0.2)"; // green-light
}

export default function CorrelationCard({
  symbols = [],
  returnsMatrix = {},
  data = null,
  loading = false,
  onRunCorrelation,
}) {
  if (symbols.length < 2) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body items-center text-center py-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-base-content/20 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h4 className="text-sm font-bold mb-1">Need 2+ Symbols</h4>
          <p className="text-xs text-base-content/50">
            Subscribe to at least 2 symbols to detect correlation regime.
          </p>
        </div>
      </div>
    );
  }

  const regime = data?.correlation_regime || data?.regime || null;
  const regimeConfig = regime
    ? REGIME_CONFIG[regime] || REGIME_CONFIG.mid_corr
    : null;
  const meanRho = data?.mean_abs_rho ?? data?.mean_rho ?? null;
  const blendedRisk =
    data?.blended_risk_multiplier ?? data?.risk_multiplier ?? null;
  const matrix = data?.correlation_matrix ?? data?.matrix ?? null;

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="card-title text-base">
            🔗 Correlation Detection
            <span className="badge badge-outline badge-sm">v3.0</span>
          </h3>
          <button
            className={`btn btn-sm gap-1 ${loading ? "btn-ghost" : "btn-primary"}`}
            onClick={onRunCorrelation}
            disabled={loading || symbols.length < 2}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-xs" />
                Detecting...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Detect
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {data && (
          <div className="space-y-4 mt-2">
            {/* Regime Banner */}
            {regimeConfig && (
              <div
                className={`alert py-2 px-3 ${
                  regime === "low_corr"
                    ? "alert-success"
                    : regime === "mid_corr"
                      ? "alert-warning"
                      : "alert-error"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge badge-sm ${regimeConfig.cls}`}>
                      {regimeConfig.label}
                    </span>
                    {meanRho != null && (
                      <span className="font-mono text-sm font-bold">
                        Mean |ρ| = {meanRho.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-70">{regimeConfig.desc}</p>
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {meanRho != null && (
                <div className="stat bg-base-300 rounded-lg p-3">
                  <div className="stat-title text-xs">Mean |ρ|</div>
                  <div
                    className={`stat-value text-lg font-mono ${
                      meanRho >= 0.7
                        ? "text-error"
                        : meanRho >= 0.4
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    {meanRho.toFixed(3)}
                  </div>
                  <div className="stat-desc text-xs">
                    {meanRho >= 0.7
                      ? "high co-movement"
                      : meanRho >= 0.4
                        ? "moderate"
                        : "diversified"}
                  </div>
                </div>
              )}
              {blendedRisk != null && (
                <div className="stat bg-base-300 rounded-lg p-3">
                  <div className="stat-title text-xs">Blended Risk</div>
                  <div
                    className={`stat-value text-lg font-mono ${
                      blendedRisk >= 1.0
                        ? "text-success"
                        : blendedRisk >= 0.5
                          ? "text-warning"
                          : "text-error"
                    }`}
                  >
                    {blendedRisk.toFixed(2)}×
                  </div>
                  <div className="stat-desc text-xs">portfolio scalar</div>
                </div>
              )}
              {regime && (
                <div className="stat bg-base-300 rounded-lg p-3">
                  <div className="stat-title text-xs">Regime</div>
                  <div className="stat-value text-sm font-bold">
                    {regime.replace("_", " ")}
                  </div>
                  <div className="stat-desc text-xs">
                    {symbols.length} symbols
                  </div>
                </div>
              )}
            </div>

            {/* Correlation Heatmap */}
            {matrix && symbols.length >= 2 && (
              <CorrelationHeatmap symbols={symbols} matrix={matrix} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Correlation Heatmap ──────────────────────────────────────────────────────

function CorrelationHeatmap({ symbols, matrix }) {
  // matrix can be:
  // 1. 2D array: matrix[i][j] = correlation between symbols[i] and symbols[j]
  // 2. Object: { "GC=F": { "GC=F": 1, "BTC-USD": 0.3 }, ... }

  let rows;
  if (Array.isArray(matrix)) {
    rows = matrix;
  } else if (typeof matrix === "object") {
    // Convert object format to 2D array
    rows = symbols.map((rowSym) =>
      symbols.map((colSym) => {
        const val = matrix[rowSym]?.[colSym];
        return val != null ? val : 0;
      }),
    );
  } else {
    return null;
  }

  const n = symbols.length;
  // Truncate long symbols for display
  const shortName = (s) =>
    s.replace("=X", "").replace("-USD", "").replace("=F", "");

  return (
    <div className="card bg-base-300 rounded-lg">
      <div className="card-body p-3">
        <h4 className="text-xs font-mono opacity-50 mb-2">
          CORRELATION MATRIX
        </h4>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="text-xs"></th>
                {symbols.map((s) => (
                  <th key={s} className="text-xs font-mono text-center px-1">
                    {shortName(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((rowSym, i) => (
                <tr key={rowSym}>
                  <td className="font-mono text-xs font-bold">
                    {shortName(rowSym)}
                  </td>
                  {symbols.map((colSym, j) => {
                    const val = rows[i]?.[j] ?? 0;
                    const bg = rhoColor(val);
                    return (
                      <td
                        key={colSym}
                        className="text-center px-1 py-0.5"
                        style={{ backgroundColor: bg }}
                        title={`${rowSym} × ${colSym}: ρ = ${val.toFixed(3)}`}
                      >
                        <span
                          className={`text-xs font-mono ${Math.abs(val) >= 0.6 ? "text-base-content font-bold" : "text-base-content/70"}`}
                        >
                          {i === j ? "1.00" : val.toFixed(2)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-base-content/50 mt-2 justify-center flex-wrap">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rhoColor(0.1) }}
            />
            |ρ| &lt; 0.2
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rhoColor(0.3) }}
            />
            0.2–0.4
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rhoColor(0.5) }}
            />
            0.4–0.6
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rhoColor(0.7) }}
            />
            0.6–0.8
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rhoColor(0.9) }}
            />
            0.8+
          </span>
        </div>
      </div>
    </div>
  );
}
