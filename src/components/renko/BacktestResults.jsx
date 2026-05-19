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
 *   2. Equity Curve — cumulative P&L over trades
 *   3. Drawdown Underwater Plot
 *   4. Monthly Returns Heatmap — calendar-style grid
 *   5. Trade Distribution (win/loss histogram by P&L bucket)
 *   6. Per-Pattern Breakdown (if available)
 *   7. Trade Log Table
 *   8. Config Used
 */

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

export default function BacktestResults({ result, symbol = "SPY", streaming = false }) {
  const { stats = {}, trades = [], total_ticks = 0, total_bricks = 0, config_used = {} } = result;

  const closedTrades = useMemo(
    () => (Array.isArray(trades) ? trades.filter((t) => t.status === "closed" || !t.status) : []),
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
    };
  }, [closedTrades, stats]);

  const hasTrades = closedTrades.length > 0;

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

      {/* Extra metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total P&L" value={`${metrics.totalPnlBricks >= 0 ? "+" : ""}${formatNum(metrics.totalPnlBricks, 1)} br`} icon="💰" colorClass={metrics.totalPnlBricks >= 0 ? "text-success" : "text-error"} />
        <MetricCard label="Avg P&L/Trade" value={`${formatNum(metrics.avgPnlBricks, 2)} br`} icon="📊" colorClass={metrics.avgPnlBricks >= 0 ? "text-success" : "text-error"} />
        <MetricCard label="Avg Win" value={`+${formatNum(metrics.avgWinBricks, 2)} br`} icon="✅" colorClass="text-success" />
        <MetricCard label="Avg Loss" value={`${formatNum(metrics.avgLossBricks, 2)} br`} icon="❌" colorClass="text-error" />
      </div>

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
                          <td className="font-mono text-xs">{exitType.replace("closed_", "")}</td>
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

      {/* ── Section 8: Trade Log Table ────────────────────────────────────── */}
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
                        <td className="text-xs text-base-content/50">{trade.close_reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 8: Config Used ────────────────────────────────────────── */}
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
