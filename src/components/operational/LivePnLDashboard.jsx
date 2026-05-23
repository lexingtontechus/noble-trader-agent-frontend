"use client";

import { useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { usePortfolio } from "@/context/PortfolioContext";
import InfoTip from "@/components/shared/InfoTip";

const EQUITY_PERIODS = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1A", label: "1Y" },
  { value: "all", label: "All" },
];

const INTRADAY_TIMEFRAMES = [
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1h" },
  { value: "1Day", label: "1D" },
];

const INTRADAY_PERIODS = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
];

const CHART_MODES = [
  { value: "daily", label: "Daily" },
  { value: "intraday", label: "Intraday" },
];

/**
 * LivePnLDashboard — Real-time portfolio P&L with equity curve + auto-refresh.
 *
 * Phase 5 additions:
 * - Intraday equity curve toggle (5m/15m/1h timeframes)
 * - Risk metrics cards (Sharpe, Sortino, Max DD, VaR)
 * - CSV export button
 * - P&L alert thresholds panel
 * - Active alerts toast bar
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
    recentTrades,
    realizedPnl,
    realizedPnlBySymbol,
    tradesLoading,
    refreshTrades,
    // Phase 5
    intradayCurve,
    intradayLoading,
    intradayTimeframe,
    setIntradayTimeframe,
    intradayPeriod,
    setIntradayPeriod,
    riskMetrics,
    riskMetricsLoading,
    riskMetricsPeriod,
    setRiskMetricsPeriod,
    refreshRiskMetrics,
    alertThresholds,
    activeAlerts,
    createAlertThreshold,
    deleteAlertThreshold,
    dismissAlert,
    exportPnlCsv,
  } = usePortfolio();

  const [sortBy, setSortBy] = useState("unrealized_pl");
  const [sortDir, setSortDir] = useState("desc");
  const [chartMode, setChartMode] = useState("daily"); // "daily" | "intraday"
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [showRiskMetrics, setShowRiskMetrics] = useState(false);

  // Alert creation form state
  const [newAlert, setNewAlert] = useState({
    metric: "drawdown_pct",
    operator: "lte",
    value: -5,
    severity: "warning",
  });

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

  // Equity curve chart data
  const chartData = useMemo(() => {
    if (chartMode === "intraday" && intradayCurve.length) return intradayCurve;
    if (!equityCurve.length) return [];
    return equityCurve;
  }, [chartMode, equityCurve, intradayCurve]);

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
              {formatCurrency(d.pnl)} ({formatPercent(d.pnlPc || 0)})
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
          <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary mt-2" onClick={refresh}>
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
  const curveColor = curveTrend >= 0 ? "#22c55e" : "#ef4444";

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
            {/* Phase 5: CSV Export */}
            <button
              className="btn btn-sm sm:btn-xs btn-outline min-h-[44px] sm:min-h-0"
              onClick={() => exportPnlCsv("1M", "all")}
              title="Export P&L data as CSV"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Export
            </button>
            {/* Phase 5: Risk Metrics toggle */}
            <button
              className={`btn btn-sm sm:btn-xs min-h-[44px] sm:min-h-0 ${showRiskMetrics ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowRiskMetrics(!showRiskMetrics)}
            >
              Risk
            </button>
            {/* Phase 5: Alerts toggle */}
            <button
              className={`btn btn-sm sm:btn-xs min-h-[44px] sm:min-h-0 ${showAlertConfig ? "btn-warning" : "btn-ghost"}`}
              onClick={() => setShowAlertConfig(!showAlertConfig)}
            >
              Alerts {activeAlerts.length > 0 && <span className="badge badge-xs badge-error ml-1">{activeAlerts.length}</span>}
            </button>
            <button
              className="btn btn-sm sm:btn-xs btn-ghost min-h-[44px] sm:min-h-0"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
            </button>
          </div>
        </div>

        {/* Phase 5: Active Alerts Bar */}
        {activeAlerts.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {activeAlerts.slice(0, 3).map((alert, idx) => (
              <div
                key={alert.alert_id || idx}
                className={`alert py-1 px-3 text-xs ${
                  alert.severity === "critical" ? "alert-error" : alert.severity === "warning" ? "alert-warning" : "alert-info"
                }`}
              >
                <span className="font-semibold">{alert.metric}:</span> {alert.message}
                <button className="btn btn-xs btn-ghost ml-auto" onClick={() => dismissAlert(alert.alert_id)}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
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

          {/* Realized P&L */}
          <div className="stat bg-base-200 rounded-lg p-3">
            <div className="stat-title text-xs">Realized P&L (3M)</div>
            <div className={`stat-value text-xl font-bold ${pnlColor(realizedPnl)}`}>
              {tradesLoading ? <span className="loading loading-spinner loading-xs" /> : formatCurrency(realizedPnl)}
            </div>
            <div className="stat-desc text-xs">
              {recentTrades.length} trade{recentTrades.length !== 1 ? "s" : ""}
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

        {/* Phase 5: Risk Metrics Panel */}
        {showRiskMetrics && (
          <div className="mt-3 p-3 bg-base-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Risk Metrics</h3>
              <div className="flex items-center gap-1">
                {["1M", "3M", "6M", "1A"].map((p) => (
                  <button
                    key={p}
                    className={`btn btn-xs ${riskMetricsPeriod === p ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setRiskMetricsPeriod(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => refreshRiskMetrics()}
                  disabled={riskMetricsLoading}
                >
                  {riskMetricsLoading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
                </button>
              </div>
            </div>

            {riskMetricsLoading && !riskMetrics ? (
              <div className="flex items-center justify-center py-4">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : riskMetrics && riskMetrics.n_data_points > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {/* Sharpe */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Sharpe<InfoTip tip="Risk-adjusted return: excess return per unit of total volatility" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.sharpe_ratio > 1 ? "text-success" : riskMetrics.sharpe_ratio < 0 ? "text-error" : ""}`}>
                    {riskMetrics.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
                {/* Sortino */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Sortino<InfoTip tip="Downside risk-adjusted return: excess return per unit of downside deviation" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.sortino_ratio > 1.5 ? "text-success" : riskMetrics.sortino_ratio < 0 ? "text-error" : ""}`}>
                    {riskMetrics.sortino_ratio.toFixed(2)}
                  </div>
                </div>
                {/* Max Drawdown */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Max DD<InfoTip tip="Maximum drawdown — largest peak-to-trough decline in equity" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.max_drawdown_pct < -10 ? "text-error" : riskMetrics.max_drawdown_pct < -5 ? "text-warning" : ""}`}>
                    {riskMetrics.max_drawdown_pct.toFixed(2)}%
                  </div>
                </div>
                {/* Current DD */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Current DD<InfoTip tip="Current decline from most recent equity peak" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.current_drawdown_pct < -5 ? "text-error" : riskMetrics.current_drawdown_pct < -2 ? "text-warning" : ""}`}>
                    {riskMetrics.current_drawdown_pct.toFixed(2)}%
                  </div>
                </div>
                {/* VaR 95% */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">VaR 95%<InfoTip tip="Value at Risk at 95% — dollar amount of maximum expected daily loss" /></div>
                  <div className="font-mono font-bold text-sm">
                    ${riskMetrics.var_95.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                {/* Win Rate */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Win Rate<InfoTip tip="Percentage of trades that were profitable" /></div>
                  <div className={`font-mono font-bold text-sm ${(riskMetrics.win_rate || 0) > 0.5 ? "text-success" : "text-error"}`}>
                    {((riskMetrics.win_rate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                {/* Calmar */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Calmar<InfoTip tip="Annual return divided by max drawdown" /></div>
                  <div className="font-mono font-bold text-sm">
                    {riskMetrics.calmar_ratio.toFixed(2)}
                  </div>
                </div>
                {/* Annual Vol */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Ann Vol<InfoTip tip="Annualized volatility — yearly standard deviation of returns" /></div>
                  <div className="font-mono font-bold text-sm">
                    {(riskMetrics.annual_vol * 100).toFixed(1)}%
                  </div>
                </div>
                {/* Profit Factor */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Profit Factor<InfoTip tip="Gross profits divided by gross losses (>1.0 = profitable system)" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.profit_factor > 1 ? "text-success" : "text-error"}`}>
                    {riskMetrics.profit_factor.toFixed(2)}
                  </div>
                </div>
                {/* Annual Return */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Ann Return<InfoTip tip="Annualized return percentage" /></div>
                  <div className={`font-mono font-bold text-sm ${riskMetrics.annual_return_pct > 0 ? "text-success" : "text-error"}`}>
                    {riskMetrics.annual_return_pct.toFixed(2)}%
                  </div>
                </div>
                {/* CVaR 95% */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">CVaR 95%<InfoTip tip="Conditional VaR — average loss in the worst 5% of scenarios" /></div>
                  <div className="font-mono font-bold text-sm">
                    ${riskMetrics.cvar_95.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                {/* Max Consec Losses */}
                <div className="bg-base-100 rounded p-2 text-center">
                  <div className="text-xs sm:text-[10px] text-base-content/50 uppercase tracking-wider">Max Loss Streak<InfoTip tip="Maximum number of consecutive losing trades" /></div>
                  <div className="font-mono font-bold text-sm">
                    {riskMetrics.max_consecutive_losses}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-base-content/40 text-sm">
                No risk metrics available. Ensure Alpaca keys are connected.
              </div>
            )}
          </div>
        )}

        {/* Phase 5: Alert Thresholds Panel */}
        {showAlertConfig && (
          <div className="mt-3 p-3 bg-base-200 rounded-lg">
            <h3 className="font-bold text-sm mb-2">P&L Alert Thresholds</h3>

            {/* Create new alert */}
            <div className="flex items-end gap-2 mb-3 flex-wrap">
              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs">Metric</span></label>
                <select
                  className="select select-bordered select-xs"
                  value={newAlert.metric}
                  onChange={(e) => setNewAlert((p) => ({ ...p, metric: e.target.value }))}
                >
                  <option value="day_pnl">Day P&L ($)</option>
                  <option value="unrealized_pnl">Unrealized P&L ($)</option>
                  <option value="drawdown_pct">Drawdown (%)</option>
                  <option value="var_breach">VaR Breach</option>
                  <option value="equity_change_pct">Equity Change (%)</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs">Condition</span></label>
                <select
                  className="select select-bordered select-xs"
                  value={newAlert.operator}
                  onChange={(e) => setNewAlert((p) => ({ ...p, operator: e.target.value }))}
                >
                  <option value="lt">Less than</option>
                  <option value="gt">Greater than</option>
                  <option value="lte">Less or equal</option>
                  <option value="gte">Greater or equal</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs">Value</span></label>
                <input
                  type="number"
                  className="input input-bordered input-xs w-20"
                  value={newAlert.value}
                  onChange={(e) => setNewAlert((p) => ({ ...p, value: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs">Severity</span></label>
                <select
                  className="select select-bordered select-xs"
                  value={newAlert.severity}
                  onChange={(e) => setNewAlert((p) => ({ ...p, severity: e.target.value }))}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button
                className="btn btn-xs btn-primary"
                onClick={() => createAlertThreshold(newAlert)}
              >
                Add Alert
              </button>
            </div>

            {/* Existing thresholds */}
            {alertThresholds.length === 0 ? (
              <div className="text-center py-2 text-base-content/40 text-xs">
                No alert thresholds configured. Add one above to get notified when P&L conditions are met.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {alertThresholds.map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-base-100 rounded px-2 py-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-xs ${
                        t.severity === "critical" ? "badge-error" : t.severity === "warning" ? "badge-warning" : "badge-info"
                      }`}>
                        {t.severity}
                      </span>
                      <span className="font-semibold">{t.metric}</span>
                      <span className="text-base-content/50">{t.operator}</span>
                      <span className="font-mono">{t.value}</span>
                    </div>
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => deleteAlertThreshold(t.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Equity Curve Chart */}
        {!compact && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Equity Curve</h3>
              <div className="flex items-center gap-1">
                {/* Phase 5: Chart mode toggle */}
                <div className="join mr-2">
                  {CHART_MODES.map((m) => (
                    <button
                      key={m.value}
                      className={`btn btn-xs join-item ${chartMode === m.value ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setChartMode(m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {chartMode === "daily" ? (
                  // Daily period selector
                  EQUITY_PERIODS.map((p) => (
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
                  ))
                ) : (
                  // Intraday timeframe selector
                  <>
                    {INTRADAY_TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.value}
                        className={`btn btn-xs ${
                          intradayTimeframe === tf.value ? "btn-primary" : "btn-ghost"
                        }`}
                        onClick={() => setIntradayTimeframe(tf.value)}
                        disabled={intradayLoading}
                      >
                        {tf.label}
                      </button>
                    ))}
                    <span className="text-base-content/30 mx-1">|</span>
                    {INTRADAY_PERIODS.map((p) => (
                      <button
                        key={p.value}
                        className={`btn btn-xs ${
                          intradayPeriod === p.value ? "btn-secondary" : "btn-ghost"
                        }`}
                        onClick={() => setIntradayPeriod(p.value)}
                        disabled={intradayLoading}
                      >
                        {p.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {(equityCurveLoading || intradayLoading) && !chartData.length ? (
              <div className="flex items-center justify-center h-48 bg-base-200 rounded-lg">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : chartData.length > 0 ? (
              <div className="bg-base-200 rounded-lg p-2 h-[220px] sm:h-[280px]">
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
              <span className="text-xs text-base-content/50 hidden sm:inline">Click column headers to sort</span>
            </div>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
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
            {/* Mobile Card View */}
            <div className="sm:hidden space-y-2">
              {sortedPositions.map((p) => {
                const pl = parseFloat(p.unrealized_pl) || 0;
                const plpc = parseFloat(p.unrealized_plpc) || 0;
                return (
                  <div key={p.symbol} className="bg-base-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.symbol}</span>
                        <span className={`badge badge-xs ${parseInt(p.qty) > 0 ? "badge-success" : "badge-error"}`}>
                          {parseInt(p.qty) > 0 ? "LONG" : "SHORT"}
                        </span>
                      </div>
                      <span className={`font-mono font-bold ${pnlColor(pl)}`}>
                        {formatCurrency(pl)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 text-xs text-base-content/60">
                        <span>Qty: {Math.abs(parseInt(p.qty) || 0)}</span>
                        <span>Entry: ${parseFloat(p.avg_entry_price).toFixed(2)}</span>
                      </div>
                      <span className={`badge badge-sm ${pnlBadge(plpc)}`}>
                        {formatPercent(plpc * 100)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Total row */}
              <div className="bg-base-300/50 rounded-lg p-3 flex items-center justify-between">
                <span className="font-bold">Total</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${pnlColor(totalUnrealizedPnl)}`}>
                    {formatCurrency(totalUnrealizedPnl)}
                  </span>
                  <span className={`badge badge-sm ${pnlBadge(totalUnrealizedPnlPc)}`}>
                    {formatPercent(totalUnrealizedPnlPc)}
                  </span>
                </div>
              </div>
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

        {/* Recent Trades Section */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">Recent Trades</h3>
            <div className="flex items-center gap-2">
              {tradesLoading && <span className="loading loading-spinner loading-xs text-primary" />}
              <button
                className="btn btn-xs btn-ghost"
                onClick={refreshTrades}
                disabled={tradesLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          {recentTrades.length === 0 ? (
            <div className="text-center py-6 text-base-content/40 text-sm">
              {tradesLoading ? "Loading trades..." : "No recent trades found"}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.slice(0, 20).map((trade, idx) => {
                      const netAmt = parseFloat(trade.net_amount) || 0;
                      const tradeTime = trade.transaction_timestamp
                        ? new Date(trade.transaction_timestamp)
                        : trade.date
                          ? new Date(trade.date)
                          : null;
                      return (
                        <tr key={trade.id || idx}>
                          <td className="text-xs font-mono">
                            {tradeTime
                              ? tradeTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                                " " +
                                tradeTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                              : "-"}
                          </td>
                          <td className="font-bold">{trade.symbol || "-"}</td>
                          <td>
                            <span className={`badge badge-xs ${trade.side === "buy" ? "badge-success" : "badge-error"}`}>
                              {(trade.side || "-").toUpperCase()}
                            </span>
                          </td>
                          <td className="text-right font-mono">{parseFloat(trade.qty) || 0}</td>
                          <td className="text-right font-mono">${parseFloat(trade.price || trade.fill_price || 0).toFixed(2)}</td>
                          <td className={`text-right font-mono ${pnlColor(netAmt)}`}>
                            {netAmt !== 0 ? formatCurrency(netAmt) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2">
                {recentTrades.slice(0, 10).map((trade, idx) => {
                  const netAmt = parseFloat(trade.net_amount) || 0;
                  const tradeTime = trade.transaction_timestamp
                    ? new Date(trade.transaction_timestamp)
                    : trade.date
                      ? new Date(trade.date)
                      : null;
                  return (
                    <div key={trade.id || idx} className="bg-base-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{trade.symbol || "-"}</span>
                          <span className={`badge badge-xs ${trade.side === "buy" ? "badge-success" : "badge-error"}`}>
                            {(trade.side || "-").toUpperCase()}
                          </span>
                        </div>
                        {netAmt !== 0 && (
                          <span className={`font-mono font-bold text-sm ${pnlColor(netAmt)}`}>
                            {formatCurrency(netAmt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-base-content/60">
                        <span className="font-mono">
                          {tradeTime
                            ? tradeTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                              " " +
                              tradeTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                            : "-"}
                        </span>
                        <span className="font-mono">
                          {parseFloat(trade.qty) || 0} @ ${parseFloat(trade.price || trade.fill_price || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Realized P&L by Symbol Breakdown */}
              {Object.keys(realizedPnlBySymbol).length > 0 && (
                <div className="mt-3">
                  <h4 className="font-semibold text-xs text-base-content/60 mb-1">Realized P&L by Symbol</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(realizedPnlBySymbol)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([symbol, pnl]) => (
                        <span key={symbol} className="text-xs flex items-center gap-1">
                          <span className={`inline-block w-2 h-2 rounded-full ${pnl >= 0 ? "bg-success" : "bg-error"}`} />
                          <span className="font-bold">{symbol}</span>{" "}
                          <span className={pnlColor(pnl)}>{formatCurrency(pnl)}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
