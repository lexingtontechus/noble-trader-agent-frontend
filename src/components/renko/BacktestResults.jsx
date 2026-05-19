"use client";

import { useState } from "react";
import StatisticalRigorPanel from "./StatisticalRigorPanel";
import ExecutionModelingPanel from "./ExecutionModelingPanel";

/**
 * MetricWithCI — Displays a metric value with optional confidence interval.
 */
function MetricWithCI({ label, value, ci, unit = "" }) {
  if (!ci) return <span>{value}{unit}</span>;
  return (
    <div
      className="tooltip"
      data-tip={`95% CI: [${ci.lower?.toFixed(2)}, ${ci.upper?.toFixed(2)}]`}
    >
      <span className="font-mono">
        {value}{unit}{" "}
        <span className="text-xs text-base-content/50">
          [{ci.lower?.toFixed(2)}, {ci.upper?.toFixed(2)}]
        </span>
      </span>
    </div>
  );
}

/**
 * CostBreakdown — Table showing detailed cost breakdown from backtest.
 */
function CostBreakdown({ costSummary }) {
  if (!costSummary) return null;
  const items = [
    { label: "Commission", value: costSummary.commission, color: "text-info" },
    { label: "Slippage", value: costSummary.slippage, color: "text-warning" },
    { label: "Spread", value: costSummary.spread, color: "text-warning" },
    { label: "Market Impact", value: costSummary.market_impact, color: "text-error" },
    { label: "Borrow", value: costSummary.borrow, color: "text-secondary" },
    { label: "Margin", value: costSummary.margin, color: "text-secondary" },
    { label: "Dividend", value: costSummary.dividend, color: "text-secondary" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="table table-xs">
        <thead>
          <tr>
            <th>Cost Type</th>
            <th className="text-right">Amount ($)</th>
            <th className="text-right">% of Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.label}>
              <td className={item.color}>{item.label}</td>
              <td className="text-right font-mono">${item.value?.toFixed(2)}</td>
              <td className="text-right font-mono">
                {costSummary.total_all_costs > 0
                  ? ((item.value / costSummary.total_all_costs) * 100).toFixed(1)
                  : 0}%
              </td>
            </tr>
          ))}
          <tr className="font-bold border-t">
            <td>Total Costs</td>
            <td className="text-right font-mono">
              ${costSummary.total_all_costs?.toFixed(2)}
            </td>
            <td className="text-right font-mono">100%</td>
          </tr>
          {costSummary.total_cost_pct_of_pnl > 0 && (
            <tr>
              <td colSpan={3} className="text-xs text-base-content/60">
                Costs = {costSummary.total_cost_pct_of_pnl?.toFixed(1)}% of
                gross P&amp;L
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab configuration ────────────────────────────────────────────────────

const RESULT_TABS = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "statistics", label: "Statistics", icon: "🔬" },
  { key: "execution", label: "Execution", icon: "⚡" },
];

/**
 * BacktestResults — Display component for backtest results with Phase 6+7 metrics.
 * Handles both single backtest results and optimization results.
 * Three tabs: Overview, Statistical Rigor, Execution Modeling.
 */
export default function BacktestResults({
  result,
  optimizeResult,
  significanceTests,
  executionModelDetail,
}) {
  const [activeTab, setActiveTab] = useState("overview");

  // ── Empty state ────────────────────────────────────────────────────────
  if (!result && !optimizeResult) {
    return (
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4 text-center text-base-content/50">
          <div className="py-8">
            <span className="text-4xl">📊</span>
            <p className="mt-3 text-sm">Run a backtest to see results here</p>
            <p className="text-xs text-base-content/30 mt-1">
              Configure parameters on the left and click &quot;Run Backtest&quot;
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Optimization results ───────────────────────────────────────────────
  if (optimizeResult) {
    return (
      <div className="space-y-4">
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
                <span className="text-xs">🔍</span>
              </div>
              <h4 className="font-semibold text-sm">Optimization Results</h4>
              <span className="badge badge-sm badge-ghost">
                {optimizeResult.n_combinations} combinations
              </span>
            </div>

            {/* DSR */}
            {optimizeResult.deflated_sharpe && (
              <div
                className={`alert ${
                  optimizeResult.deflated_sharpe.dsr > 0.95
                    ? "alert-success"
                    : "alert-warning"
                } alert-sm mb-3`}
              >
                <div>
                  <div className="font-bold text-xs">
                    Deflated Sharpe Ratio:{" "}
                    {optimizeResult.deflated_sharpe.dsr?.toFixed(4)}
                  </div>
                  <div className="text-xs">
                    {optimizeResult.deflated_sharpe.interpretation}
                  </div>
                </div>
              </div>
            )}

            {/* Multiple Testing */}
            {optimizeResult.multiple_testing?.summary && (
              <div className="text-xs mb-3">
                <span className="font-bold">Multiple Testing:</span>{" "}
                {optimizeResult.multiple_testing.summary.interpretation}
              </div>
            )}

            {/* Significance Tests (from deep analysis) */}
            {significanceTests && (
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-xs font-bold">Significance Tests</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {significanceTests.whites_reality_check && (
                    <div className={`alert ${significanceTests.whites_reality_check.is_significant ? "alert-success" : "alert-warning"} alert-sm py-1`}>
                      <div className="text-xs">
                        <span className="font-bold">White&apos;s RC:</span>{" "}
                        p={significanceTests.whites_reality_check.p_value?.toFixed(4)}
                        {significanceTests.whites_reality_check.is_significant ? " ✓" : ""}
                      </div>
                    </div>
                  )}
                  {significanceTests.hansen_spa && (
                    <div className={`alert ${significanceTests.hansen_spa.is_significant ? "alert-success" : "alert-warning"} alert-sm py-1`}>
                      <div className="text-xs">
                        <span className="font-bold">Hansen SPA:</span>{" "}
                        p={significanceTests.hansen_spa.p_value?.toFixed(4)}
                        {significanceTests.hansen_spa.is_significant ? " ✓" : ""}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results table */}
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Brick</th>
                    <th>SL</th>
                    <th>TP</th>
                    <th>Trades</th>
                    <th>WR</th>
                    <th>Sharpe</th>
                    <th>P&amp;L</th>
                    <th>Bonf p</th>
                    <th>BH p</th>
                  </tr>
                </thead>
                <tbody>
                  {optimizeResult.results?.slice(0, 20).map((r, i) => (
                    <tr
                      key={i}
                      className={i === 0 ? "font-bold bg-primary/10" : ""}
                    >
                      <td>{i + 1}</td>
                      <td>{r.brick_size}</td>
                      <td>{r.sl_bricks}</td>
                      <td>{r.tp_bricks}</td>
                      <td>{r.total_trades}</td>
                      <td>{(r.win_rate * 100).toFixed(1)}%</td>
                      <td>{r.sharpe?.toFixed(2)}</td>
                      <td
                        className={
                          r.total_pnl_bricks >= 0 ? "text-success" : "text-error"
                        }
                      >
                        {r.total_pnl_bricks?.toFixed(2)}
                      </td>
                      <td>{r.bonferroni_adjusted_p?.toFixed(3) || "\u2014"}</td>
                      <td>{r.bh_adjusted_p?.toFixed(3) || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed Statistical Rigor for Optimization */}
        {(optimizeResult.deflated_sharpe || optimizeResult.multiple_testing) && (
          <StatisticalRigorPanel
            dsr={optimizeResult.deflated_sharpe}
            multipleTesting={optimizeResult.multiple_testing}
            significanceTests={significanceTests}
          />
        )}
      </div>
    );
  }

  // ── Single backtest results (tabbed) ────────────────────────────────────
  const stats = result.stats?.journal || result.stats || {};
  const costSummary = stats.cost_summary || {};
  const fillStats = stats.fill_stats || {};
  const dollarStats = stats.dollar_stats || {};
  const bootstrapCI = result.bootstrap_ci || result.bootstrap_cis || {};
  const dsr = result.deflated_sharpe || result.deflated_sharpe_result || {};
  const execModel = result.execution_modeling || result.execution_model || {};

  // Extract detailed execution data (from deep analysis or inline response)
  const marketImpactDetail =
    executionModelDetail?.market_impact || result.market_impact;
  const fillProbabilityDetail =
    executionModelDetail?.fill_probability || result.fill_probability;
  const financingCostsDetail =
    executionModelDetail?.financing_costs || result.financing_costs;

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="tabs tabs-boxed bg-base-200 p-0.5">
        {RESULT_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab tab-sm ${activeTab === tab.key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Key Metrics */}
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center">
                  <span className="text-xs">📈</span>
                </div>
                <h4 className="font-semibold text-sm">Performance Metrics</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Total Trades</div>
                  <div className="stat-value text-lg">{stats.total_trades || 0}</div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Win Rate</div>
                  <div className="stat-value text-lg">
                    <MetricWithCI
                      value={((stats.win_rate || 0) * 100).toFixed(1)}
                      unit="%"
                      ci={bootstrapCI.win_rate?.percentile_ci}
                    />
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Sharpe Ratio</div>
                  <div className="stat-value text-lg">
                    <MetricWithCI
                      value={(stats.sharpe_estimate || 0).toFixed(2)}
                      ci={bootstrapCI.sharpe_ratio?.percentile_ci}
                    />
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Profit Factor</div>
                  <div className="stat-value text-lg">
                    <MetricWithCI
                      value={(stats.profit_factor || 0).toFixed(2)}
                      ci={bootstrapCI.profit_factor?.percentile_ci}
                    />
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Max Drawdown</div>
                  <div className="stat-value text-lg text-error">
                    <MetricWithCI
                      value={(stats.max_drawdown_bricks || 0).toFixed(2)}
                      ci={bootstrapCI.max_drawdown?.percentile_ci}
                    />
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Net Return</div>
                  <div className="stat-value text-lg">
                    {dollarStats.net_return_pct?.toFixed(2) || "0.00"}%
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Net P&amp;L</div>
                  <div
                    className={`stat-value text-lg ${
                      dollarStats.net_pnl_dollars >= 0 ? "text-success" : "text-error"
                    }`}
                  >
                    ${dollarStats.net_pnl_dollars?.toFixed(2) || "0.00"}
                  </div>
                </div>
                <div className="stat bg-base-100 rounded-lg p-2">
                  <div className="stat-title text-xs">Total Bricks</div>
                  <div className="stat-value text-lg">{result.total_bricks || 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Deflated Sharpe Ratio */}
          {dsr.dsr !== undefined && (
            <div
              className={`alert ${
                dsr.is_significant
                  ? "alert-success"
                  : dsr.dsr > 0.75
                  ? "alert-warning"
                  : "alert-error"
              } alert-sm`}
            >
              <div>
                <div className="font-bold text-xs">
                  Deflated Sharpe Ratio: {dsr.dsr?.toFixed(4)}
                  {dsr.is_significant && " \u2713 Significant"}
                </div>
                <div className="text-xs">{dsr.interpretation}</div>
                {dsr.n_trials > 1 && (
                  <div className="text-xs text-base-content/60">
                    Expected max Sharpe under null:{" "}
                    {dsr.expected_max_sharpe?.toFixed(4)} (across {dsr.n_trials}{" "}
                    trials)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cost Breakdown */}
          {costSummary.total_all_costs > 0 && (
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
                    <span className="text-xs">💸</span>
                  </div>
                  <h4 className="font-semibold text-sm">Cost Breakdown</h4>
                  <span className="badge badge-sm badge-ghost">
                    ${costSummary.total_all_costs?.toFixed(2)} total
                  </span>
                </div>
                <CostBreakdown costSummary={costSummary} />
              </div>
            </div>
          )}

          {/* Fill Statistics */}
          {fillStats.missed_fills > 0 && (
            <div className="alert alert-warning alert-sm">
              <div>
                <div className="font-bold text-xs">Fill Statistics</div>
                <div className="text-xs">
                  Avg fill probability:{" "}
                  {(fillStats.avg_fill_probability * 100).toFixed(1)}% | Missed
                  fills: {fillStats.missed_fills} (
                  {(fillStats.missed_fill_rate * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          )}

          {/* Data Lineage */}
          {result.data_hash && (
            <div className="text-xs text-base-content/40">
              Data hash: {result.data_hash} | Ticks: {result.total_ticks} | Bricks:{" "}
              {result.total_bricks}
            </div>
          )}
        </div>
      )}

      {/* ── Statistics Tab ───────────────────────────────────────────────── */}
      {activeTab === "statistics" && (
        <StatisticalRigorPanel
          bootstrapCI={bootstrapCI}
          dsr={dsr}
          significanceTests={significanceTests}
        />
      )}

      {/* ── Execution Tab ────────────────────────────────────────────────── */}
      {activeTab === "execution" && (
        <ExecutionModelingPanel
          costSummary={costSummary}
          fillStats={fillStats}
          executionModeling={execModel}
          marketImpact={marketImpactDetail}
          fillProbability={fillProbabilityDetail}
          financingCosts={financingCostsDetail}
        />
      )}
    </div>
  );
}
