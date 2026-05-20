"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

/**
 * WalkForwardResults — Display walk-forward validation results.
 *
 * Shows:
 *   1. Aggregate summary cards (Total Windows, Avg OOS P&L, Degradation Ratio, Avg OOS Sharpe, Avg OOS Win Rate)
 *   2. Per-window table (Window #, IS P&L, OOS P&L, IS Sharpe, OOS Sharpe, IS Trades, OOS Trades)
 *   3. IS vs OOS comparison bar chart
 */

function formatNum(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n === Infinity) return "∞";
  return n.toFixed(decimals);
}

// ── Section Header ────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
        <span className="text-xs">{icon}</span>
      </div>
      <h4 className="font-semibold text-sm">{title}</h4>
      {badge && (
        <span className="badge badge-xs badge-ghost ml-auto">{badge}</span>
      )}
    </div>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon, colorClass = "", subtext }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">{label}</span>
          {icon && <span className="text-base-content/20 text-xs">{icon}</span>}
        </div>
        <div className={`text-xl font-bold font-mono ${colorClass}`}>{value}</div>
        {subtext && <div className="text-[10px] text-base-content/30 mt-0.5">{subtext}</div>}
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────

function WFBarTooltip({ active, payload, label: tooltipLabel }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-base-content/50 mb-1 font-semibold">Window {tooltipLabel}</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? formatNum(entry.value, 2) : entry.value} br
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

/**
 * @param {{ result: import("@/types/backtest").RenkoWalkForwardResponse, symbol?: string }} props
 */
export default function WalkForwardResults({ result, symbol = "SPY" }) {
  const { windows = [], aggregate = {}, config_used = {}, total_ticks = 0 } = result || {};

  // Aggregate stats
  const totalWindows = windows.length;
  const avgOosPnl = aggregate.avg_oos_pnl ?? aggregate.oos_avg_pnl ?? 0;
  const degradationRatio = aggregate.degradation_ratio ?? 0;
  const avgOosSharpe = aggregate.avg_oos_sharpe ?? aggregate.oos_avg_sharpe ?? 0;
  const avgOosWinRate = aggregate.avg_oos_win_rate ?? aggregate.oos_avg_win_rate ?? 0;
  const avgIsPnl = aggregate.avg_is_pnl ?? aggregate.is_avg_pnl ?? 0;

  // Prepare bar chart data
  const chartData = useMemo(() => {
    return windows.map((w, i) => ({
      window: i + 1,
      is_pnl: w.is_pnl_bricks ?? w.is_stats?.total_pnl_bricks ?? 0,
      oos_pnl: w.oos_pnl_bricks ?? w.oos_stats?.total_pnl_bricks ?? 0,
    }));
  }, [windows]);

  return (
    <div className="space-y-4">
      {/* ── Aggregate Summary Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Total Windows"
          value={totalWindows}
          icon="🪟"
          subtext={`${total_ticks} total ticks`}
        />
        <MetricCard
          label="Avg OOS P&L"
          value={`${formatNum(avgOosPnl, 2)} br`}
          icon="📊"
          colorClass={avgOosPnl >= 0 ? "text-success" : "text-error"}
          subtext="Out-of-sample avg"
        />
        <MetricCard
          label="Degradation Ratio"
          value={formatNum(degradationRatio, 3)}
          icon="📉"
          colorClass={degradationRatio <= 0.5 ? "text-success" : degradationRatio <= 1.0 ? "text-warning" : "text-error"}
          subtext={degradationRatio <= 0.5 ? "Low degradation" : degradationRatio <= 1.0 ? "Moderate degradation" : "High degradation"}
        />
        <MetricCard
          label="Avg OOS Sharpe"
          value={formatNum(avgOosSharpe)}
          icon="📈"
          colorClass={avgOosSharpe >= 1 ? "text-success" : avgOosSharpe >= 0 ? "text-warning" : "text-error"}
          subtext="Risk-adj OOS"
        />
        <MetricCard
          label="Avg OOS Win Rate"
          value={`${formatNum(avgOosWinRate * 100, 1)}%`}
          icon="🎯"
          colorClass={avgOosWinRate >= 0.5 ? "text-success" : "text-error"}
          subtext="Out-of-sample"
        />
      </div>

      {/* ── Degradation Interpretation ────────────────────────────────── */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <SectionHeader icon="📋" title="Degradation Analysis" />
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-base-content/50">Avg IS P&L:</span>{" "}
              <span className={`font-mono font-semibold ${avgIsPnl >= 0 ? "text-success" : "text-error"}`}>
                {formatNum(avgIsPnl, 2)} br
              </span>
            </div>
            <div>
              <span className="text-base-content/50">Avg OOS P&L:</span>{" "}
              <span className={`font-mono font-semibold ${avgOosPnl >= 0 ? "text-success" : "text-error"}`}>
                {formatNum(avgOosPnl, 2)} br
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-base-content/50">Interpretation:</span>{" "}
              {degradationRatio <= 0.3 ? (
                <span className="text-success font-semibold">Excellent — strategy holds well OOS</span>
              ) : degradationRatio <= 0.5 ? (
                <span className="text-success">Good — moderate degradation, acceptable</span>
              ) : degradationRatio <= 1.0 ? (
                <span className="text-warning">Caution — significant IS→OOS drop</span>
              ) : (
                <span className="text-error">Warning — OOS underperforms IS significantly</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── IS vs OOS Comparison Bar Chart ────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="📊" title="IS vs OOS P&L by Window" badge={`${chartData.length} windows`} />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="window" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} label={{ value: "Window #", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} label={{ value: "P&L (bricks)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <Tooltip content={<WFBarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
                <Bar dataKey="is_pnl" name="IS P&L" fill="#8884d8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="oos_pnl" name="OOS P&L" fill="#82ca9d" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Per-Window Table ────────────────────────────────────────────── */}
      {windows.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="📋" title="Per-Window Results" badge={`${windows.length} windows`} />
            <div className="overflow-x-auto max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Window #</th>
                    <th className="text-xs">IS P&L (br)</th>
                    <th className="text-xs">OOS P&L (br)</th>
                    <th className="text-xs">IS Sharpe</th>
                    <th className="text-xs">OOS Sharpe</th>
                    <th className="text-xs">IS Trades</th>
                    <th className="text-xs">OOS Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.map((w, i) => {
                    const isPnl = w.is_pnl_bricks ?? w.is_stats?.total_pnl_bricks ?? 0;
                    const oosPnl = w.oos_pnl_bricks ?? w.oos_stats?.total_pnl_bricks ?? 0;
                    const isSharpe = w.is_sharpe ?? w.is_stats?.sharpe_estimate ?? 0;
                    const oosSharpe = w.oos_sharpe ?? w.oos_stats?.sharpe_estimate ?? 0;
                    const isTrades = w.is_trades ?? w.is_stats?.total_trades ?? 0;
                    const oosTrades = w.oos_trades ?? w.oos_stats?.total_trades ?? 0;
                    return (
                      <tr key={i} className={oosPnl < 0 ? "opacity-70" : ""}>
                        <td className="font-mono text-xs font-semibold">{i + 1}</td>
                        <td className="font-mono text-xs">
                          <span className={isPnl >= 0 ? "text-success" : "text-error"}>
                            {isPnl >= 0 ? "+" : ""}{formatNum(isPnl, 2)}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          <span className={oosPnl >= 0 ? "text-success" : "text-error"}>
                            {oosPnl >= 0 ? "+" : ""}{formatNum(oosPnl, 2)}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          <span className={isSharpe >= 1 ? "text-success" : isSharpe >= 0 ? "text-warning" : "text-error"}>
                            {formatNum(isSharpe)}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          <span className={oosSharpe >= 1 ? "text-success" : oosSharpe >= 0 ? "text-warning" : "text-error"}>
                            {formatNum(oosSharpe)}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{isTrades}</td>
                        <td className="font-mono text-xs">{oosTrades}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Config Used ────────────────────────────────────────────────── */}
      {config_used && Object.keys(config_used).length > 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <SectionHeader icon="⚙️" title="Walk-Forward Configuration" badge={symbol} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {Object.entries(config_used).map(([key, val]) => (
                <div key={key} className="bg-base-300/30 rounded-lg p-2">
                  <div className="text-[9px] text-base-content/30 uppercase">{key}</div>
                  <div className="font-mono text-xs font-semibold">
                    {typeof val === "boolean" ? (val ? "✓" : "✗") : String(val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
