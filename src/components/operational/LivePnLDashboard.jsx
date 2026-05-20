"use client";

import { useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import RoleGate from "@/components/shared/RoleGate";

const EQUITY_PERIODS = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1A", label: "1Y" },
  { value: "all", label: "All" },
];

/**
 * LivePnLDashboard — Real-time portfolio P&L with equity curve + auto-refresh.
 *
 * Shows:
 * - Equity curve chart with period selector
 * - Total P&L cards (unrealized, day, by position)
 * - Positions table with P&L attribution
 * - Auto-refresh every 10s with stale indicator
 */
export default function LivePnLDashboard({ compact = false }) {
  const {
    account,
    positions,
    equityCurve,
    equityCurveLoading,
    equityCurvePeriod,
    setEquityCurvePeriod,
    loading,
    error,
    lastUpdated,
    isStale,
    refresh,
    totalUnrealizedPnl,
    totalUnrealizedPnlPc,
    totalMarketValue,
    dayPnl,
    dayPnlPc,
  } = usePortfolioData({ refreshInterval: 10000 });

  const [sortBy, setSortBy] = useState("unrealized_pl");
  const [sortDir, setSortDir] = useState("desc");

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const aVal = parseFloat(a[sortBy]) || 0;
      const bVal = parseFloat(b[sortBy]) || 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [positions, sortBy, sortDir]);

  const handleSort = useCallback((field) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    const sign = num >= 0 ? "+" : "";
    return `${sign}$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (val) => {
    const num = parseFloat(val) || 0;
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toFixed(2)}%`;
  };

  const pnlColor = (val) => {
    const num = parseFloat(val) || 0;
    return num > 0 ? "text-success" : num < 0 ? "text-error" : "text-base-content/50";
  };

  const pnlBadge = (val) => {
    const num = parseFloat(val) || 0;
    return num > 0 ? "badge-success" : num < 0 ? "badge-error" : "badge-ghost";
  };

  // Equity curve chart data — derive P&L from equity
  const chartData = useMemo(() => {
    if (!equityCurve.length) return [];
    return equityCurve;
  }, [equityCurve]);

  // Compute min/max for Y axis domain
  const equityMinMax = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 100 };
    const values = chartData.map((d) => d.equity).filter(Boolean);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.1, 1);
    return { min: Math.floor(min - padding), max: Math.ceil(max + padding) };
  }, [chartData]);

  // Custom tooltip for equity curve
  const EquityTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-base-100 border border-base-300 rounded-lg p-3 shadow-xl text-sm">
        <div className="font-bold text-base-content/80 mb-1">{d.date}</div>
        <div className="flex items-center gap-2">
          <span className="text-base-content/60">Equity:</span>
          <span className="font-mono font-bold">
            ${d.equity?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {d.pnl !== undefined && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-base-content/60">P&L:</span>
            <span className={`font-mono font-bold ${d.pnl >= 0 ? "text-success" : "text-error"}`}>
              {formatCurrency(d.pnl)} ({formatPercent(d.pnlPc)})
            </span>
          </div>
        )}
      </div>
    );
  }, []);

  // Loading state
  if (loading && !account) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Live P&L Dashboard</h2>
          <div className="flex items-center justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        </div>
      </div>
    );
  }

  // No keys configured
  if (!account && !loading && !error) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Live P&L Dashboard</h2>
          <div className="alert alert-info">
            <span>Connect your Alpaca API keys in Admin settings to see live P&L data.</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !account) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Live P&L Dashboard</h2>
          <div className="alert alert-error">
            <span>Failed to load portfolio data: {error}</span>
          </div>
          <button className="btn btn-sm btn-primary mt-2" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const equity = parseFloat(account?.equity) || 0;
  const cash = parseFloat(account?.cash) || 0;
  const buyingPower = parseFloat(account?.buying_power) || 0;
  const longValue = parseFloat(account?.long_market_value) || 0;
  const shortValue = parseFloat(account?.short_market_value) || 0;
  const hasPositions = positions.length > 0;

  // Is the equity curve trending up or down?
  const curveTrend = chartData.length >= 2
    ? chartData[chartData.length - 1].equity - chartData[0].equity
    : 0;
  const curveColor = curveTrend >= 0 ? "#22c55e" : "#ef4444"; // success / error

  return (
    <div className="card shadow-xl border border-base-300 bg-base-100">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">Live P&L Dashboard</h2>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className={`text-xs ${isStale ? "text-warning" : "text-base-content/50"}`}>
                {isStale ? "Stale" : "Updated"}: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn btn-xs btn-ghost"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
            </button>
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {/* Total Equity */}
          <div className="stat bg-base-200 rounded-lg p-3">
            <div className="stat-title text-xs">Portfolio Value</div>
            <div className="stat-value text-xl font-bold">
              ${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-desc text-xs">
              Cash: ${cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Day P&L */}
          <div className="stat bg-base-200 rounded-lg p-3">
            <div className="stat-title text-xs">Day P&L</div>
            <div className={`stat-value text-xl font-bold ${pnlColor(dayPnl)}`}>
              {formatCurrency(dayPnl)}
            </div>
            <div className={`stat-desc text-xs ${pnlColor(dayPnlPc)}`}>
              {formatPercent(dayPnlPc)}
            </div>
          </div>

          {/* Unrealized P&L */}
          <div className="stat bg-base-200 rounded-lg p-3">
            <div className="stat-title text-xs">Unrealized P&L</div>
            <div className={`stat-value text-xl font-bold ${pnlColor(totalUnrealizedPnl)}`}>
              {formatCurrency(totalUnrealizedPnl)}
            </div>
            <div className={`stat-desc text-xs ${pnlColor(totalUnrealizedPnlPc)}`}>
              {formatPercent(totalUnrealizedPnlPc)}
            </div>
          </div>

          {/* Buying Power */}
          <div className="stat bg-base-200 rounded-lg p-3">
            <div className="stat-title text-xs">Buying Power</div>
            <div className="stat-value text-xl font-bold">
              ${buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-desc text-xs">
              {positions.length} position{positions.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Equity Curve Chart */}
        {!compact && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Equity Curve</h3>
              <div className="flex items-center gap-1">
                {EQUITY_PERIODS.map((p) => (
                  <button
                    key={p.value}
                    className={`btn btn-xs ${
                      equityCurvePeriod === p.value ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setEquityCurvePeriod(p.value)}
                    disabled={equityCurveLoading}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {equityCurveLoading && !chartData.length ? (
              <div className="flex items-center justify-center h-48 bg-base-200 rounded-lg">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : chartData.length > 0 ? (
              <div className="bg-base-200 rounded-lg p-2" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={curveColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={curveColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[equityMinMax.min, equityMinMax.max]}
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                    />
                    <Tooltip content={<EquityTooltip />} />
                    {chartData.length > 0 && (
                      <ReferenceLine
                        y={chartData[0].equity}
                        stroke="currentColor"
                        strokeDasharray="3 3"
                        opacity={0.3}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke={curveColor}
                      strokeWidth={2}
                      fill="url(#equityGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: curveColor, stroke: "white", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 bg-base-200 rounded-lg text-base-content/40 text-sm">
                No equity history available for this period
              </div>
            )}
          </div>
        )}

        {/* Account Summary Bar */}
        <div className="flex items-center gap-4 mt-2 text-xs text-base-content/60">
          <span>Long: ${longValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          {shortValue > 0 && (
            <span>Short: ${shortValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          )}
          <span>Positions: {positions.length}</span>
        </div>

        {/* Positions Table */}
        {hasPositions ? (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Positions & P&L Attribution</h3>
              <span className="text-xs text-base-content/50">Click column headers to sort</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="cursor-pointer hover:text-primary" onClick={() => handleSort("symbol")}>
                      Symbol {sortBy === "symbol" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                    </th>
                    <th>Side</th>
                    <th className="cursor-pointer hover:text-primary text-right" onClick={() => handleSort("qty")}>
                      Qty {sortBy === "qty" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                    </th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Current</th>
                    <th className="cursor-pointer hover:text-primary text-right" onClick={() => handleSort("unrealized_pl")}>
                      P&L $ {sortBy === "unrealized_pl" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                    </th>
                    <th className="cursor-pointer hover:text-primary text-right" onClick={() => handleSort("unrealized_plpc")}>
                      P&L % {sortBy === "unrealized_plpc" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                    </th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p) => {
                    const pl = parseFloat(p.unrealized_pl) || 0;
                    const plpc = parseFloat(p.unrealized_plpc) || 0;
                    const isLargeMove = Math.abs(plpc) > 1;
                    return (
                      <tr key={p.symbol} className={isLargeMove ? "font-semibold" : ""}>
                        <td>
                          <span className="font-bold">{p.symbol}</span>
                        </td>
                        <td>
                          <span className={`badge badge-xs ${parseInt(p.qty) > 0 ? "badge-success" : "badge-error"}`}>
                            {parseInt(p.qty) > 0 ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td className="text-right font-mono">{Math.abs(parseInt(p.qty) || 0)}</td>
                        <td className="text-right font-mono">${parseFloat(p.avg_entry_price).toFixed(2)}</td>
                        <td className="text-right font-mono">${parseFloat(p.current_price).toFixed(2)}</td>
                        <td className={`text-right font-mono ${pnlColor(pl)} ${isLargeMove ? "animate-pulse" : ""}`}>
                          {formatCurrency(pl)}
                        </td>
                        <td className="text-right">
                          <span className={`badge badge-sm ${pnlBadge(plpc)}`}>
                            {formatPercent(plpc * 100)}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          ${(parseFloat(p.market_value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-base-300">
                    <td colSpan={5} className="font-bold text-right">Total</td>
                    <td className={`text-right font-mono font-bold ${pnlColor(totalUnrealizedPnl)}`}>
                      {formatCurrency(totalUnrealizedPnl)}
                    </td>
                    <td className="text-right">
                      <span className={`badge badge-sm ${pnlBadge(totalUnrealizedPnlPc)}`}>
                        {formatPercent(totalUnrealizedPnlPc)}
                      </span>
                    </td>
                    <td className="text-right font-mono font-bold">
                      ${totalMarketValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-center py-8 text-base-content/40">
            <p className="text-lg">No open positions</p>
            <p className="text-sm mt-1">P&L data will appear when you have active trades</p>
          </div>
        )}

        {/* P&L Attribution Bar (visual breakdown) */}
        {hasPositions && positions.length > 1 && (
          <div className="mt-4">
            <h3 className="font-bold text-sm mb-2">P&L Attribution</h3>
            <div className="flex rounded-lg overflow-hidden h-8">
              {sortedPositions.map((p) => {
                const pl = parseFloat(p.unrealized_pl) || 0;
                const absPl = Math.abs(pl);
                const totalAbs = sortedPositions.reduce(
                  (s, pos) => s + Math.abs(parseFloat(pos.unrealized_pl) || 0), 0
                );
                const widthPct = totalAbs > 0 ? (absPl / totalAbs) * 100 : 0;
                return (
                  <div
                    key={p.symbol}
                    className={`flex items-center justify-center text-xs font-bold ${
                      pl >= 0 ? "bg-success/60 text-success-content" : "bg-error/60 text-error-content"
                    }`}
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                    title={`${p.symbol}: ${formatCurrency(pl)} (${formatPercent((parseFloat(p.unrealized_plpc) || 0) * 100)})`}
                  >
                    {widthPct > 8 && p.symbol}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {sortedPositions.slice(0, 8).map((p) => {
                const pl = parseFloat(p.unrealized_pl) || 0;
                return (
                  <span key={p.symbol} className="text-xs flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${pl >= 0 ? "bg-success" : "bg-error"}`} />
                    {p.symbol}: <span className={pnlColor(pl)}>{formatCurrency(pl)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
