"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

/**
 * OptimizerCard — Portfolio weight optimization and drawdown constraint display.
 *
 * Shows:
 * - Current vs. optimal weights bar chart
 * - Regime-adjusted weights (after per-asset risk multiplier)
 * - Drawdown constraint status
 * - Exposure scalar (100% in low_corr, 50% in crisis)
 *
 * Props:
 * - symbols: string[]
 * - returnsMatrix: Object<string, number[]>
 * - currentWeights: Object<string, number> — { "GC=F": 0.33, "BTC-USD": 0.33, ... }
 * - data: optimization result from FastAPI
 * - loading: boolean
 * - onRunOptimize: () => void
 */

function WeightsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg p-2 shadow-lg text-xs">
      <p className="font-bold font-mono mb-1">{d.symbol}</p>
      {d.current != null && (
        <p className="text-info">Current: {(d.current * 100).toFixed(1)}%</p>
      )}
      {d.optimal != null && (
        <p className="text-success">Optimal: {(d.optimal * 100).toFixed(1)}%</p>
      )}
      {d.regime_adjusted != null && (
        <p className="text-warning">
          Regime-adj: {(d.regime_adjusted * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

export default function OptimizerCard({
  symbols = [],
  returnsMatrix = {},
  currentWeights = {},
  data = null,
  loading = false,
  onRunOptimize,
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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h4 className="text-sm font-bold mb-1">Need 2+ Symbols</h4>
          <p className="text-xs text-base-content/50">
            Subscribe to at least 2 symbols to run portfolio optimization.
          </p>
        </div>
      </div>
    );
  }

  // Parse optimization results
  const optimalWeights = data?.optimal_weights ?? data?.weights ?? {};
  const regimeAdjusted =
    data?.regime_adjusted_weights ?? data?.adjusted_weights ?? {};
  const exposureScalar = data?.exposure_scalar ?? data?.exposure ?? null;
  const ddConstraint = data?.drawdown_constraint ?? data?.dd_constraint ?? null;
  const correlationRegime = data?.correlation_regime ?? data?.regime ?? null;

  // Build bar chart data
  const chartData = symbols.map((sym) => ({
    symbol: sym.replace("=X", "").replace("-USD", "").replace("=F", ""),
    fullName: sym,
    current: currentWeights[sym] ?? null,
    optimal: optimalWeights[sym] ?? null,
    regime_adjusted: regimeAdjusted[sym] ?? null,
  }));

  // Exposure scalar description
  const exposureDesc =
    exposureScalar != null
      ? exposureScalar >= 0.9
        ? "Full exposure allowed"
        : exposureScalar >= 0.6
          ? "Reduced exposure recommended"
          : "Minimal exposure — crisis mode"
      : null;

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="card-title text-base">
            ⚖️ Portfolio Optimizer
            <span className="badge badge-outline badge-sm">v3.0</span>
          </h3>
          <button
            className={`btn btn-sm gap-1 ${loading ? "btn-ghost" : "btn-primary"}`}
            onClick={onRunOptimize}
            disabled={loading || symbols.length < 2}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-xs" />
                Optimizing...
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
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
                Optimize
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {data && (
          <div className="space-y-4 mt-2">
            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Exposure Scalar */}
              <div className="stat bg-base-300 rounded-lg p-3">
                <div className="stat-title text-xs">Exposure Scalar</div>
                <div
                  className={`stat-value text-lg font-mono ${
                    exposureScalar != null && exposureScalar >= 0.9
                      ? "text-success"
                      : exposureScalar >= 0.5
                        ? "text-warning"
                        : "text-error"
                  }`}
                >
                  {exposureScalar != null
                    ? `${(exposureScalar * 100).toFixed(0)}%`
                    : "—"}
                </div>
                <div className="stat-desc text-xs">{exposureDesc || "—"}</div>
              </div>

              {/* Drawdown Constraint */}
              <div className="stat bg-base-300 rounded-lg p-3">
                <div className="stat-title text-xs">DD Constraint</div>
                <div
                  className={`stat-value text-lg font-mono ${
                    ddConstraint?.within_limits ? "text-success" : "text-error"
                  }`}
                >
                  {ddConstraint?.within_limits != null
                    ? ddConstraint.within_limits
                      ? "✓ OK"
                      : "✗ Breach"
                    : "—"}
                </div>
                <div className="stat-desc text-xs">
                  {ddConstraint?.max_dd != null
                    ? `max ${(ddConstraint.max_dd * 100).toFixed(0)}% DD`
                    : "—"}
                </div>
              </div>

              {/* Correlation Regime */}
              <div className="stat bg-base-300 rounded-lg p-3">
                <div className="stat-title text-xs">Corr Regime</div>
                <div className="stat-value text-sm font-bold">
                  {correlationRegime
                    ? correlationRegime.replace("_", " ")
                    : "—"}
                </div>
                <div className="stat-desc text-xs">
                  {correlationRegime === "low_corr"
                    ? "full exposure"
                    : correlationRegime === "crisis"
                      ? "50% exposure"
                      : "moderate"}
                </div>
              </div>

              {/* Symbols Count */}
              <div className="stat bg-base-300 rounded-lg p-3">
                <div className="stat-title text-xs">Symbols</div>
                <div className="stat-value text-lg font-mono">
                  {symbols.length}
                </div>
                <div className="stat-desc text-xs">optimized</div>
              </div>
            </div>

            {/* Weights Comparison Bar Chart */}
            {Object.keys(optimalWeights).length > 0 && (
              <div className="card bg-base-300 rounded-lg">
                <div className="card-body p-3">
                  <h4 className="text-xs font-mono opacity-50 mb-2">
                    CURRENT vs OPTIMAL WEIGHTS
                  </h4>
                  <div style={{ minHeight: "180px", width: "100%" }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="symbol"
                          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                          width={45}
                        />
                        <Tooltip content={<WeightsTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 10 }}
                          formatter={(value) => {
                            if (value === "current") return "Current";
                            if (value === "optimal") return "Optimal";
                            if (value === "regime_adjusted")
                              return "Regime-adj";
                            return value;
                          }}
                        />
                        <Bar
                          dataKey="current"
                          fill="rgba(59, 130, 246, 0.7)"
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="optimal"
                          fill="rgba(34, 197, 94, 0.7)"
                          radius={[2, 2, 0, 0]}
                        />
                        {Object.keys(regimeAdjusted).length > 0 && (
                          <Bar
                            dataKey="regime_adjusted"
                            fill="rgba(234, 179, 8, 0.6)"
                            radius={[2, 2, 0, 0]}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Weights Table */}
            {Object.keys(optimalWeights).length > 0 && (
              <div className="card bg-base-300 rounded-lg">
                <div className="card-body p-3">
                  <h4 className="text-xs font-mono opacity-50 mb-2">
                    WEIGHT DETAILS
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Current</th>
                          <th>Optimal</th>
                          <th>Regime-adj</th>
                          <th>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbols.map((sym) => {
                          const cur = currentWeights[sym] ?? 0;
                          const opt = optimalWeights[sym] ?? 0;
                          const radj = regimeAdjusted[sym] ?? opt;
                          const delta = opt - cur;

                          return (
                            <tr key={sym}>
                              <td className="font-mono font-bold text-xs">
                                {sym}
                              </td>
                              <td className="font-mono text-xs">
                                {(cur * 100).toFixed(1)}%
                              </td>
                              <td className="font-mono text-xs text-success">
                                {(opt * 100).toFixed(1)}%
                              </td>
                              <td className="font-mono text-xs text-warning">
                                {(radj * 100).toFixed(1)}%
                              </td>
                              <td
                                className={`font-mono text-xs font-bold ${delta > 0.01 ? "text-success" : delta < -0.01 ? "text-error" : ""}`}
                              >
                                {delta >= 0 ? "+" : ""}
                                {(delta * 100).toFixed(1)}%
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

            {/* Drawdown Constraint Details */}
            {ddConstraint && (
              <div
                className={`alert py-2 px-3 ${ddConstraint.within_limits ? "alert-success" : "alert-error"}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  {ddConstraint.within_limits ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  )}
                </svg>
                <div className="flex-1">
                  <span className="text-sm font-semibold">
                    {ddConstraint.within_limits
                      ? "Within DD limits"
                      : "DD constraint breached"}
                  </span>
                  <span className="text-xs opacity-70 ml-2">
                    {ddConstraint.current_dd != null &&
                      `Current: ${(ddConstraint.current_dd * 100).toFixed(1)}%`}
                    {ddConstraint.max_dd != null &&
                      ` / Max: ${(ddConstraint.max_dd * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
