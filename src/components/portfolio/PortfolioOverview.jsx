"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStream } from "@/context/StreamContext";
import CorrelationCard from "@/components/portfolio/CorrelationCard";
import OptimizerCard from "@/components/portfolio/OptimizerCard";

/**
 * PortfolioOverview — Aggregated regime + risk + correlation + optimization summary.
 *
 * Pulls from:
 * 1. FastAPI GET /portfolio (aggregated risk flags, per-symbol breakdowns)
 * 2. FastAPI POST /correlation/detect (correlation regime, heatmap, blended risk)
 * 3. FastAPI POST /optimise/full (optimal weights, exposure scalar, DD constraint)
 * 4. Local StreamContext (real-time stream states for per-symbol pricing)
 *
 * Prerequisite: Symbols must be seeded via streaming before appearing.
 */
export default function PortfolioOverview() {
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Correlation + Optimization state
  const [correlationData, setCorrelationData] = useState(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [optimizationData, setOptimizationData] = useState(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);

  // Open/close sections
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);

  const { streamStates, activeStreamCount, anyConnected, alerts, tickCounts } =
    useStream();
  const intervalRef = useRef(null);

  // Subscribed symbols list
  const symbols = Object.keys(streamStates);

  // ── Compute returns matrix from price data ──────────────────────────────
  // We need to fetch price data for each symbol to compute returns.
  // The returns matrix is built from cached Yahoo Finance data.
  const [returnsMatrix, setReturnsMatrix] = useState({});
  const [returnsLoading, setReturnsLoading] = useState(false);

  const fetchReturnsMatrix = useCallback(async (symList) => {
    if (symList.length < 2) return;

    setReturnsLoading(true);
    try {
      const results = {};
      await Promise.all(
        symList.map(async (sym) => {
          try {
            const res = await fetch(
              `/api/prices?symbol=${encodeURIComponent(sym)}&period=1y`,
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data.prices?.length > 1) {
              // Compute simple returns from prices
              const returns = [];
              for (let i = 1; i < data.prices.length; i++) {
                const r =
                  (data.prices[i] - data.prices[i - 1]) / data.prices[i - 1];
                returns.push(isFinite(r) ? r : 0);
              }
              results[sym] = returns;
            }
          } catch {
            // Skip symbols with no data
          }
        }),
      );
      setReturnsMatrix(results);
    } finally {
      setReturnsLoading(false);
    }
  }, []);

  // Fetch returns when symbols change
  useEffect(() => {
    if (symbols.length >= 2) {
      fetchReturnsMatrix(symbols);
    }
  }, [symbols.join(","), fetchReturnsMatrix]);

  // Current weights: equal-weight by default, or proportional to Kelly sizing from portfolio
  const currentWeights = (() => {
    if (!portfolio?.symbols?.length) {
      // Equal weight
      if (symbols.length === 0) return {};
      const w = 1 / symbols.length;
      return Object.fromEntries(symbols.map((s) => [s, w]));
    }
    // Use Kelly sizing from portfolio data
    const total = portfolio.symbols.reduce((sum, sym) => {
      return sum + (sym.recommended_f ?? sym.sizing?.recommended_f ?? 0);
    }, 0);
    if (total === 0) {
      const w = 1 / portfolio.symbols.length;
      return Object.fromEntries(portfolio.symbols.map((s) => [s.symbol, w]));
    }
    return Object.fromEntries(
      portfolio.symbols.map((sym) => [
        sym.symbol,
        (sym.recommended_f ?? sym.sizing?.recommended_f ?? 0) / total,
      ]),
    );
  })();

  // ── Fetch portfolio from FastAPI ─────────────────────────────────────────
  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const symbolsParam = symbols.length > 0 ? symbols.join(",") : undefined;
      const params = new URLSearchParams();
      if (symbolsParam) params.set("symbols", symbolsParam);

      const url = `/api/portfolio${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setPortfolio(data);
    } catch (err) {
      setError(err.message || "Portfolio fetch failed");
    } finally {
      setLoading(false);
    }
  }, [streamStates]);

  // ── Run correlation detection ────────────────────────────────────────────
  const runCorrelation = useCallback(async () => {
    const validSymbols = symbols.filter((s) => returnsMatrix[s]?.length > 0);
    if (validSymbols.length < 2) return;

    setCorrelationLoading(true);
    try {
      const filteredMatrix = {};
      validSymbols.forEach((s) => {
        filteredMatrix[s] = returnsMatrix[s];
      });

      const res = await fetch("/api/correlation/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: validSymbols,
          returns_matrix: filteredMatrix,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCorrelationData(data);
    } catch (err) {
      console.error("[Correlation] Error:", err.message);
      setCorrelationData({ error: err.message });
    } finally {
      setCorrelationLoading(false);
    }
  }, [symbols, returnsMatrix]);

  // ── Run portfolio optimization ───────────────────────────────────────────
  const runOptimize = useCallback(async () => {
    const validSymbols = symbols.filter((s) => returnsMatrix[s]?.length > 0);
    if (validSymbols.length < 2) return;

    setOptimizationLoading(true);
    try {
      const filteredMatrix = {};
      validSymbols.forEach((s) => {
        filteredMatrix[s] = returnsMatrix[s];
      });

      const res = await fetch("/api/optimise/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: validSymbols,
          returns_matrix: filteredMatrix,
          current_weights: currentWeights,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setOptimizationData(data);
    } catch (err) {
      console.error("[Optimizer] Error:", err.message);
      setOptimizationData({ error: err.message });
    } finally {
      setOptimizationLoading(false);
    }
  }, [symbols, returnsMatrix, currentWeights]);

  // Auto-refresh portfolio on interval
  useEffect(() => {
    if (autoRefresh && activeStreamCount > 0) {
      fetchPortfolio();
      intervalRef.current = setInterval(fetchPortfolio, 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, activeStreamCount, fetchPortfolio]);

  // Initial fetch when streams become active
  useEffect(() => {
    if (activeStreamCount > 0) {
      fetchPortfolio();
    }
  }, [activeStreamCount, fetchPortfolio]);

  // No active streams
  if (activeStreamCount === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Portfolio View</h2>
        </div>
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body items-center text-center py-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-base-content/20 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">No Active Streams</h3>
            <p className="text-base-content/50 text-sm max-w-md">
              Start streaming symbols from the Dashboard to see aggregated
              portfolio risk metrics here. Use the &quot;Go Live&quot; button on
              any ticker card.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Portfolio View</h2>
          <span className="badge badge-primary badge-sm">
            {activeStreamCount} stream{activeStreamCount !== 1 ? "s" : ""}
          </span>
          {anyConnected && (
            <span className="badge badge-success badge-sm gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              LIVE
            </span>
          )}
          <span className="badge badge-outline badge-sm">v3.0</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-base-content/60">Auto-refresh</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>
          <button
            className="btn btn-sm btn-ghost gap-1"
            onClick={fetchPortfolio}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error alert-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm">{error}</span>
          <button className="btn btn-xs btn-ghost" onClick={fetchPortfolio}>
            Retry
          </button>
        </div>
      )}

      {/* Risk Flags Banner */}
      {portfolio && (
        <RiskFlagsBanner
          portfolio={portfolio}
          correlationData={correlationData}
        />
      )}

      {/* Portfolio Summary Stats */}
      {portfolio && (
        <PortfolioStats
          portfolio={portfolio}
          correlationData={correlationData}
          optimizationData={optimizationData}
        />
      )}

      {/* Per-Symbol Breakdown */}
      {portfolio?.symbols && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">Symbol Breakdown</h3>
            <SymbolBreakdownTable
              symbols={portfolio.symbols}
              streamStates={streamStates}
              tickCounts={tickCounts}
            />
          </div>
        </div>
      )}

      {/* ── v3.0: Correlation + Optimization Section ──────────────────────── */}
      <div className="divider text-base-content/40 text-xs">
        CORRELATION & OPTIMIZATION
      </div>

      {/* Collapsible: Correlation Detection */}
      <div className="collapse collapse-arrow bg-base-200 rounded-lg">
        <input
          type="checkbox"
          checked={showCorrelation}
          onChange={() => setShowCorrelation(!showCorrelation)}
        />
        <div className="collapse-title text-sm font-semibold flex items-center gap-2">
          🔗 Correlation Detection
          {correlationData?.correlation_regime && (
            <span
              className={`badge badge-xs ${
                correlationData.correlation_regime === "low_corr"
                  ? "badge-success"
                  : correlationData.correlation_regime === "high_corr" ||
                      correlationData.correlation_regime === "crisis"
                    ? "badge-error"
                    : "badge-warning"
              }`}
            >
              {correlationData.correlation_regime.replace("_", " ")}
            </span>
          )}
          {correlationData?.mean_abs_rho != null && (
            <span className="text-xs font-mono opacity-50">
              |ρ|={correlationData.mean_abs_rho.toFixed(2)}
            </span>
          )}
        </div>
        <div className="collapse-content">
          <CorrelationCard
            symbols={symbols}
            returnsMatrix={returnsMatrix}
            data={correlationData}
            loading={correlationLoading}
            onRunCorrelation={runCorrelation}
          />
        </div>
      </div>

      {/* Collapsible: Portfolio Optimizer */}
      <div className="collapse collapse-arrow bg-base-200 rounded-lg">
        <input
          type="checkbox"
          checked={showOptimizer}
          onChange={() => setShowOptimizer(!showOptimizer)}
        />
        <div className="collapse-title text-sm font-semibold flex items-center gap-2">
          ⚖️ Portfolio Optimizer
          {optimizationData?.exposure_scalar != null && (
            <span
              className={`badge badge-xs ${
                optimizationData.exposure_scalar >= 0.9
                  ? "badge-success"
                  : optimizationData.exposure_scalar >= 0.5
                    ? "badge-warning"
                    : "badge-error"
              }`}
            >
              {(optimizationData.exposure_scalar * 100).toFixed(0)}% exp
            </span>
          )}
          {optimizationData?.drawdown_constraint && (
            <span
              className={`badge badge-xs ${optimizationData.drawdown_constraint.within_limits ? "badge-success" : "badge-error"}`}
            >
              {optimizationData.drawdown_constraint.within_limits
                ? "DD OK"
                : "DD breach"}
            </span>
          )}
        </div>
        <div className="collapse-content">
          <OptimizerCard
            symbols={symbols}
            returnsMatrix={returnsMatrix}
            currentWeights={currentWeights}
            data={optimizationData}
            loading={optimizationLoading}
            onRunOptimize={runOptimize}
          />
        </div>
      </div>

      {/* Active Alerts from streaming */}
      {alerts.length > 0 && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">
              Recent Regime Alerts
              <span className="badge badge-warning badge-sm">
                {alerts.length}
              </span>
            </h3>
            <div className="max-h-48 overflow-y-auto">
              <ul className="space-y-2">
                {alerts.slice(0, 10).map((alert) => (
                  <li
                    key={alert.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      className={`badge badge-xs ${
                        alert.severity === "critical"
                          ? "badge-error"
                          : alert.severity === "warning"
                            ? "badge-warning"
                            : "badge-info"
                      }`}
                    >
                      {alert.severity || "info"}
                    </span>
                    <span className="font-mono font-bold">{alert.symbol}</span>
                    <span className="opacity-50">{alert.previous} →</span>
                    <span className="font-mono">{alert.current}</span>
                    {alert.message && (
                      <span className="text-xs opacity-40 hidden sm:inline">
                        — {alert.message}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !portfolio && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body p-4">
            <div className="skeleton h-6 w-40 mb-3" />
            <div className="flex gap-4 flex-wrap">
              <div className="skeleton h-16 w-28" />
              <div className="skeleton h-16 w-28" />
              <div className="skeleton h-16 w-28" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskFlagsBanner({ portfolio, correlationData }) {
  const flags = [];

  if (portfolio.high_risk_count > 0) {
    flags.push({
      level: "error",
      label: `${portfolio.high_risk_count} high-risk symbol${portfolio.high_risk_count !== 1 ? "s" : ""}`,
      detail: "Risk multiplier < 0.5×",
    });
  }
  if (portfolio.concentration_flag) {
    flags.push({
      level: "warning",
      label: "Concentration risk",
      detail: "A position exceeds 40% Kelly allocation",
    });
  }
  if (portfolio.regime_divergence_flag) {
    flags.push({
      level: "info",
      label: "Regime divergence",
      detail: "Portfolio spans many different regime states",
    });
  }
  // v3.0: Add correlation risk flags
  if (correlationData?.correlation_regime === "crisis") {
    flags.push({
      level: "error",
      label: "Crisis correlation",
      detail: "Extreme co-movement — reduce exposure to 50%",
    });
  } else if (correlationData?.correlation_regime === "high_corr") {
    flags.push({
      level: "warning",
      label: "High correlation",
      detail: "Assets moving together — limited diversification benefit",
    });
  }
  if (portfolio.active_alerts?.length > 0) {
    flags.push({
      level: "warning",
      label: `${portfolio.active_alerts.length} recent alert${portfolio.active_alerts.length !== 1 ? "s" : ""}`,
      detail: portfolio.active_alerts.join(", "),
    });
  }

  if (flags.length === 0) {
    return (
      <div className="alert alert-success">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-sm">All clear — no portfolio risk flags</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {flags.map((flag, i) => (
        <div key={i} className={`alert alert-${flag.level} py-2`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            {flag.level === "error" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            ) : flag.level === "warning" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            )}
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold">{flag.label}</span>
            <span className="text-xs opacity-70 ml-2">{flag.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioStats({ portfolio, correlationData, optimizationData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">Portfolio VaR 95</div>
        <div className="stat-value text-lg font-mono text-error">
          {portfolio.portfolio_var95 != null
            ? `${(portfolio.portfolio_var95 * 100).toFixed(2)}%`
            : "—"}
        </div>
        <div className="stat-desc text-xs">√(ΣVaR²)</div>
      </div>
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">Active Symbols</div>
        <div className="stat-value text-lg font-mono">
          {portfolio.symbols?.length ?? 0}
        </div>
        <div className="stat-desc text-xs">streamed</div>
      </div>
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">High Risk</div>
        <div className="stat-value text-lg font-mono text-warning">
          {portfolio.high_risk_count ?? 0}
        </div>
        <div className="stat-desc text-xs">risk_mult &lt; 0.5×</div>
      </div>
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">Concentration</div>
        <div className="stat-value text-lg font-mono">
          {portfolio.concentration_flag ? "⚠️" : "✓"}
        </div>
        <div className="stat-desc text-xs">
          {portfolio.concentration_flag ? "flagged" : "balanced"}
        </div>
      </div>
      {/* v3.0: New correlation stat */}
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">Corr Regime</div>
        <div
          className={`stat-value text-sm font-bold ${
            correlationData?.correlation_regime === "low_corr"
              ? "text-success"
              : correlationData?.correlation_regime === "crisis" ||
                  correlationData?.correlation_regime === "high_corr"
                ? "text-error"
                : correlationData?.correlation_regime === "mid_corr"
                  ? "text-warning"
                  : ""
          }`}
        >
          {correlationData?.correlation_regime
            ? correlationData.correlation_regime.replace("_", " ")
            : "—"}
        </div>
        <div className="stat-desc text-xs">
          {correlationData?.mean_abs_rho != null
            ? `|ρ|=${correlationData.mean_abs_rho.toFixed(2)}`
            : "not detected"}
        </div>
      </div>
      {/* v3.0: New exposure stat */}
      <div className="stat bg-base-200 rounded-lg p-3 shadow">
        <div className="stat-title text-xs">Exposure</div>
        <div
          className={`stat-value text-lg font-mono ${
            optimizationData?.exposure_scalar != null &&
            optimizationData.exposure_scalar >= 0.9
              ? "text-success"
              : optimizationData?.exposure_scalar >= 0.5
                ? "text-warning"
                : "text-error"
          }`}
        >
          {optimizationData?.exposure_scalar != null
            ? `${(optimizationData.exposure_scalar * 100).toFixed(0)}%`
            : "—"}
        </div>
        <div className="stat-desc text-xs">
          {optimizationData?.drawdown_constraint
            ? optimizationData.drawdown_constraint.within_limits
              ? "DD OK"
              : "DD breach"
            : "not optimized"}
        </div>
      </div>
    </div>
  );
}

function SymbolBreakdownTable({
  symbols = [],
  streamStates = {},
  tickCounts = {},
}) {
  if (!symbols.length) {
    return (
      <div className="text-sm text-base-content/40 py-4 text-center">
        No symbol data available. Start streaming to populate.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Regime</th>
            <th>Risk Mult</th>
            <th>Kelly Size</th>
            <th>VaR 95</th>
            <th>Ticks</th>
            <th>Stream</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((sym) => {
            const streamState = streamStates[sym.symbol] || {};
            const regimeLabel =
              sym.regime_label || sym.regime?.regime_label || "—";
            const isBear = regimeLabel.toLowerCase().includes("bear");
            const isBull = regimeLabel.toLowerCase().includes("bull");

            return (
              <tr key={sym.symbol}>
                <td className="font-mono font-bold">{sym.symbol}</td>
                <td>
                  <span
                    className={`badge badge-xs ${
                      isBear
                        ? "badge-error"
                        : isBull
                          ? "badge-success"
                          : "badge-warning"
                    }`}
                  >
                    {regimeLabel}
                  </span>
                </td>
                <td className="font-mono">
                  <RiskMultBar
                    value={sym.risk_multiplier ?? sym.regime?.risk_multiplier}
                  />
                </td>
                <td className="font-mono text-sm">
                  {sym.recommended_f != null
                    ? `${(sym.recommended_f * 100).toFixed(1)}%`
                    : sym.sizing?.recommended_f != null
                      ? `${(sym.sizing.recommended_f * 100).toFixed(1)}%`
                      : "—"}
                </td>
                <td className="font-mono text-sm">
                  {sym.var_95 != null
                    ? `${(sym.var_95 * 100).toFixed(2)}%`
                    : sym.risk?.var_95 != null
                      ? `${(sym.risk.var_95 * 100).toFixed(2)}%`
                      : "—"}
                </td>
                <td className="font-mono text-sm">
                  {tickCounts[sym.symbol] || 0}
                </td>
                <td>
                  {streamState.isConnected ? (
                    <span className="badge badge-xs badge-success gap-0.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                      </span>
                      LIVE
                    </span>
                  ) : streamState.isSeeded ? (
                    <span className="badge badge-xs badge-warning">seeded</span>
                  ) : (
                    <span className="badge badge-xs badge-ghost">offline</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RiskMultBar({ value }) {
  if (value == null) return <span>—</span>;
  const pct = Math.min(value / 1.5, 1) * 100;
  const color =
    value >= 1.0 ? "bg-success" : value >= 0.5 ? "bg-info" : "bg-error";
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 bg-base-300 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs">{value.toFixed(2)}×</span>
    </div>
  );
}
