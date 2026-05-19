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
 *   4. Trade Distribution (win/loss histogram by P&L bucket)
 *   5. Per-Pattern Breakdown (if available)
 *   6. Trade Log Table
 *   7. Config Used
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

export default function BacktestResults({ result, symbol = "SPY" }) {
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

      {/* ── Section 4: Trade Distribution ─────────────────────────────────── */}
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

      {/* ── Section 5: Per-Pattern Breakdown ──────────────────────────────── */}
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

      {/* ── Section 6: Trade Log Table ────────────────────────────────────── */}
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

      {/* ── Section 7: Config Used ────────────────────────────────────────── */}
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
