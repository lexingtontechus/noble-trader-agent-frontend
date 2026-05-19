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
  BarChart,
  Bar,
  Legend,
} from "recharts";

/**
 * BacktestResults — Visualization of a single Renko pipeline backtest.
 *
 * Sections:
 *   1. Summary Metric Cards (total trades, win rate, profit factor, Sharpe, max DD, Kelly)
 *   2. Extra Brick Metrics
 *   3. Dollar P&L Metrics (from stats.dollar_stats)
 *   4. Equity Curve — cumulative P&L over trades
 *   5. Drawdown Underwater Plot
 *   6. Monthly Returns Heatmap — calendar-style grid
 *   7. Trade Distribution (win/loss histogram by P&L bucket)
 *   8. Per-Pattern Breakdown (if available)
 *   9. Transaction Cost Breakdown
 *  10. Regime-Conditional Performance (Phase 4D)
 *  11. Data Quality (Phase 5)
 *  12. Statistical Rigor (Phase 6)
 *  13. Execution Modeling (Phase 7)
 *  14. Trade Log Table
 *  15. Config Used
 */

// ── Exit Type Display Names ──────────────────────────────────────────────

const EXIT_TYPE_LABELS = {
  closed_sl: "SL",
  closed_tp: "TP",
  closed_trail: "Trail",
  closed_sl_gap: "Gap SL",
  closed_oco_sl: "OCO SL",
  closed_oco_tp: "OCO TP",
  closed_session: "Session",
  closed_signal: "Signal",
  closed_time: "Time",
  closed_manual: "Manual",
};

function exitTypeLabel(raw) {
  if (!raw) return "—";
  return EXIT_TYPE_LABELS[raw] || raw.replace(/^closed_/, "");
}

// ── Helper Functions ──────────────────────────────────────────────────────

function calcEquityCurve(trades) {
  let cumulative = 0;
  return trades.map((t, i) => {
    cumulative += t.pnl_bricks || 0;
    return { trade: i + 1, pnl: cumulative };
  });
}

function calcDrawdown(equityCurve) {
  let peak = 0;
  return equityCurve.map((point) => {
    if (point.pnl > peak) peak = point.pnl;
    const dd = peak - point.pnl;
    return { trade: point.trade, drawdown: dd };
  });
}

function calcTradeDistribution(trades) {
  const buckets = {};
  for (let i = -8; i <= 8; i++) {
    const label = i === 8 ? "8+" : i === -8 ? "≤-8" : `${i} to ${i + 1}`;
    buckets[i] = { label, wins: 0, losses: 0 };
  }
  trades.forEach((t) => {
    const pnl = t.pnl_bricks || 0;
    const bucket = Math.max(-8, Math.min(7, Math.floor(pnl)));
    if (pnl >= 0) buckets[bucket].wins++;
    else buckets[bucket].losses++;
  });
  return Object.values(buckets);
}

function formatNum(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n === Infinity) return "∞";
  return n.toFixed(decimals);
}

// ── Monthly Returns Heatmap ──────────────────────────────────────────────

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Compute monthly P&L from trade list.
 * Trades without timestamps are distributed evenly across the backtest period.
 * Returns a Map<"YYYY-MM", number> of cumulative P&L per month.
 */
function calcMonthlyReturns(trades) {
  const monthly = new Map();

  if (!trades.length) return monthly;

  // If trades have timestamps, use them
  const hasTimestamps = trades.some((t) => t.timestamp || t.entry_time || t.open_time);

  trades.forEach((t, i) => {
    const pnl = t.pnl_bricks || 0;
    let monthKey;

    if (hasTimestamps) {
      const ts = t.timestamp || t.entry_time || t.open_time;
      const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
      if (!isNaN(d.getTime())) {
        monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    }

    // Fallback: distribute trades evenly across a synthetic 12-month window
    if (!monthKey) {
      const year = 2024;
      const month = Math.floor((i / trades.length) * 12);
      monthKey = `${year}-${String(Math.min(month + 1, 12)).padStart(2, "0")}`;
    }

    monthly.set(monthKey, (monthly.get(monthKey) || 0) + pnl);
  });

  return monthly;
}

/**
 * Heatmap color for a P&L value. Green for positive, red for negative, grey for zero/empty.
 * Opacity scales with magnitude relative to the max absolute value.
 */
function pnlHeatmapStyle(value, maxAbs) {
  if (value === null || value === undefined) {
    return { backgroundColor: "oklch(var(--b3))", opacity: 0.3 };
  }
  if (maxAbs === 0) {
    return { backgroundColor: "oklch(var(--b3))" };
  }
  const intensity = Math.min(Math.abs(value) / maxAbs, 1);
  if (value >= 0) {
    return { backgroundColor: `oklch(0.72 0.19 155 / ${0.15 + intensity * 0.7})` };
  } else {
    return { backgroundColor: `oklch(0.63 0.21 25 / ${0.15 + intensity * 0.7})` };
  }
}

function MonthlyReturnsHeatmap({ trades }) {
  const { yearRows, maxAbs } = useMemo(() => {
    const monthly = calcMonthlyReturns(trades);
    if (!monthly.size) return { yearRows: [], maxAbs: 0 };

    // Organize into year → month structure
    const byYear = new Map();
    let maxAbsVal = 0;

    monthly.forEach((pnl, key) => {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed
      if (!byYear.has(year)) byYear.set(year, new Array(12).fill(null));
      byYear.get(year)[month] = pnl;
      maxAbsVal = Math.max(maxAbsVal, Math.abs(pnl));
    });

    const rows = Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, months]) => ({ year, months }));

    return { yearRows: rows, maxAbs: maxAbsVal };
  }, [trades]);

  if (!yearRows.length) {
    return (
      <div className="text-center py-8">
        <span className="text-base-content/30 text-sm">No trades to compute monthly returns</span>
      </div>
    );
  }

  // Compute annual totals
  const annualTotals = yearRows.map((row) =>
    row.months.reduce((sum, val) => sum + (val || 0), 0)
  );

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm w-full">
        <thead>
          <tr>
            <th className="text-xs font-mono w-14">Year</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="text-xs text-center font-mono px-1">{m}</th>
            ))}
            <th className="text-xs font-mono text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {yearRows.map((row, ri) => (
            <tr key={row.year}>
              <td className="font-mono text-xs font-semibold">{row.year}</td>
              {row.months.map((val, mi) => (
                <td key={mi} className="text-center px-1 py-1">
                  <div
                    className="rounded px-1 py-0.5 font-mono text-[10px] font-bold min-w-[32px] transition-colors"
                    style={pnlHeatmapStyle(val, maxAbs)}
                    title={val !== null ? `${MONTH_LABELS[mi]} ${row.year}: ${formatNum(val, 1)} bricks` : ""}
                  >
                    {val !== null ? (val >= 0 ? "+" : "") + formatNum(val, 1) : "—"}
                  </div>
                </td>
              ))}
              <td className="text-center">
                <span className={`font-mono text-xs font-bold ${annualTotals[ri] >= 0 ? "text-success" : "text-error"}`}>
                  {annualTotals[ri] >= 0 ? "+" : ""}{formatNum(annualTotals[ri], 1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Color legend */}
      <div className="flex items-center gap-2 mt-3 justify-center">
        <span className="text-[10px] text-base-content/30">Loss</span>
        <div className="flex h-3 rounded-full overflow-hidden" style={{ width: 100 }}>
          {[0.8, 0.6, 0.4, 0.2, 0.1, 0.1, 0.2, 0.4, 0.6, 0.8].map((op, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                backgroundColor: i < 5
                  ? `oklch(0.63 0.21 25 / ${op})`
                  : `oklch(0.72 0.19 155 / ${op})`,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] text-base-content/30">Profit</span>
        <span className="text-[10px] text-base-content/20 ml-2">(bricks)</span>
      </div>
    </div>
  );
}

// ── Custom Tooltips ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label: tooltipLabel, suffix = "" }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-base-content/50 mb-1">Trade #{tooltipLabel}</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}{suffix}
        </div>
      ))}
    </div>
  );
}

function BarTooltipContent({ active, payload, label: tooltipLabel }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-base-content/50 mb-1 font-semibold">{tooltipLabel} bricks</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
}

function RegimeBarTooltip({ active, payload, label: tooltipLabel }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-base-content/50 mb-1 font-semibold">{tooltipLabel}</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono" style={{ color: entry.color }}>
          {entry.name}: ${formatNum(entry.value, 2)}
        </div>
      ))}
    </div>
  );
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

// ── Main Component ────────────────────────────────────────────────────────

/**
 * @param {{ result: import("@/types/backtest").RenkoBacktestResponse, symbol?: string, streaming?: boolean }} props
 */
export default function BacktestResults({ result, symbol = "SPY", streaming = false }) {
  const { stats = {}, trades = [], total_ticks = 0, total_bricks = 0, config_used = {} } = result;

  // BUG FIX: Use startsWith("closed") to match all closed status variants
  const closedTrades = useMemo(
    () => (Array.isArray(trades) ? trades.filter((t) => t.status?.startsWith("closed") || !t.status) : []),
    [trades]
  );

  const metrics = useMemo(() => {
    const equityCurve = calcEquityCurve(closedTrades);
    const drawdownData = calcDrawdown(equityCurve);
    const maxDD = Math.max(...drawdownData.map((d) => d.drawdown), 0);
    const distribution = calcTradeDistribution(closedTrades);

    // Extract stats from journal
    const journal = stats?.journal || stats;
    const totalTrades = journal.total_trades ?? closedTrades.length;
    const winRate = journal.win_rate ?? (closedTrades.length ? (closedTrades.filter((t) => (t.pnl_bricks || 0) > 0).length / closedTrades.length) * 100 : 0);
    const profitFactor = journal.profit_factor ?? 0;
    const sharpe = journal.sharpe_estimate ?? 0;
    const kelly = journal.kelly_fraction ?? 0;
    const totalPnlBricks = journal.total_pnl_bricks ?? closedTrades.reduce((s, t) => s + (t.pnl_bricks || 0), 0);
    const avgPnlBricks = journal.avg_pnl_bricks ?? (closedTrades.length ? totalPnlBricks / closedTrades.length : 0);
    const avgWinBricks = journal.avg_win_bricks ?? 0;
    const avgLossBricks = journal.avg_loss_bricks ?? 0;

    // Per-pattern breakdown (if available)
    const byPattern = journal.by_pattern || {};

    // Dollar-denominated stats (Phase 4)
    const dollarStats = journal.dollar_stats || stats?.dollar_stats || {};

    // Regime-conditional performance (Phase 4D)
    const byRegime = journal.by_regime || stats?.by_regime || {};

    return {
      equityCurve,
      drawdownData,
      maxDD,
      distribution,
      totalTrades,
      winRate,
      profitFactor,
      sharpe,
      kelly,
      totalPnlBricks,
      avgPnlBricks,
      avgWinBricks,
      avgLossBricks,
      byPattern,
      dollarStats,
      byRegime,
    };
  }, [closedTrades, stats]);

  const hasTrades = closedTrades.length > 0;

  // Dollar stats helpers
  const ds = metrics.dollarStats;
  const hasDollarStats = ds && Object.keys(ds).length > 0;

  // Regime data helpers
  const byRegime = metrics.byRegime;
  const hasRegimeData = byRegime && Object.keys(byRegime).length > 0;

  // Prepare regime bar chart data
  const regimeChartData = useMemo(() => {
    if (!hasRegimeData) return [];
    return Object.entries(byRegime).map(([regime, data]) => ({
      regime,
      pnl_dollars: data.pnl_dollars ?? 0,
      trades: data.count ?? 0,
      win_rate: data.win_rate ?? 0,
    }));
  }, [byRegime, hasRegimeData]);

  return (
    <div className="space-y-4">
      {/* Streaming indicator — shows when results are partial/in-progress */}
      {streaming && (
        <div className="alert alert-warning alert-sm py-1">
          <span className="loading loading-spinner loading-xs" />
          <span className="text-xs">Streaming results — equity curve and stats updating in real-time...</span>
        </div>
      )}

      {/* ── Section 1: Summary Metric Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Trades"
          value={metrics.totalTrades}
          icon="📋"
          subtext={`${total_ticks} ticks → ${total_bricks} bricks`}
        />
        <MetricCard
          label="Win Rate"
          value={`${formatNum(metrics.winRate, 1)}%`}
          icon="🎯"
          colorClass={metrics.winRate >= 50 ? "text-success" : "text-error"}
          subtext={`${closedTrades.filter((t) => (t.pnl_bricks || 0) > 0).length} wins`}
        />
        <MetricCard
          label="Profit Factor"
          value={formatNum(metrics.profitFactor)}
          icon="⚖️"
          colorClass={metrics.profitFactor >= 1 ? "text-success" : "text-error"}
          subtext="Gross wins / losses"
        />
        <MetricCard
          label="Sharpe Est."
          value={formatNum(metrics.sharpe)}
          icon="📈"
          colorClass={metrics.sharpe >= 1 ? "text-success" : metrics.sharpe >= 0 ? "text-warning" : "text-error"}
          subtext="Risk-adjusted return"
        />
        <MetricCard
          label="Max Drawdown"
          value={`${formatNum(metrics.maxDD, 1)} br`}
          icon="📉"
          colorClass="text-error"
          subtext="Peak-to-trough"
        />
        <MetricCard
          label="Kelly Fraction"
          value={`${formatNum(metrics.kelly, 1)}%`}
          icon="🎲"
          colorClass={metrics.kelly > 0 ? "text-success" : "text-base-content/50"}
          subtext="Optimal bet size"
        />
      </div>

      {/* Extra metrics row (brick-denominated) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total P&L" value={`${metrics.totalPnlBricks >= 0 ? "+" : ""}${formatNum(metrics.totalPnlBricks, 1)} br`} icon="💰" colorClass={metrics.totalPnlBricks >= 0 ? "text-success" : "text-error"} />
        <MetricCard label="Avg P&L/Trade" value={`${formatNum(metrics.avgPnlBricks, 2)} br`} icon="📊" colorClass={metrics.avgPnlBricks >= 0 ? "text-success" : "text-error"} />
        <MetricCard label="Avg Win" value={`+${formatNum(metrics.avgWinBricks, 2)} br`} icon="✅" colorClass="text-success" />
        <MetricCard label="Avg Loss" value={`${formatNum(metrics.avgLossBricks, 2)} br`} icon="❌" colorClass="text-error" />
      </div>

      {/* ── Dollar P&L Metrics Row ──────────────────────────────────────── */}
      {hasDollarStats && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <SectionHeader icon="💵" title="Dollar P&L Metrics" badge={`Initial: $${formatNum(ds.initial_capital, 0)}`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                label="Total P&L ($)"
                value={`$${formatNum(ds.total_pnl_dollars, 2)}`}
                colorClass={(ds.total_pnl_dollars ?? 0) >= 0 ? "text-success" : "text-error"}
                subtext="Net profit"
              />
              <MetricCard
                label="Return %"
                value={`${formatNum(ds.return_pct, 2)}%`}
                colorClass={(ds.return_pct ?? 0) >= 0 ? "text-success" : "text-error"}
                subtext="On initial capital"
              />
              <MetricCard
                label="Dollar Sharpe"
                value={formatNum(ds.sharpe_dollars)}
                colorClass={(ds.sharpe_dollars ?? 0) >= 1 ? "text-success" : (ds.sharpe_dollars ?? 0) >= 0 ? "text-warning" : "text-error"}
                subtext="Risk-adj ($)"
              />
              <MetricCard
                label="Dollar Max DD"
                value={`$${formatNum(ds.max_drawdown_dollars, 2)}`}
                colorClass="text-error"
                subtext="Peak-to-trough"
              />
              <MetricCard
                label="Avg P&L/Trade ($)"
                value={`$${formatNum(ds.avg_pnl_dollars, 2)}`}
                colorClass={(ds.avg_pnl_dollars ?? 0) >= 0 ? "text-success" : "text-error"}
                subtext="Per trade"
              />
              <MetricCard
                label="Dollar Profit Factor"
                value={formatNum(ds.profit_factor_dollars)}
                colorClass={(ds.profit_factor_dollars ?? 0) >= 1 ? "text-success" : "text-error"}
                subtext="Gross win/loss ($)"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Equity Curve ──────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📈" title="Equity Curve" badge={`${metrics.totalTrades} trades`} />
          {!hasTrades ? (
            <div className="text-center py-8">
              <span className="text-2xl mb-2 block">📋</span>
              <span className="text-base-content/30 text-sm">No trades to display</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics.equityCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="trade" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                <Tooltip content={<ChartTooltip suffix=" br" />} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="5 5" />
                <Line
                  type="monotone"
                  dataKey="pnl"
                  name="Cumulative P&L"
                  stroke={metrics.equityCurve[metrics.equityCurve.length - 1]?.pnl >= 0 ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  dot={metrics.equityCurve.length < 40}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Section 3: Drawdown Chart ────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="🌊" title="Drawdown Chart" badge={`Max: ${formatNum(metrics.maxDD, 1)} bricks`} />
          {!hasTrades || metrics.drawdownData.every((d) => d.drawdown === 0) ? (
            <div className="text-center py-6">
              <span className="text-success text-sm">✓ No drawdown — equity at all-time high</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={metrics.drawdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="trade" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} reversed />
                <Tooltip content={<ChartTooltip suffix=" br" />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  name="Drawdown"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Section 4: Monthly Returns Heatmap ─────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="🗓️" title="Monthly Returns" badge="Calendar heatmap" />
          <MonthlyReturnsHeatmap trades={closedTrades} />
        </div>
      </div>

      {/* ── Section 5: Trade Distribution ─────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📊" title="Trade Distribution" badge="Win/Loss by P&L bucket" />
          {!hasTrades ? (
            <div className="text-center py-8">
              <span className="text-base-content/30 text-sm">No trades to display</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.3} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} allowDecimals={false} />
                <Tooltip content={<BarTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="wins" name="Wins" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="losses" name="Losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Section 6: Per-Pattern Breakdown ──────────────────────────────── */}
      {Object.keys(metrics.byPattern).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="🏷️" title="Per-Pattern Breakdown" badge={`${Object.keys(metrics.byPattern).length} patterns`} />
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Pattern</th>
                    <th className="text-xs">Trades</th>
                    <th className="text-xs">Win Rate</th>
                    <th className="text-xs">Avg P&L (br)</th>
                    <th className="text-xs">Total P&L (br)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.byPattern).map(([pattern, data]) => (
                    <tr key={pattern}>
                      <td className="font-mono text-xs">{pattern}</td>
                      <td className="font-mono text-xs">{data.total_trades ?? data.count ?? "—"}</td>
                      <td className="font-mono text-xs">
                        <span className={(data.win_rate ?? 0) >= 50 ? "text-success" : "text-error"}>
                          {formatNum((data.win_rate ?? 0) * 100, 1)}%
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(data.avg_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}>
                          {formatNum(data.avg_pnl_bricks ?? 0, 2)}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(data.total_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}>
                          {formatNum(data.total_pnl_bricks ?? 0, 1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 7: Transaction Cost Breakdown ──────────────────────────── */}
      {(() => {
        const costSummary = stats?.cost_summary || stats?.journal?.cost_summary;
        if (!costSummary || !hasTrades) return null;
        const { total_commission = 0, total_slippage_cost = 0, total_transaction_costs = 0,
                total_gross_pnl_dollars = 0, total_net_pnl_dollars = 0, cost_drag_pct = 0,
                avg_cost_per_trade = 0, by_exit_type = {} } = costSummary;
        return (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon="💸" title="Transaction Costs" badge={`${formatNum(cost_drag_pct, 1)}% drag`} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <MetricCard label="Total Commission" value={`$${formatNum(total_commission, 2)}`} icon="🏦" colorClass="text-warning" subtext="Entry + exit" />
                <MetricCard label="Total Slippage" value={`$${formatNum(total_slippage_cost, 2)}`} icon="📉" colorClass="text-warning" subtext="Entry + exit" />
                <MetricCard label="Total Costs" value={`$${formatNum(total_transaction_costs, 2)}`} icon="💰" colorClass="text-error" subtext="Commission + slippage" />
                <MetricCard label="Avg Cost/Trade" value={`$${formatNum(avg_cost_per_trade, 2)}`} icon="📊" colorClass="text-base-content/70" subtext={`Per trade avg`} />
              </div>
              {Object.keys(by_exit_type).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="text-xs">Exit Type</th>
                        <th className="text-xs">Count</th>
                        <th className="text-xs">Commission</th>
                        <th className="text-xs">Slippage</th>
                        <th className="text-xs">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(by_exit_type).map(([exitType, data]) => (
                        <tr key={exitType}>
                          <td className="font-mono text-xs">{exitTypeLabel(exitType)}</td>
                          <td className="font-mono text-xs">{data.count}</td>
                          <td className="font-mono text-xs text-warning">${formatNum(data.commission, 2)}</td>
                          <td className="font-mono text-xs text-warning">${formatNum(data.slippage, 2)}</td>
                          <td className="font-mono text-xs text-error">${formatNum(data.total_cost, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(total_gross_pnl_dollars !== 0 || total_net_pnl_dollars !== 0) && (
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="text-base-content/50">Gross P&L: <span className={`font-mono font-semibold ${total_gross_pnl_dollars >= 0 ? "text-success" : "text-error"}`}>${formatNum(total_gross_pnl_dollars, 2)}</span></span>
                  <span className="text-base-content/30">→</span>
                  <span className="text-base-content/50">Net P&L: <span className={`font-mono font-semibold ${total_net_pnl_dollars >= 0 ? "text-success" : "text-error"}`}>${formatNum(total_net_pnl_dollars, 2)}</span></span>
                  <span className="text-base-content/30">(after ${formatNum(total_transaction_costs, 2)} costs)</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Section 8: Regime-Conditional Performance (Phase 4D) ──────────── */}
      {hasRegimeData && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="🧭" title="Regime-Conditional Performance" badge={`${Object.keys(byRegime).length} regimes`} />
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Regime</th>
                    <th className="text-xs">Trades</th>
                    <th className="text-xs">Win Rate</th>
                    <th className="text-xs">P&L ($)</th>
                    <th className="text-xs">Return %</th>
                    <th className="text-xs">Avg P&L ($)</th>
                    <th className="text-xs">Cost ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byRegime).map(([regime, data]) => (
                    <tr key={regime}>
                      <td className="font-mono text-xs font-semibold">{regime}</td>
                      <td className="font-mono text-xs">{data.count ?? "—"}</td>
                      <td className="font-mono text-xs">
                        <span className={(data.win_rate ?? 0) >= 50 ? "text-success" : "text-error"}>
                          {formatNum((data.win_rate ?? 0) * 100, 1)}%
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(data.pnl_dollars ?? 0) >= 0 ? "text-success" : "text-error"}>
                          ${formatNum(data.pnl_dollars ?? 0, 2)}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(data.return_pct ?? 0) >= 0 ? "text-success" : "text-error"}>
                          {formatNum(data.return_pct ?? 0, 2)}%
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(data.avg_pnl_dollars ?? 0) >= 0 ? "text-success" : "text-error"}>
                          ${formatNum(data.avg_pnl_dollars ?? 0, 2)}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-warning">
                        ${formatNum(data.total_cost ?? 0, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Regime P&L Bar Chart */}
            {regimeChartData.length > 1 && (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={regimeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis dataKey="regime" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                    <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                    <Tooltip content={<RegimeBarTooltip />} />
                    <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
                    <Bar
                      dataKey="pnl_dollars"
                      name="P&L ($)"
                      radius={[4, 4, 0, 0]}
                      fill="#8884d8"
                      // Color bars based on positive/negative
                      shape={({ payload, ...rest }) => {
                        const { x, y, width, height } = rest;
                        const color = payload.pnl_dollars >= 0 ? "#22c55e" : "#ef4444";
                        return (
                          <rect
                            x={x}
                            y={payload.pnl_dollars >= 0 ? y : y}
                            width={width}
                            height={Math.abs(height)}
                            fill={color}
                            rx={4}
                          />
                        );
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Data Quality (Phase 5) ─────────────────────────────────────────── */}
      {(() => {
        const sb = result.survivorship_bias;
        const dqWarnings = result.data_quality_warnings;
        const dp = result.data_provenance;
        const ca = result.price_adjustments_applied;
        const la = result.look_ahead_audit_result;

        const hasAny = (sb?.warning) || (dqWarnings?.length > 0) || (dp?.data_hash) || (ca?.length > 0) || (la);
        if (!hasAny) return null;

        return (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon="🛡️" title="Data Quality" badge="Phase 5" />

              {/* a) Survivorship Bias Warning */}
              {sb?.warning && (
                <div className="alert alert-warning alert-sm mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <span className="text-xs font-semibold">Survivorship Bias Detected</span>
                    <p className="text-xs mt-0.5">{sb.message}</p>
                    {sb.index_name && (
                      <span className="badge badge-xs badge-warning mt-1">Index: {sb.index_name}</span>
                    )}
                  </div>
                </div>
              )}

              {/* b) Data Quality Warnings */}
              {dqWarnings?.length > 0 && (
                <div className="alert alert-error alert-sm mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="text-xs font-semibold">Data Quality Warnings ({dqWarnings.length})</span>
                    <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                      {dqWarnings.map((w, i) => (
                        <li key={i}>{typeof w === "string" ? w : w.message || JSON.stringify(w)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* c) Data Provenance */}
              {dp?.data_hash && (
                <div className="card bg-base-300/30 shadow-sm mb-3">
                  <div className="card-body p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-base-content/70">Data Provenance</span>
                      <span className="badge badge-xs badge-info">verified</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Data Hash</div>
                        <div className="font-mono font-semibold">{dp.data_hash.slice(0, 16)}…</div>
                      </div>
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Source</div>
                        <div className="font-mono">{dp.source || "—"}</div>
                      </div>
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Price Count</div>
                        <div className="font-mono">{dp.price_count ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Adjustment</div>
                        <div className="font-mono">{dp.adjustment_mode || "—"}</div>
                      </div>
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Universe</div>
                        <div className="font-mono">{dp.universe_mode || "—"}</div>
                      </div>
                      <div>
                        <div className="text-base-content/40 text-[10px] uppercase">Fetch Date</div>
                        <div className="font-mono">{dp.fetch_date || "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* d) Corporate Actions Applied */}
              {ca?.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Corporate Actions Applied ({ca.length})</div>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th className="text-xs">Type</th>
                          <th className="text-xs">Ex-Date</th>
                          <th className="text-xs">Description</th>
                          <th className="text-xs">Prices Affected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ca.map((action, i) => (
                          <tr key={i}>
                            <td><span className="badge badge-xs badge-info">{action.type || "—"}</span></td>
                            <td className="font-mono text-xs">{action.ex_date || action.exDate || "—"}</td>
                            <td className="text-xs">{action.description || "—"}</td>
                            <td className="font-mono text-xs">{action.prices_affected ?? action.pricesAffected ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* e) Look-Ahead Audit */}
              {la && (
                <div className={`alert ${la.clean ? "alert-success" : "alert-error"} alert-sm`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    {la.clean ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                  <div>
                    <span className="text-xs font-semibold">
                      {la.clean ? "Look-Ahead Audit: Clean" : "Look-Ahead Audit: Warnings Detected"}
                    </span>
                    {la.message && <p className="text-xs mt-0.5">{la.message}</p>}
                    {la.warnings?.length > 0 && (
                      <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                        {la.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>{typeof w === "string" ? w : w.message || JSON.stringify(w)}</li>
                        ))}
                        {la.warnings.length > 5 && (
                          <li className="text-base-content/40">…and {la.warnings.length - 5} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Statistical Rigor (Phase 6) ────────────────────────────────────── */}
      {(() => {
        const bootstrapCis = result.bootstrap_cis;
        const dsrResult = result.deflated_sharpe_result;
        const hasAny = (bootstrapCis && Object.keys(bootstrapCis).length > 0) || dsrResult;
        if (!hasAny) return null;

        // Extract display-formatted CIs if available
        const ciDisplay = bootstrapCis?._display || {};
        const ciMetrics = Object.entries(bootstrapCis || {}).filter(([k]) => k !== "_display");

        return (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon="🔬" title="Statistical Rigor" badge="Phase 6" />

              {/* 6A: Deflated Sharpe Ratio */}
              {dsrResult && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Deflated Sharpe Ratio (DSR)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard
                      label="DSR"
                      value={formatNum(dsrResult.dsr, 4)}
                      colorClass={dsrResult.dsr >= 0.95 ? "text-success" : dsrResult.dsr >= 0.9 ? "text-warning" : "text-error"}
                      subtext={dsrResult.is_significant ? "Significant at 5%" : "Not significant"}
                    />
                    <MetricCard
                      label="Observed Sharpe"
                      value={formatNum(dsrResult.observed_sharpe, 3)}
                      subtext="Raw (uncorrected)"
                    />
                    <MetricCard
                      label="Expected Max SR"
                      value={formatNum(dsrResult.expected_max_sharpe, 3)}
                      subtext={`From ${dsrResult.n_trials} trial(s)`}
                    />
                    <MetricCard
                      label="Significance"
                      value={dsrResult.is_significant ? "Yes" : "No"}
                      colorClass={dsrResult.is_significant ? "text-success" : "text-error"}
                      subtext={`p < ${(1 - dsrResult.dsr).toFixed(4)}`}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-base-content/30">
                    DSR adjusts Sharpe for multiple testing. DSR &ge; 0.95 = significant at 5% level.
                    {dsrResult.n_trials === 1 && " (Single backtest: no multiple testing penalty applied.)"}
                  </div>
                </div>
              )}

              {/* 6B: Bootstrap Confidence Intervals */}
              {ciMetrics.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Bootstrap Confidence Intervals (95%)</div>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th className="text-xs">Metric</th>
                          <th className="text-xs">Point Estimate</th>
                          <th className="text-xs">95% CI</th>
                          <th className="text-xs">Width</th>
                          <th className="text-xs">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ciMetrics.map(([metricName, ciData]) => {
                          const display = ciDisplay[metricName] || {};
                          const width = (ciData.ci_upper ?? 0) - (ciData.ci_lower ?? 0);
                          return (
                            <tr key={metricName}>
                              <td className="font-mono text-xs font-semibold">{metricName.replace(/_/g, " ")}</td>
                              <td className="font-mono text-xs">
                                <span className="font-bold">{display.point_estimate ?? formatNum(ciData.point_estimate, 3)}</span>
                              </td>
                              <td className="font-mono text-xs">
                                <span className="text-base-content/60">[{display.ci_lower ?? formatNum(ciData.ci_lower, 3)}, {display.ci_upper ?? formatNum(ciData.ci_upper, 3)}]</span>
                              </td>
                              <td className="font-mono text-xs">
                                <span className={width > Math.abs(ciData.point_estimate ?? 1) * 0.5 ? "text-warning" : "text-success"}>
                                  {formatNum(width, 3)}
                                </span>
                              </td>
                              <td className="font-mono text-[10px] text-base-content/40">{ciData.method || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[10px] text-base-content/30">
                    CIs computed via {ciMetrics[0]?.[1]?.n_resamples ?? 2000} bootstrap resamples. Wide CIs indicate noisy/unreliable estimates.
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Execution Modeling (Phase 7) ────────────────────────────────────── */}
      {(() => {
        const em = result.execution_modeling;
        if (!em) return null;

        const hasAny = em.market_impact?.impact_enabled || em.fill_probability?.fill_probability_enabled || em.financing;
        if (!hasAny) return null;

        return (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon="⚡" title="Execution Modeling" badge="Phase 7" />

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* 7A: Market Impact */}
                {em.market_impact?.impact_enabled && (
                  <>
                    <MetricCard
                      label="Total Impact Cost"
                      value={`$${formatNum(em.market_impact.total_impact_cost_dollars, 2)}`}
                      icon="📉"
                      colorClass="text-warning"
                      subtext="Almgren-Chriss"
                    />
                    <MetricCard
                      label="Avg Impact/Trade"
                      value={`${formatNum(em.market_impact.avg_impact_bps_per_trade, 2)} bps`}
                      icon="📊"
                      colorClass={em.market_impact.avg_impact_bps_per_trade > 5 ? "text-error" : "text-warning"}
                      subtext="Per trade impact"
                    />
                  </>
                )}

                {/* 7B: Fill Probability */}
                {em.fill_probability?.fill_probability_enabled && (
                  <MetricCard
                    label="Avg Fill Probability"
                    value={`${formatNum((em.fill_probability.avg_fill_probability ?? 1) * 100, 1)}%`}
                    icon="🎰"
                    colorClass={em.fill_probability.avg_fill_probability >= 0.95 ? "text-success" : em.fill_probability.avg_fill_probability >= 0.85 ? "text-warning" : "text-error"}
                    subtext="Logit model"
                  />
                )}

                {/* 7C: Financing Costs */}
                {em.financing && (
                  <>
                    <MetricCard
                      label="Total Financing"
                      value={`$${formatNum(em.financing.total_financing_cost, 2)}`}
                      icon="🏦"
                      colorClass="text-warning"
                      subtext="Borrow + margin + div"
                    />
                    <MetricCard
                      label="Borrow Costs"
                      value={`$${formatNum(em.financing.total_borrow_cost, 2)}`}
                      icon="📕"
                      colorClass="text-warning"
                      subtext={`${em.financing.short_trades ?? 0} short trades`}
                    />
                    <MetricCard
                      label="Margin Costs"
                      value={`$${formatNum(em.financing.total_margin_cost, 2)}`}
                      icon="💳"
                      colorClass="text-warning"
                      subtext="Leverage financing"
                    />
                    {em.financing.total_dividend_cost > 0 && (
                      <MetricCard
                        label="Dividend Costs"
                        value={`$${formatNum(em.financing.total_dividend_cost, 2)}`}
                        icon="💸"
                        colorClass="text-warning"
                        subtext="Short dividend payments"
                      />
                    )}
                  </>
                )}
              </div>

              {/* Financing detail table */}
              {em.financing && (em.financing.total_financing_cost > 0) && (
                <div className="mt-3 overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="text-xs">Direction</th>
                        <th className="text-xs">Trades</th>
                        <th className="text-xs">Borrow Cost</th>
                        <th className="text-xs">Margin Cost</th>
                        <th className="text-xs">Dividend Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-mono text-xs font-semibold">Long</td>
                        <td className="font-mono text-xs">{(em.financing.long_trades ?? 0)}</td>
                        <td className="font-mono text-xs text-warning">${formatNum(0, 2)}</td>
                        <td className="font-mono text-xs text-warning">${formatNum(em.financing.total_margin_cost * (em.financing.long_trades / ((em.financing.long_trades || 1) + (em.financing.short_trades || 1))), 2)}</td>
                        <td className="font-mono text-xs">—</td>
                      </tr>
                      <tr>
                        <td className="font-mono text-xs font-semibold">Short</td>
                        <td className="font-mono text-xs">{(em.financing.short_trades ?? 0)}</td>
                        <td className="font-mono text-xs text-warning">${formatNum(em.financing.total_borrow_cost, 2)}</td>
                        <td className="font-mono text-xs text-warning">${formatNum(em.financing.total_margin_cost * (em.financing.short_trades / ((em.financing.long_trades || 1) + (em.financing.short_trades || 1))), 2)}</td>
                        <td className="font-mono text-xs text-warning">${formatNum(em.financing.total_dividend_cost, 2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {em.all_models_enabled && (
                <div className="mt-2">
                  <span className="badge badge-xs badge-success">All execution models active</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Section 9: Trade Log Table ────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📋" title="Trade Log" badge={`${closedTrades.length} trades`} />
          {closedTrades.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-2xl mb-2 block">📭</span>
              <span className="text-base-content/30 text-sm">No trades recorded</span>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">#</th>
                    <th className="text-xs">Dir</th>
                    <th className="text-xs">Entry</th>
                    <th className="text-xs">Exit</th>
                    <th className="text-xs">P&L (br)</th>
                    <th className="text-xs">Cost</th>
                    <th className="text-xs">Pattern</th>
                    <th className="text-xs">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((trade, i) => {
                    const isLong = trade.direction === "LONG" || trade.direction === "BUY";
                    const pnl = trade.pnl_bricks ?? 0;
                    return (
                      <tr key={trade.id || i} className={pnl > 0 ? "" : "opacity-70"}>
                        <td className="font-mono text-xs">{i + 1}</td>
                        <td>
                          <span className={`badge badge-xs ${isLong ? "badge-success" : "badge-error"}`}>
                            {trade.direction || "—"}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          {typeof trade.entry_price === "number" ? `$${trade.entry_price.toFixed(2)}` : "—"}
                        </td>
                        <td className="font-mono text-xs">
                          {typeof trade.exit_price === "number" ? `$${trade.exit_price.toFixed(2)}` : "—"}
                        </td>
                        <td>
                          <span className={`font-mono text-xs ${pnl >= 0 ? "text-success" : "text-error"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-warning">
                          {trade.total_cost ? `$${trade.total_cost.toFixed(2)}` : "—"}
                        </td>
                        <td className="text-xs text-base-content/50">{trade.pattern_type || trade.pattern || "—"}</td>
                        <td className="text-xs text-base-content/50">{exitTypeLabel(trade.close_reason || trade.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 10: Config Used ────────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <SectionHeader icon="⚙️" title="Configuration Used" badge={symbol} />
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
    </div>
  );
}
