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
  Legend,
} from "recharts";

/**
 * BacktestComparison — Side-by-side comparison of multiple Renko backtest configs.
 *
 * Sections:
 *   1. Comparison Metric Cards (one per config)
 *   2. Overlay Equity Curves
 *   3. Delta Metrics Table (first vs best by Sharpe)
 *   4. Per-Config Trade Summaries
 */

// ── Color palette for configs ─────────────────────────────────────────────

const CONFIG_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
];

// ── Helpers ───────────────────────────────────────────────────────────────

function calcEquityCurve(trades) {
  let cumulative = 0;
  return trades.map((t, i) => {
    cumulative += t.pnl_bricks || 0;
    return { trade: i + 1, pnl: cumulative };
  });
}

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

// ── Overlay Tooltip ───────────────────────────────────────────────────────

function OverlayTooltip({ active, payload, label: tooltipLabel, configs }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <div className="text-base-content/50 mb-1">Trade #{tooltipLabel}</div>
      {payload.map((entry, i) => (
        <div key={i} className="font-mono flex items-center gap-2" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value} br
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function BacktestComparison({ result, symbol = "SPY" }) {
  const { comparisons = [], diff = {} } = result;

  // Build equity curves per config
  const overlayData = useMemo(() => {
    if (!comparisons.length) return [];

    const curves = comparisons.map((cmp) => {
      const trades = cmp.trades || [];
      const closedTrades = trades.filter((t) => t.status === "closed" || !t.status);
      return calcEquityCurve(closedTrades);
    });

    const maxLen = Math.max(...curves.map((c) => c.length), 0);

    // Align all curves to the same trade index
    const data = [];
    for (let i = 0; i < maxLen; i++) {
      const point = { trade: i + 1 };
      curves.forEach((curve, j) => {
        const label = comparisons[j]?.config_used?.label || `Config ${String.fromCharCode(65 + j)}`;
        point[label] = curve[i]?.pnl ?? null;
      });
      data.push(point);
    }
    return data;
  }, [comparisons]);

  // Extract line keys for overlay chart
  const lineKeys = useMemo(
    () => comparisons.map((cmp, i) => cmp.config_used?.label || `Config ${String.fromCharCode(65 + i)}`),
    [comparisons]
  );

  // Diff metrics display
  const diffKeys = Object.keys(diff);

  return (
    <div className="space-y-4">
      {/* ── Section 1: Per-Config Summary Cards ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {comparisons.map((cmp, i) => {
          const label = cmp.config_used?.label || `Config ${String.fromCharCode(65 + i)}`;
          const color = CONFIG_COLORS[i % CONFIG_COLORS.length];
          const stats = cmp.stats?.journal || cmp.stats || {};
          const closedTrades = (cmp.trades || []).filter((t) => t.status === "closed" || !t.status);

          return (
            <div key={i} className="card bg-base-200 shadow-lg border-l-4" style={{ borderLeftColor: color }}>
              <div className="card-body p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm">{label}</span>
                  <span className="badge badge-xs badge-ghost ml-auto">{cmp.symbol || symbol}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">Trades</div>
                    <div className="font-mono font-bold text-sm">{stats.total_trades ?? closedTrades.length}</div>
                  </div>
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">Win Rate</div>
                    <div className={`font-mono font-bold text-sm ${(stats.win_rate ?? 0) >= 0.5 ? "text-success" : "text-error"}`}>
                      {formatNum((stats.win_rate ?? 0) * 100, 1)}%
                    </div>
                  </div>
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">Sharpe</div>
                    <div className={`font-mono font-bold text-sm ${(stats.sharpe_estimate ?? 0) >= 1 ? "text-success" : "text-warning"}`}>
                      {formatNum(stats.sharpe_estimate ?? 0)}
                    </div>
                  </div>
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">P&L (br)</div>
                    <div className={`font-mono font-bold text-sm ${(stats.total_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}`}>
                      {formatNum(stats.total_pnl_bricks ?? 0, 1)}
                    </div>
                  </div>
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">Profit Factor</div>
                    <div className={`font-mono font-bold text-sm ${(stats.profit_factor ?? 0) >= 1 ? "text-success" : "text-error"}`}>
                      {formatNum(stats.profit_factor ?? 0)}
                    </div>
                  </div>
                  <div className="bg-base-300/30 rounded p-2">
                    <div className="text-[9px] text-base-content/30 uppercase">Max DD (br)</div>
                    <div className="font-mono font-bold text-sm text-error">
                      {formatNum(stats.max_drawdown_bricks ?? 0, 1)}
                    </div>
                  </div>
                </div>

                {/* Config highlights */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="badge badge-xs badge-outline">SL: {cmp.config_used?.sl_bricks ?? "—"}</span>
                  <span className="badge badge-xs badge-outline">TP: {cmp.config_used?.tp_bricks ?? "—"}</span>
                  <span className="badge badge-xs badge-outline">Brick: {cmp.config_used?.brick_size ?? "—"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section 2: Overlay Equity Curves ─────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📈" title="Equity Curve Comparison" badge={`${comparisons.length} configs`} />
          {overlayData.length < 2 ? (
            <div className="text-center py-8">
              <span className="text-base-content/30 text-sm">Not enough trade data to render overlay</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={overlayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="trade" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} label={{ value: "Trade #", position: "insideBottomRight", offset: -5, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} label={{ value: "P&L (bricks)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <Tooltip content={<OverlayTooltip configs={comparisons} />} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="5 5" />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
                {lineKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={CONFIG_COLORS[i % CONFIG_COLORS.length]}
                    strokeWidth={2}
                    dot={overlayData.length < 40}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Section 3: Delta Metrics Table ───────────────────────────────── */}
      {diffKeys.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="📊" title="Delta: First Config vs Best (by Sharpe)" badge="Comparison" />
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Metric</th>
                    <th className="text-xs">First Config</th>
                    <th className="text-xs">Best Config</th>
                    <th className="text-xs">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {diffKeys.map((key) => {
                    const d = diff[key];
                    const delta = d.delta ?? 0;
                    const isPositive = delta > 0;
                    const isNegative = delta < 0;
                    return (
                      <tr key={key}>
                        <td className="font-mono text-xs font-semibold">{key}</td>
                        <td className="font-mono text-xs">
                          {typeof d.first === "number" ? formatNum(d.first) : String(d.first ?? "—")}
                        </td>
                        <td className="font-mono text-xs">
                          {typeof d.best === "number" ? formatNum(d.best) : String(d.best ?? "—")}
                        </td>
                        <td>
                          <span className={`font-mono text-xs font-bold ${isPositive ? "text-success" : isNegative ? "text-error" : ""}`}>
                            {isPositive ? "+" : ""}{typeof delta === "number" ? formatNum(delta) : String(delta ?? "—")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {diffKeys.map((key) => {
                const d = diff[key];
                const delta = d.delta ?? 0;
                const isPositive = delta > 0;
                const isNegative = delta < 0;
                return (
                  <div key={key} className="card bg-base-300/50 p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono font-bold text-sm">{key}</span>
                      <span className={`font-mono text-sm font-bold ${isPositive ? "text-success" : isNegative ? "text-error" : ""}`}>
                        {isPositive ? "+" : ""}{typeof delta === "number" ? formatNum(delta) : String(delta ?? "—")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-base-content/50">First:</span> <span className="font-mono">{typeof d.first === "number" ? formatNum(d.first) : String(d.first ?? "—")}</span></div>
                      <div><span className="text-base-content/50">Best:</span> <span className="font-mono">{typeof d.best === "number" ? formatNum(d.best) : String(d.best ?? "—")}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 4: Per-Config Key Config Diff ────────────────────────── */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <SectionHeader icon="⚙️" title="Config Differences" badge="Side-by-side" />
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className="text-xs">Parameter</th>
                  {comparisons.map((cmp, i) => (
                    <th key={i} className="text-xs" style={{ color: CONFIG_COLORS[i % CONFIG_COLORS.length] }}>
                      {cmp.config_used?.label || `Config ${String.fromCharCode(65 + i)}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["brick_size", "sl_bricks", "tp_bricks", "trailing_stop", "trail_after_bricks", "trail_distance_bricks", "regime_gate", "max_trades_per_session", "bull_trigger_n", "bear_trigger_n"].map((param) => {
                  const values = comparisons.map((cmp) => cmp.config_used?.[param]);
                  const allSame = values.every((v) => v === values[0]);
                  return (
                    <tr key={param} className={allSame ? "opacity-40" : ""}>
                      <td className="font-mono text-xs font-semibold">{param}</td>
                      {values.map((val, i) => (
                        <td key={i} className="font-mono text-xs">
                          {typeof val === "boolean" ? (val ? "✓" : "✗") : String(val ?? "—")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-2">
            {["brick_size", "sl_bricks", "tp_bricks", "trailing_stop", "trail_after_bricks", "trail_distance_bricks", "regime_gate", "max_trades_per_session", "bull_trigger_n", "bear_trigger_n"].map((param) => {
              const values = comparisons.map((cmp) => cmp.config_used?.[param]);
              const allSame = values.every((v) => v === values[0]);
              return (
                <div key={param} className={`card bg-base-300/50 p-3 ${allSame ? "opacity-40" : ""}`}>
                  <div className="font-mono font-bold text-sm mb-2">{param}</div>
                  <div className="space-y-1">
                    {comparisons.map((cmp, i) => {
                      const val = cmp.config_used?.[param];
                      const label = cmp.config_used?.label || `Config ${String.fromCharCode(65 + i)}`;
                      return (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONFIG_COLORS[i % CONFIG_COLORS.length] }} />
                            <span className="text-base-content/50">{label}</span>
                          </span>
                          <span className="font-mono">{typeof val === "boolean" ? (val ? "✓" : "✗") : String(val ?? "—")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-base-content/30 mt-1">
            Greyed rows = same value across all configs
          </div>
        </div>
      </div>
    </div>
  );
}
