"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ── Date range presets ──────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: "1M", label: "1M", days: 30 },
  { value: "3M", label: "3M", days: 90 },
  { value: "6M", label: "6M", days: 180 },
  { value: "1Y", label: "1Y", days: 365 },
  { value: "YTD", label: "YTD", days: null },
  { value: "ALL", label: "All", days: null },
];

// ── Metric computation helpers ──────────────────────────────────────────────

function computeMetrics(snapshots) {
  if (!snapshots || snapshots.length < 2) return null;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const startValue = parseFloat(first.equity) || parseFloat(first.total_value) || 0;
  const endValue = parseFloat(last.equity) || parseFloat(last.total_value) || 0;

  if (startValue <= 0) return null;

  // Total Return %
  const totalReturnPct = ((endValue - startValue) / startValue) * 100;

  // CAGR
  const startDate = new Date(first.snapshot_date);
  const endDate = new Date(last.snapshot_date);
  const yearsDiff = (endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);
  const cagr = yearsDiff > 0 ? (Math.pow(endValue / startValue, 1 / yearsDiff) - 1) * 100 : 0;

  // Daily returns for Sharpe/Sortino
  const dailyReturns = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = parseFloat(snapshots[i - 1].equity) || parseFloat(snapshots[i - 1].total_value) || 0;
    const curr = parseFloat(snapshots[i].equity) || parseFloat(snapshots[i].total_value) || 0;
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  // Max Drawdown
  let peak = startValue;
  let maxDrawdown = 0;
  for (const snap of snapshots) {
    const val = parseFloat(snap.equity) || parseFloat(snap.total_value) || 0;
    if (val > peak) peak = val;
    const dd = (val - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  const maxDrawdownPct = maxDrawdown * 100;

  // Sharpe Ratio (annualized, risk-free rate ≈ 5% / 252 daily)
  const riskFreeDaily = 0.05 / 252;
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1))
    : 0;
  const sharpe = stdReturn > 0
    ? ((avgReturn - riskFreeDaily) / stdReturn) * Math.sqrt(252)
    : 0;

  // Sortino Ratio
  const negativeReturns = dailyReturns.filter((r) => r < riskFreeDaily);
  const downDev = negativeReturns.length > 1
    ? Math.sqrt(negativeReturns.reduce((s, r) => s + (r - riskFreeDaily) ** 2, 0) / negativeReturns.length)
    : stdReturn;
  const sortino = downDev > 0
    ? ((avgReturn - riskFreeDaily) / downDev) * Math.sqrt(252)
    : 0;

  // Alpha vs Benchmark (SPY)
  let alpha = null;
  const startBenchmark = parseFloat(first.benchmark_value);
  const endBenchmark = parseFloat(last.benchmark_value);
  if (startBenchmark > 0 && endBenchmark > 0) {
    const benchmarkReturn = ((endBenchmark - startBenchmark) / startBenchmark) * 100;
    alpha = totalReturnPct - benchmarkReturn;
  }

  return {
    totalReturnPct,
    cagr,
    maxDrawdownPct,
    sharpe,
    sortino,
    alpha,
    startValue,
    endValue,
    dataPoints: snapshots.length,
    dateRange: {
      start: first.snapshot_date,
      end: last.snapshot_date,
    },
  };
}

/**
 * Compute drawdown series from snapshots.
 */
function computeDrawdownSeries(snapshots) {
  if (!snapshots || snapshots.length < 2) return [];

  let peak = 0;
  return snapshots.map((snap) => {
    const val = parseFloat(snap.equity) || parseFloat(snap.total_value) || 0;
    if (val > peak) peak = val;
    const drawdown = peak > 0 ? ((val - peak) / peak) * 100 : 0;
    return {
      date: snap.snapshot_date,
      drawdown,
    };
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export default function HistoricalEquityCurve() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRange, setSelectedRange] = useState("1Y");
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState(null);
  const pollRef = useRef(null);

  // ── Fetch snapshots ──────────────────────────────────────────────────

  const fetchSnapshots = useCallback(async () => {
    try {
      const now = new Date();
      let dateFrom = null;

      if (selectedRange === "ALL") {
        dateFrom = null;
      } else if (selectedRange === "YTD") {
        dateFrom = `${now.getFullYear()}-01-01`;
      } else {
        const preset = DATE_RANGES.find((r) => r.value === selectedRange);
        if (preset?.days) {
          const from = new Date(now.getTime() - preset.days * 86400000);
          dateFrom = from.toISOString().split("T")[0];
        }
      }

      const params = new URLSearchParams({ limit: "1000" });
      if (dateFrom) params.set("date_from", dateFrom);

      const res = await fetch(`/api/portfolio/snapshot?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to fetch snapshots");
      }

      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  // Initial load + auto-refresh
  useEffect(() => {
    setLoading(true);
    fetchSnapshots();

    // Poll every 60s during market hours (9:30 AM – 4:00 PM ET, Mon–Fri)
    const startPoll = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchSnapshots, 60000);
    };
    startPoll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSnapshots]);

  // ── Manual capture ───────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    setCapturing(true);
    setCaptureMessage(null);
    try {
      const res = await fetch("/api/portfolio/snapshot/capture", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCaptureMessage({ type: "success", text: "Snapshot captured successfully!" });
        // Refresh data
        await fetchSnapshots();
      } else {
        setCaptureMessage({
          type: "error",
          text: data.error || data.code || "Capture failed",
        });
      }
    } catch (err) {
      setCaptureMessage({ type: "error", text: err.message });
    } finally {
      setCapturing(false);
      // Clear message after 5s
      setTimeout(() => setCaptureMessage(null), 5000);
    }
  }, [fetchSnapshots]);

  // ── Computed data ────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    if (!snapshots.length) return [];
    return snapshots.map((snap) => ({
      date: snap.snapshot_date,
      equity: parseFloat(snap.equity) || parseFloat(snap.total_value) || 0,
      benchmark: parseFloat(snap.benchmark_value) || null,
      day_pnl: parseFloat(snap.day_pnl) || 0,
      unrealized_pnl: parseFloat(snap.unrealized_pnl) || 0,
    }));
  }, [snapshots]);

  const drawdownData = useMemo(
    () => computeDrawdownSeries(snapshots),
    [snapshots]
  );

  const metrics = useMemo(
    () => computeMetrics(snapshots),
    [snapshots]
  );

  // Chart axis domains
  const equityMinMax = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 100 };
    const values = chartData.map((d) => d.equity).filter(Boolean);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.1, 1);
    return { min: Math.floor(min - padding), max: Math.ceil(max + padding) };
  }, [chartData]);

  const benchmarkMinMax = useMemo(() => {
    const values = chartData.map((d) => d.benchmark).filter(Boolean);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.1, 1);
    return { min: Math.floor(min - padding), max: Math.ceil(max + padding) };
  }, [chartData]);

  const drawdownMinMax = useMemo(() => {
    if (!drawdownData.length) return { min: -10, max: 0 };
    const values = drawdownData.map((d) => d.drawdown);
    const min = Math.min(...values, -1);
    return { min: Math.floor(min * 1.1), max: 0 };
  }, [drawdownData]);

  // ── Formatters ───────────────────────────────────────────────────────

  const fmtCurrency = (v) =>
    `$${(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtPct = (v) => `${(v || 0).toFixed(2)}%`;

  const pnlColor = (v) =>
    v > 0 ? "text-success" : v < 0 ? "text-error" : "text-base-content/50";

  // ── Custom Tooltip ───────────────────────────────────────────────────

  const ChartTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-base-100 border border-base-300 rounded-lg p-3 shadow-xl text-sm">
        <div className="font-bold text-base-content/80 mb-1">{d.date}</div>
        <div className="flex items-center gap-2">
          <span className="text-base-content/60">Portfolio:</span>
          <span className="font-mono font-bold">{fmtCurrency(d.equity)}</span>
        </div>
        {d.benchmark && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-base-content/60">SPY:</span>
            <span className="font-mono font-bold">${d.benchmark.toFixed(2)}</span>
          </div>
        )}
        {d.day_pnl !== undefined && d.day_pnl !== 0 && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-base-content/60">Day P&L:</span>
            <span className={`font-mono font-bold ${pnlColor(d.day_pnl)}`}>
              {fmtCurrency(d.day_pnl)}
            </span>
          </div>
        )}
      </div>
    );
  }, []);

  const DrawdownTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-base-100 border border-base-300 rounded-lg p-2 shadow-xl text-sm">
        <div className="font-bold text-base-content/80">{d.date}</div>
        <div className="flex items-center gap-2">
          <span className="text-base-content/60">Drawdown:</span>
          <span className="font-mono font-bold text-error">{fmtPct(d.drawdown)}</span>
        </div>
      </div>
    );
  }, []);

  // ── Render: Loading ──────────────────────────────────────────────────

  if (loading && !snapshots.length) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Historical Equity Curve</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-base-200 rounded-lg p-3 animate-pulse">
                <div className="h-3 bg-base-300 rounded w-12 mb-2" />
                <div className="h-6 bg-base-300 rounded w-20" />
              </div>
            ))}
          </div>
          <div className="mt-4 bg-base-200 rounded-lg animate-pulse" style={{ height: 400 }} />
        </div>
      </div>
    );
  }

  // ── Render: Error ────────────────────────────────────────────────────

  if (error && !snapshots.length) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Historical Equity Curve</h2>
          <div className="alert alert-error">
            <span>Failed to load historical data: {error}</span>
          </div>
          <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary mt-2" onClick={fetchSnapshots}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Empty state ──────────────────────────────────────────────

  if (!loading && !snapshots.length) {
    return (
      <div className="card shadow-xl border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Historical Equity Curve</h2>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 text-base-content/20 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <h3 className="text-lg font-bold text-base-content/60 mb-2">
              No Historical Data Yet
            </h3>
            <p className="text-sm text-base-content/40 mb-4 max-w-md">
              Capture your first portfolio snapshot to start tracking your
              long-term equity curve. Snapshots are saved daily and persist
              beyond Alpaca&apos;s 30-day API limit.
            </p>
            <button
              className={`btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm ${capturing ? "loading" : ""}`}
              onClick={handleCapture}
              disabled={capturing}
            >
              {capturing ? (
                <span className="loading loading-spinner loading-xs mr-1" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 0010.586 2H9.414a1 1 0 00-.707.293L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              Capture First Snapshot
            </button>
            {captureMessage && (
              <div
                className={`alert mt-3 py-2 px-3 text-xs ${
                  captureMessage.type === "success" ? "alert-success" : "alert-error"
                }`}
              >
                {captureMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Full chart ───────────────────────────────────────────────

  const hasBenchmark = chartData.some((d) => d.benchmark != null);
  const equityTrend =
    chartData.length >= 2 ? chartData[chartData.length - 1].equity - chartData[0].equity : 0;
  const equityColor = equityTrend >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div className="card shadow-xl border border-base-300 bg-base-100">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title">Historical Equity Curve</h2>
          <div className="flex items-center gap-2">
            {captureMessage && (
              <span
                className={`text-xs ${
                  captureMessage.type === "success" ? "text-success" : "text-error"
                }`}
              >
                {captureMessage.text}
              </span>
            )}
            <button
              className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-outline ${capturing ? "loading" : ""}`}
              onClick={handleCapture}
              disabled={capturing}
              title="Capture a new portfolio snapshot now"
            >
              {capturing ? (
                <span className="loading loading-spinner loading-xs mr-1" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 mr-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 0010.586 2H9.414a1 1 0 00-.707.293L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              Capture Now
            </button>
            <button
              className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs ${showDrawdown ? "btn-error" : "btn-ghost"}`}
              onClick={() => setShowDrawdown(!showDrawdown)}
            >
              Drawdown
            </button>
            <button
              className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost"
              onClick={fetchSnapshots}
              disabled={loading}
            >
              {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-1 mt-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs ${selectedRange === r.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setSelectedRange(r.value)}
            >
              {r.label}
            </button>
          ))}
          <span className="text-xs text-base-content/40 ml-2">
            {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Metrics Bar */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
            {/* Total Return */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">Total Return</div>
              <div className={`stat-value text-base font-bold ${pnlColor(metrics.totalReturnPct)}`}>
                {fmtPct(metrics.totalReturnPct)}
              </div>
            </div>
            {/* CAGR */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">CAGR</div>
              <div className={`stat-value text-base font-bold ${pnlColor(metrics.cagr)}`}>
                {fmtPct(metrics.cagr)}
              </div>
            </div>
            {/* Max Drawdown */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">Max Drawdown</div>
              <div className="stat-value text-base font-bold text-error">
                {fmtPct(metrics.maxDrawdownPct)}
              </div>
            </div>
            {/* Sharpe */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">Sharpe Ratio</div>
              <div
                className={`stat-value text-base font-bold ${
                  metrics.sharpe > 1 ? "text-success" : metrics.sharpe < 0 ? "text-error" : ""
                }`}
              >
                {metrics.sharpe.toFixed(2)}
              </div>
            </div>
            {/* Sortino */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">Sortino Ratio</div>
              <div
                className={`stat-value text-base font-bold ${
                  metrics.sortino > 1.5 ? "text-success" : metrics.sortino < 0 ? "text-error" : ""
                }`}
              >
                {metrics.sortino.toFixed(2)}
              </div>
            </div>
            {/* Alpha vs SPY */}
            <div className="stat bg-base-200 rounded-lg p-2">
              <div className="stat-title text-[10px]">Alpha vs SPY</div>
              <div className="stat-value text-base font-bold">
                {metrics.alpha !== null ? (
                  <span className={pnlColor(metrics.alpha)}>{fmtPct(metrics.alpha)}</span>
                ) : (
                  <span className="text-base-content/30 text-xs">N/A</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Equity Curve Chart */}
        <div className="mt-3 bg-base-200 rounded-lg p-2" style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="histEquityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={equityColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={equityColor} stopOpacity={0.02} />
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
                yAxisId="equity"
                domain={[equityMinMax.min, equityMinMax.max]}
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              />
              {hasBenchmark && benchmarkMinMax && (
                <YAxis
                  yAxisId="benchmark"
                  orientation="right"
                  domain={[benchmarkMinMax.min, benchmarkMinMax.max]}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                />
              )}
              <Tooltip content={<ChartTooltip />} />
              {chartData.length > 0 && (
                <ReferenceLine
                  yAxisId="equity"
                  y={chartData[0].equity}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  opacity={0.3}
                />
              )}
              <Area
                yAxisId="equity"
                type="monotone"
                dataKey="equity"
                stroke={equityColor}
                strokeWidth={2}
                fill="url(#histEquityGradient)"
                dot={false}
                activeDot={{ r: 4, fill: equityColor, stroke: "white", strokeWidth: 2 }}
              />
              {hasBenchmark && (
                <Line
                  yAxisId="benchmark"
                  type="monotone"
                  dataKey="benchmark"
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 3, fill: "#9ca3af", stroke: "white", strokeWidth: 1 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 text-xs text-base-content/60">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-1 rounded"
              style={{ backgroundColor: equityColor }}
            />
            Portfolio Equity
          </span>
          {hasBenchmark && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed border-gray-400" />
              SPY Benchmark
            </span>
          )}
        </div>

        {/* Drawdown Chart */}
        {showDrawdown && drawdownData.length > 0 && (
          <div className="mt-3">
            <h3 className="font-bold text-sm mb-2">Drawdown from Peak</h3>
            <div className="bg-base-200 rounded-lg p-2" style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={drawdownData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[drawdownMinMax.min, 0]}
                    tick={{ fontSize: 9, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                  <Tooltip content={<DrawdownTooltip />} />
                  <ReferenceLine y={0} stroke="currentColor" opacity={0.2} />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    fill="url(#drawdownGradient)"
                    dot={false}
                    activeDot={{ r: 3, fill: "#ef4444", stroke: "white", strokeWidth: 1 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Data info */}
        <div className="flex items-center justify-between mt-2 text-xs text-base-content/40">
          <span>
            {snapshots.length > 0
              ? `${snapshots[0].snapshot_date} — ${snapshots[snapshots.length - 1].snapshot_date}`
              : "No data"}
          </span>
          <span>Auto-refreshes every 60s during market hours</span>
        </div>
      </div>
    </div>
  );
}
