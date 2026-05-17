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
 * RiskDashboard — Visual risk management for the Renko HFT pipeline.
 *
 * Displays:
 *   1. Risk Overview Cards (max drawdown, win rate, Sharpe, Kelly fraction)
 *   2. Equity Curve (bricks P&L over time)
 *   3. Drawdown Chart (underwater plot)
 *   4. Trade Distribution (win/loss histogram by size)
 *   5. Risk Governance Status (7-layer filter status indicators)
 *   6. Position Sizing Visualization
 */

// ── Risk Calculation Functions ──────────────────────────────────────────────

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

function calcMaxDrawdown(drawdowns) {
  return Math.max(...drawdowns.map((d) => d.drawdown), 0);
}

function calcWinRate(trades) {
  if (!trades.length) return 0;
  const wins = trades.filter((t) => (t.pnl_bricks || 0) > 0).length;
  return (wins / trades.length) * 100;
}

function calcProfitFactor(trades) {
  const grossWin = trades
    .filter((t) => t.pnl_bricks > 0)
    .reduce((s, t) => s + t.pnl_bricks, 0);
  const grossLoss = Math.abs(
    trades
      .filter((t) => t.pnl_bricks < 0)
      .reduce((s, t) => s + t.pnl_bricks, 0)
  );
  return grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
}

function calcAvgWinLoss(trades) {
  const wins = trades.filter((t) => (t.pnl_bricks || 0) > 0);
  const losses = trades.filter((t) => (t.pnl_bricks || 0) < 0);
  const avgWin = wins.length
    ? wins.reduce((s, t) => s + t.pnl_bricks, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((s, t) => s + t.pnl_bricks, 0) / losses.length
    : 0;
  return { avgWin, avgLoss, ratio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0 };
}

function calcKelly(winRate, avgWin, avgLoss) {
  const p = winRate / 100;
  const q = 1 - p;
  const b = avgWin / Math.abs(avgLoss || 1);
  return Math.max(0, ((p * b - q) / b) * 100);
}

function calcCurrentStreak(trades) {
  if (!trades.length) return { type: "none", count: 0 };
  const lastPnl = trades[trades.length - 1].pnl_bricks || 0;
  const isWin = lastPnl > 0;
  let count = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    const pnl = trades[i].pnl_bricks || 0;
    if (isWin ? pnl > 0 : pnl <= 0) {
      count++;
    } else {
      break;
    }
  }
  return { type: isWin ? "win" : "loss", count };
}

function calcTradeDistribution(trades) {
  const buckets = {};
  for (let i = -6; i <= 6; i++) {
    const label =
      i === 6 ? "6+" : i === -6 ? "≤-6" : `${i} to ${i + 1}`;
    buckets[i] = { label, wins: 0, losses: 0 };
  }
  trades.forEach((t) => {
    const pnl = t.pnl_bricks || 0;
    const bucket = Math.max(-6, Math.min(5, Math.floor(pnl)));
    if (pnl >= 0) buckets[bucket].wins++;
    else buckets[bucket].losses++;
  });
  return Object.values(buckets);
}

// ── Section Header ──────────────────────────────────────────────────────────

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

// ── Metric Card (reuses pattern from RenkoPage) ─────────────────────────────

function RiskMetricCard({ label, value, subtext, icon, colorClass = "" }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            {label}
          </span>
          {icon && <span className="text-base-content/20 text-xs">{icon}</span>}
        </div>
        <div className={`text-xl font-bold font-mono ${colorClass}`}>
          {value}
        </div>
        {subtext && (
          <div className="text-[10px] text-base-content/30 mt-0.5">
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom Tooltip for Recharts ─────────────────────────────────────────────

function CustomTooltip({ active, payload, label: tooltipLabel, suffix = "" }) {
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

function BarTooltip({ active, payload, label: tooltipLabel }) {
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

// ── Main Component ──────────────────────────────────────────────────────────

export default function RiskDashboard({
  trades = [],
  stats = null,
  state = null,
  config = {},
  bricks = [],
}) {
  // Use only closed trades for risk calculations
  const closedTrades = useMemo(
    () => trades.filter((t) => t.status === "closed" || !t.status),
    [trades]
  );

  // Compute all risk metrics
  const metrics = useMemo(() => {
    const equityCurve = calcEquityCurve(closedTrades);
    const drawdownData = calcDrawdown(equityCurve);
    const maxDD = calcMaxDrawdown(drawdownData);
    const winRate = calcWinRate(closedTrades);
    const profitFactor = calcProfitFactor(closedTrades);
    const { avgWin, avgLoss, ratio } = calcAvgWinLoss(closedTrades);
    const kelly = calcKelly(winRate, avgWin, avgLoss);
    const streak = calcCurrentStreak(closedTrades);
    const distribution = calcTradeDistribution(closedTrades);

    return {
      equityCurve,
      drawdownData,
      maxDD,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      winLossRatio: ratio,
      kelly,
      streak,
      distribution,
      totalTrades: closedTrades.length,
    };
  }, [closedTrades]);

  // Risk governance config extraction
  const riskConfig = config?.risk_management || config?.risk || {};
  const signalFilterConfig = config?.signal_filter || {};

  const hasTrades = closedTrades.length > 0;

  // ── Empty State ─────────────────────────────────────────────────────────
  if (!hasTrades) {
    return (
      <div className="space-y-4">
        {/* Section 1: Risk Overview Cards — show zeros/defaults */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <RiskMetricCard label="Max Drawdown" value="0 br" icon="📉" colorClass="text-error" />
          <RiskMetricCard label="Win Rate" value="0%" icon="🎯" />
          <RiskMetricCard label="Profit Factor" value="—" icon="⚖️" />
          <RiskMetricCard label="Avg W/L Ratio" value="—" icon="📊" />
          <RiskMetricCard label="Kelly Fraction" value="0%" icon="🎲" />
          <RiskMetricCard label="Current Streak" value="—" icon="🔥" />
        </div>

        {/* Empty chart placeholders */}
        {[
          { icon: "📈", title: "Equity Curve", badge: "No trades yet" },
          { icon: "🌊", title: "Drawdown Chart", badge: "No trades yet" },
          { icon: "📊", title: "Trade Distribution", badge: "No trades yet" },
        ].map((section) => (
          <div key={section.title} className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon={section.icon} title={section.title} badge={section.badge} />
              <div className="text-center py-8">
                <span className="text-2xl mb-2 block">📋</span>
                <span className="text-base-content/30 text-sm">
                  Need at least 1 closed trade to render chart
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Risk Governance — always visible */}
        <RiskGovernance state={state} config={config} />
        <PositionSizing state={state} config={config} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Section 1: Risk Overview Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <RiskMetricCard
          label="Max Drawdown"
          value={`${metrics.maxDD} br`}
          icon="📉"
          colorClass="text-error"
          subtext="Peak-to-trough"
        />
        <RiskMetricCard
          label="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          icon="🎯"
          colorClass={metrics.winRate >= 50 ? "text-success" : "text-error"}
          subtext={`${closedTrades.filter((t) => (t.pnl_bricks || 0) > 0).length} wins / ${closedTrades.length} total`}
        />
        <RiskMetricCard
          label="Profit Factor"
          value={
            metrics.profitFactor === Infinity
              ? "∞"
              : metrics.profitFactor.toFixed(2)
          }
          icon="⚖️"
          colorClass={metrics.profitFactor >= 1 ? "text-success" : "text-error"}
          subtext="Gross wins / losses"
        />
        <RiskMetricCard
          label="Avg W/L Ratio"
          value={
            metrics.winLossRatio === 0
              ? "—"
              : `${metrics.winLossRatio.toFixed(2)}:1`
          }
          icon="📊"
          colorClass={metrics.winLossRatio >= 1 ? "text-success" : "text-error"}
          subtext={`Avg win ${metrics.avgWin.toFixed(1)} | Avg loss ${metrics.avgLoss.toFixed(1)}`}
        />
        <RiskMetricCard
          label="Kelly Fraction"
          value={`${metrics.kelly.toFixed(1)}%`}
          icon="🎲"
          colorClass={metrics.kelly > 0 ? "text-success" : "text-base-content/50"}
          subtext="Optimal bet size"
        />
        <RiskMetricCard
          label="Current Streak"
          value={
            metrics.streak.type === "none"
              ? "—"
              : `${metrics.streak.count}${metrics.streak.type === "win" ? "W" : "L"}`
          }
          icon="🔥"
          colorClass={
            metrics.streak.type === "win"
              ? "text-success"
              : metrics.streak.type === "loss"
                ? "text-error"
                : ""
          }
          subtext={
            metrics.streak.type === "win"
              ? "Winning streak"
              : metrics.streak.type === "loss"
                ? "Losing streak"
                : "No streak"
          }
        />
      </div>

      {/* ── Section 2: Equity Curve ──────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader
            icon="📈"
            title="Equity Curve"
            badge={`${metrics.totalTrades} trades`}
          />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metrics.equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis
                dataKey="trade"
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                opacity={0.3}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                opacity={0.3}
              />
              <Tooltip content={<CustomTooltip suffix=" br" />} />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="5 5" />
              <Line
                type="monotone"
                dataKey="pnl"
                name="Cumulative P&L"
                stroke={metrics.equityCurve[metrics.equityCurve.length - 1]?.pnl >= 0 ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                dot={metrics.equityCurve.length < 30}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 3: Drawdown Chart ────────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader
            icon="🌊"
            title="Drawdown Chart"
            badge={`Max: ${metrics.maxDD} bricks`}
          />
          {metrics.drawdownData.every((d) => d.drawdown === 0) ? (
            <div className="text-center py-6">
              <span className="text-success text-sm">✓ No drawdown — equity at all-time high</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={metrics.drawdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis
                  dataKey="trade"
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                  reversed
                />
                <Tooltip content={<CustomTooltip suffix=" br" />} />
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

      {/* ── Section 4: Trade Distribution ────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader
            icon="📊"
            title="Trade Distribution"
            badge="Win/Loss by P&L bucket"
          />
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metrics.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                stroke="currentColor"
                opacity={0.3}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                opacity={0.3}
                allowDecimals={false}
              />
              <Tooltip content={<BarTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar dataKey="wins" name="Wins" fill="#22c55e" radius={[2, 2, 0, 0]} />
              <Bar dataKey="losses" name="Losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 5: Risk Governance Status ────────────────────────────── */}
      <RiskGovernance state={state} config={config} />

      {/* ── Section 6: Position Sizing ───────────────────────────────────── */}
      <PositionSizing state={state} config={config} />
    </div>
  );
}

// ── Risk Governance Sub-component ──────────────────────────────────────────

function RiskGovernance({ state, config }) {
  const riskConfig = config?.risk_management || config?.risk || {};
  const signalFilterConfig = config?.signal_filter || {};

  // Extract governance parameters
  const sessionWindowMax = riskConfig.max_session_trades || signalFilterConfig.max_session_trades || 20;
  const sessionTrades = state?.session_trades || 0;
  const sessionPnl = state?.session_pnl_bricks || 0;
  const maxDailyLoss = riskConfig.max_daily_loss_bricks || signalFilterConfig.max_daily_loss_bricks || 10;
  const maxConsecutiveLosses = riskConfig.max_consecutive_losses || signalFilterConfig.max_consecutive_losses || 4;
  const cooldownSeconds = riskConfig.cooldown_seconds || signalFilterConfig.cooldown_seconds || 300;
  const velocityLimit = riskConfig.max_velocity || signalFilterConfig.max_velocity || 6;
  const minConfidence = signalFilterConfig.min_confidence || 0.6;
  const hmmRegime = state?.hmm_regime || state?.regime || null;
  const consecutiveLosses = state?.consecutive_losses || 0;
  const velocity = state?.velocity || state?.trades_per_hour || 0;
  const cooldownRemaining = state?.cooldown_remaining || 0;
  const lastConfidence = state?.last_signal_confidence || 0;

  // Determine pass/blocked status
  const governanceLayers = [
    {
      name: "Session Window",
      detail: `${sessionTrades} / ${sessionWindowMax} trades`,
      status: sessionTrades < sessionWindowMax ? "PASS" : "BLOCKED",
      progress: Math.min((sessionTrades / sessionWindowMax) * 100, 100),
    },
    {
      name: "Max Daily Loss",
      detail: `${sessionPnl} / -${maxDailyLoss} br`,
      status: sessionPnl > -maxDailyLoss ? "PASS" : "BLOCKED",
      progress: sessionPnl < 0 ? Math.min((Math.abs(sessionPnl) / maxDailyLoss) * 100, 100) : 0,
    },
    {
      name: "Consecutive Losses",
      detail: `${consecutiveLosses} / ${maxConsecutiveLosses} max`,
      status: consecutiveLosses < maxConsecutiveLosses ? "PASS" : "BLOCKED",
      progress: Math.min((consecutiveLosses / maxConsecutiveLosses) * 100, 100),
    },
    {
      name: "Cooldown",
      detail: cooldownRemaining > 0 ? `${cooldownRemaining}s remaining` : "Clear",
      status: cooldownRemaining <= 0 ? "PASS" : "BLOCKED",
      progress: cooldownRemaining > 0 ? Math.min((cooldownRemaining / cooldownSeconds) * 100, 100) : 0,
    },
    {
      name: "Velocity",
      detail: `${velocity.toFixed(1)} / ${velocityLimit} trades/hr`,
      status: velocity < velocityLimit ? "PASS" : "BLOCKED",
      progress: Math.min((velocity / velocityLimit) * 100, 100),
    },
    {
      name: "HMM Regime Gate",
      detail: hmmRegime
        ? `${hmmRegime}${hmmRegime === "trending" || hmmRegime === "trend" ? " — Trading OK" : " — Restricted"}`
        : "No regime data",
      status: hmmRegime
        ? hmmRegime === "trending" || hmmRegime === "trend"
          ? "PASS"
          : "BLOCKED"
        : "PASS",
      progress: hmmRegime === "trending" || hmmRegime === "trend" ? 25 : 75,
    },
    {
      name: "Signal Confidence",
      detail: `${(lastConfidence * 100).toFixed(0)}% / ${(minConfidence * 100).toFixed(0)}% min`,
      status: lastConfidence >= minConfidence || lastConfidence === 0 ? "PASS" : "BLOCKED",
      progress: minConfidence > 0 ? Math.min((lastConfidence / minConfidence) * 100, 100) : 100,
    },
  ];

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <SectionHeader icon="🛡️" title="Risk Governance Status" badge="7-Layer Filter" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {governanceLayers.map((layer) => (
            <div
              key={layer.name}
              className="bg-base-300/30 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/70">
                  {layer.name}
                </span>
                <span
                  className={`badge badge-xs ${
                    layer.status === "PASS" ? "badge-success" : "badge-error"
                  }`}
                >
                  {layer.status}
                </span>
              </div>
              <div className="text-[11px] text-base-content/50 font-mono">
                {layer.detail}
              </div>
              {/* Progress bar */}
              <progress
                className={`progress w-full ${
                  layer.status === "PASS" ? "progress-success" : "progress-error"
                }`}
                value={layer.progress}
                max="100"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Position Sizing Sub-component ──────────────────────────────────────────

function PositionSizing({ state, config }) {
  const position = state?.active_position;
  const riskConfig = config?.risk_management || config?.risk || {};

  // No active position
  if (!position) {
    return (
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📐" title="Position Sizing" />
          <div className="bg-base-300/30 rounded-lg p-6 text-center">
            <span className="text-2xl mb-2 block">📭</span>
            <span className="text-base-content/40 text-sm font-medium">
              No Active Position
            </span>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-base-200/50 rounded-lg p-2">
                <div className="text-base-content/30 uppercase text-[9px] mb-1">
                  Default SL
                </div>
                <div className="font-mono font-bold">
                  {riskConfig.default_sl_bricks || 3} bricks
                </div>
              </div>
              <div className="bg-base-200/50 rounded-lg p-2">
                <div className="text-base-content/30 uppercase text-[9px] mb-1">
                  Default TP
                </div>
                <div className="font-mono font-bold">
                  {riskConfig.default_tp_bricks || 5} bricks
                </div>
              </div>
              <div className="bg-base-200/50 rounded-lg p-2">
                <div className="text-base-content/30 uppercase text-[9px] mb-1">
                  Trailing Stop
                </div>
                <div className="font-mono font-bold">
                  {riskConfig.trailing_stop_bricks || 2} bricks
                </div>
              </div>
              <div className="bg-base-200/50 rounded-lg p-2">
                <div className="text-base-content/30 uppercase text-[9px] mb-1">
                  Max Position
                </div>
                <div className="font-mono font-bold">
                  {riskConfig.max_position_size || 100} shares
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active position
  const direction = position.direction || "LONG";
  const isLong = direction === "LONG" || direction === "BUY";
  const entryPrice = position.entry_price || 0;
  const slPrice = position.stop_loss || position.sl_price || 0;
  const tpPrice = position.take_profit || position.tp_price || 0;
  const size = position.size || position.shares || 0;

  // Calculate risk/reward
  const riskPerShare = isLong
    ? Math.abs(entryPrice - slPrice)
    : Math.abs(slPrice - entryPrice);
  const rewardPerShare = isLong
    ? Math.abs(tpPrice - entryPrice)
    : Math.abs(entryPrice - tpPrice);
  const rrRatio = riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(2) : "—";

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <SectionHeader icon="📐" title="Position Sizing" badge={direction} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Position details */}
          <div className="bg-base-300/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-base-content/40">
                Direction
              </span>
              <span
                className={`badge badge-sm ${
                  isLong ? "badge-success" : "badge-error"
                }`}
              >
                {direction}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-base-content/30 uppercase">
                  Entry Price
                </div>
                <div className="font-mono font-bold text-sm">
                  {entryPrice ? `$${entryPrice.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-base-content/30 uppercase">
                  Position Size
                </div>
                <div className="font-mono font-bold text-sm">
                  {size || "—"} shares
                </div>
              </div>
              <div>
                <div className="text-[10px] text-base-content/30 uppercase">
                  Stop Loss
                </div>
                <div className="font-mono font-bold text-sm text-error">
                  {slPrice ? `$${slPrice.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-base-content/30 uppercase">
                  Take Profit
                </div>
                <div className="font-mono font-bold text-sm text-success">
                  {tpPrice ? `$${tpPrice.toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Risk/Reward visual */}
          <div className="bg-base-300/30 rounded-lg p-4">
            <div className="text-[10px] text-base-content/30 uppercase mb-3">
              Risk / Reward
            </div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="text-center">
                <div className="text-error font-mono text-lg font-bold">
                  {riskPerShare > 0 ? `$${riskPerShare.toFixed(2)}` : "—"}
                </div>
                <div className="text-[9px] text-base-content/30">RISK</div>
              </div>
              <div className="text-base-content/20 text-2xl">→</div>
              <div className="text-center">
                <div className="text-success font-mono text-lg font-bold">
                  {rewardPerShare > 0 ? `$${rewardPerShare.toFixed(2)}` : "—"}
                </div>
                <div className="text-[9px] text-base-content/30">REWARD</div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-base-content/50 text-xs mb-1">
                R:R Ratio
              </div>
              <div
                className={`font-mono font-bold text-2xl ${
                  rrRatio !== "—" && parseFloat(rrRatio) >= 2
                    ? "text-success"
                    : rrRatio !== "—" && parseFloat(rrRatio) >= 1
                      ? "text-warning"
                      : "text-error"
                }`}
              >
                {rrRatio !== "—" ? `${rrRatio}:1` : "—"}
              </div>
            </div>
            {/* Visual bar */}
            {riskPerShare > 0 && rewardPerShare > 0 && (
              <div className="mt-3">
                <div className="flex h-3 rounded-full overflow-hidden bg-base-200">
                  <div
                    className="bg-error rounded-l-full"
                    style={{
                      width: `${(riskPerShare / (riskPerShare + rewardPerShare)) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-success rounded-r-full"
                    style={{
                      width: `${(rewardPerShare / (riskPerShare + rewardPerShare)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-base-content/30 font-mono">
                  <span>Risk</span>
                  <span>Reward</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
