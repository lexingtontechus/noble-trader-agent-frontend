"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area,
  Legend,
} from "recharts";

/**
 * MonteCarloResults — Display Monte Carlo permutation test results.
 *
 * Shows:
 *   1. Summary cards (P(Profitable), P(Beat Original), P5/P95 range, Mean P&L, Simulations)
 *   2. Confidence band chart: LineChart with original equity curve + p5/p95 shaded areas
 */

function formatNum(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n === Infinity) return "∞";
  return n.toFixed(decimals);
}

function formatPct(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
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

function MCTooltip({ active, payload, label: tooltipLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-base-content/50 mb-1">Trade #{tooltipLabel}</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono" style={{ color: entry.color || entry.stroke }}>
          {entry.name}: {typeof entry.value === "number" ? formatNum(entry.value, 2) : entry.value} br
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

/**
 * @param {{ result: import("@/types/backtest").RenkoMonteCarloResponse, symbol?: string }} props
 */
export default function MonteCarloResults({ result, symbol = "SPY" }) {
  const {
    original = {},
    confidence_bands = {},
    p_profitable = 0,
    p_beat_original = 0,
    p5_final_pnl = 0,
    p95_final_pnl = 0,
    mean_final_pnl = 0,
    simulation_count = 0,
    n_trades = 0,
  } = result || {};

  // Prepare confidence band chart data
  // confidence_bands has: p5, p25, p50, p75, p95, original — each is an array of cumulative P&L values
  const chartData = useMemo(() => {
    const bands = confidence_bands;
    if (!bands || !bands.original || !bands.original.length) return [];

    const maxLen = bands.original.length;
    const data = [];

    for (let i = 0; i < maxLen; i++) {
      const point = {
        trade: i + 1,
        original: bands.original[i] ?? null,
      };
      if (bands.p50 && i < bands.p50.length) point.p50 = bands.p50[i];
      if (bands.p25 && i < bands.p25.length) point.p25 = bands.p25[i];
      if (bands.p75 && i < bands.p75.length) point.p75 = bands.p75[i];
      if (bands.p5 && i < bands.p5.length) point.p5 = bands.p5[i];
      if (bands.p95 && i < bands.p95.length) point.p95 = bands.p95[i];
      data.push(point);
    }

    return data;
  }, [confidence_bands]);

  return (
    <div className="space-y-4">
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="P(Profitable)"
          value={formatPct(p_profitable)}
          icon="💰"
          colorClass={p_profitable >= 0.8 ? "text-success" : p_profitable >= 0.5 ? "text-warning" : "text-error"}
          subtext="Chance of positive P&L"
        />
        <MetricCard
          label="P(Beat Original)"
          value={formatPct(p_beat_original)}
          icon="🏆"
          colorClass={p_beat_original <= 0.5 ? "text-success" : "text-warning"}
          subtext={p_beat_original <= 0.5 ? "Original is robust" : "Random often beats it"}
        />
        <MetricCard
          label="P5–P95 P&L Range"
          value={`${formatNum(p5_final_pnl, 1)} to ${formatNum(p95_final_pnl, 1)}`}
          icon="📏"
          colorClass={p5_final_pnl >= 0 ? "text-success" : "text-error"}
          subtext="90% confidence interval"
        />
        <MetricCard
          label="Mean P&L"
          value={`${formatNum(mean_final_pnl, 2)} br`}
          icon="📊"
          colorClass={mean_final_pnl >= 0 ? "text-success" : "text-error"}
          subtext="Across all simulations"
        />
        <MetricCard
          label="Simulations"
          value={simulation_count.toLocaleString()}
          icon="🎲"
          subtext={`${n_trades} trades each`}
        />
      </div>

      {/* ── Statistical Significance Interpretation ────────────────────── */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <SectionHeader icon="🔬" title="Statistical Significance" />
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${p_profitable >= 0.8 ? "bg-success" : p_profitable >= 0.5 ? "bg-warning" : "bg-error"}`} />
              <span className="text-base-content/70">Profitability:</span>
              {p_profitable >= 0.8 ? (
                <span className="text-success font-semibold">High confidence — {formatPct(p_profitable)} of permutations profitable</span>
              ) : p_profitable >= 0.5 ? (
                <span className="text-warning">Moderate — {formatPct(p_profitable)} profitable, but not definitive</span>
              ) : (
                <span className="text-error">Low confidence — only {formatPct(p_profitable)} profitable</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${p_beat_original <= 0.5 ? "bg-success" : "bg-warning"}`} />
              <span className="text-base-content/70">Data-snooping bias:</span>
              {p_beat_original <= 0.3 ? (
                <span className="text-success font-semibold">Low risk — original strategy outperforms most random permutations</span>
              ) : p_beat_original <= 0.5 ? (
                <span className="text-success">Acceptable — original is competitive with random</span>
              ) : (
                <span className="text-warning">Caution — random permutations often beat original, possible overfitting</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${p5_final_pnl >= 0 ? "bg-success" : "bg-error"}`} />
              <span className="text-base-content/70">Worst-case (P5):</span>
              <span className={p5_final_pnl >= 0 ? "text-success" : "text-error"}>
                {p5_final_pnl >= 0 ? "Even the 5th percentile is profitable" : `5th percentile loses ${formatNum(Math.abs(p5_final_pnl), 1)} br`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confidence Band Chart ──────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="📈" title="Monte Carlo Confidence Bands" badge={`${simulation_count} simulations`} />
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis
                  dataKey="trade"
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                  label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                  label={{ value: "Cumulative P&L (bricks)", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <Tooltip content={<MCTooltip />} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="5 5" />

                {/* P5–P95 outer band (lighter) */}
                {confidence_bands.p5 && (
                  <Area
                    type="monotone"
                    dataKey="p95"
                    stroke="none"
                    fill="#8884d8"
                    fillOpacity={0.08}
                    name="P95"
                  />
                )}
                {confidence_bands.p5 && (
                  <Area
                    type="monotone"
                    dataKey="p5"
                    stroke="none"
                    fill="#ffffff"
                    fillOpacity={1}
                    name="P5"
                  />
                )}

                {/* P25–P75 inner band (darker) */}
                {confidence_bands.p25 && (
                  <Area
                    type="monotone"
                    dataKey="p75"
                    stroke="none"
                    fill="#8884d8"
                    fillOpacity={0.15}
                    name="P75"
                  />
                )}
                {confidence_bands.p25 && (
                  <Area
                    type="monotone"
                    dataKey="p25"
                    stroke="none"
                    fill="#ffffff"
                    fillOpacity={1}
                    name="P25"
                  />
                )}

                {/* P50 median line */}
                {confidence_bands.p50 && (
                  <Line
                    type="monotone"
                    dataKey="p50"
                    name="Median (P50)"
                    stroke="#8884d8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}

                {/* Original equity curve (bold) */}
                <Line
                  type="monotone"
                  dataKey="original"
                  name="Original"
                  stroke={chartData[chartData.length - 1]?.original >= 0 ? "#22c55e" : "#ef4444"}
                  strokeWidth={2.5}
                  dot={chartData.length < 40}
                  activeDot={{ r: 4 }}
                />

                <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend explanation */}
            <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-base-content/40 justify-center">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-2 rounded bg-[#22c55e]" /> Original equity curve
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-2 rounded bg-[#8884d8] opacity-30" /> P5–P95 band
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-2 rounded bg-[#8884d8] opacity-60" /> P25–P75 band
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-[#8884d8] border-dashed" /> Median (P50)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Original Backtest Summary ──────────────────────────────────── */}
      {original && Object.keys(original).length > 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <SectionHeader icon="📋" title="Original Backtest Summary" badge="Baseline" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {original.total_trades !== undefined && (
                <MetricCard
                  label="Total Trades"
                  value={original.total_trades}
                  icon="📋"
                />
              )}
              {original.win_rate !== undefined && (
                <MetricCard
                  label="Win Rate"
                  value={`${formatNum(original.win_rate * 100, 1)}%`}
                  icon="🎯"
                  colorClass={original.win_rate >= 0.5 ? "text-success" : "text-error"}
                />
              )}
              {original.total_pnl_bricks !== undefined && (
                <MetricCard
                  label="Total P&L"
                  value={`${original.total_pnl_bricks >= 0 ? "+" : ""}${formatNum(original.total_pnl_bricks, 1)} br`}
                  icon="💰"
                  colorClass={original.total_pnl_bricks >= 0 ? "text-success" : "text-error"}
                />
              )}
              {original.sharpe_estimate !== undefined && (
                <MetricCard
                  label="Sharpe"
                  value={formatNum(original.sharpe_estimate)}
                  icon="📈"
                  colorClass={original.sharpe_estimate >= 1 ? "text-success" : original.sharpe_estimate >= 0 ? "text-warning" : "text-error"}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
