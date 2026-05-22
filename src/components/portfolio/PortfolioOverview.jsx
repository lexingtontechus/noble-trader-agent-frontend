"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Regime colour & label maps (shared across correlation components)
 */
const REGIME_COLORS = {
  low_corr: "badge-success",
  mid_corr: "badge-warning",
  high_corr: "badge-error",
  crisis: "badge-error",
};

const REGIME_LABELS = {
  low_corr: "Low Correlation",
  mid_corr: "Mid Correlation",
  high_corr: "High Correlation",
  crisis: "Crisis Mode",
};

function regimeBadgeClass(regime) {
  return REGIME_COLORS[regime] || "badge-ghost";
}

function regimeDisplayLabel(regime) {
  return REGIME_LABELS[regime] || regime;
}

function getHeatColor(value) {
  const abs = Math.abs(value);
  if (abs > 0.7) return "bg-error/60";
  if (abs > 0.4) return "bg-warning/60";
  return "bg-success/40";
}

function getRhoColor(value) {
  if (value > 0.7) return "text-error";
  if (value > 0.4) return "text-warning";
  return "text-success";
}

/**
 * StatusBadge — small pill indicator for feature availability
 */
function StatusBadge({ status }) {
  const config = {
    available: { className: "badge-success", label: "Available" },
    unavailable: { className: "badge-error", label: "Unavailable" },
    loading: { className: "badge-warning", label: "Checking..." },
    partial: { className: "badge-warning", label: "Partial" },
  };
  const { className, label } = config[status] || config.unavailable;

  return (
    <span className={`badge badge-sm ${className}`}>
      {status === "loading" && (
        <span className="loading loading-spinner loading-xs mr-1"></span>
      )}
      {label}
    </span>
  );
}

/**
 * MetricCard — summary metric display card
 */
function MetricCard({ label, value, subtext, icon }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-base-content/50 uppercase tracking-wide">
            {label}
          </span>
          {icon && <span className="text-base-content/30">{icon}</span>}
        </div>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {subtext && (
          <div className="text-xs text-base-content/40 mt-1">{subtext}</div>
        )}
      </div>
    </div>
  );
}

/**
 * ComingSoonCard — friendly placeholder for features not yet deployed
 */
function ComingSoonCard({ title, description, icon, onRetry }) {
  return (
    <div className="card bg-base-200 shadow-lg border border-base-300/50">
      <div className="card-body p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className="badge badge-info badge-sm badge-outline mt-0.5">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Info message */}
        <div className="bg-info/5 border border-info/15 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-info shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-base-content/70 leading-relaxed">
                {description}
              </p>
              <p className="text-xs text-base-content/40 mt-2">
                The backend service for this feature is being deployed. Check
                back soon!
              </p>
            </div>
          </div>
        </div>

        {/* Retry button */}
        {onRetry && (
          <div className="mt-3 flex justify-end">
            <button
              className="btn btn-xs btn-ghost gap-1 text-info"
              onClick={onRetry}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              Check Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CorrelationDetection — correlation analysis section
 */
function CorrelationDetection({ symbols, positions, onCorrelationData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [hint, setHint] = useState(null);
  const [endpointAvailable, setEndpointAvailable] = useState(null); // null=unknown, true, false
  const hasAutoFired = useRef(false);

  const detect = useCallback(async () => {
    if (symbols.length < 2) {
      setError("At least 2 symbols required");
      setHint(
        "Add more positions to your portfolio to enable correlation detection",
      );
      setErrorCode("INSUFFICIENT_SYMBOLS");
      return;
    }

    // Skip if we already know the endpoint is not deployed
    if (endpointAvailable === false) {
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setHint(null);

    try {
      const res = await fetch("/api/portfolio/correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || `Request failed (${res.status})`);
        setErrorCode(result.code || "UNKNOWN");
        setHint(result.hint || null);
        setData(null);

        // Mark endpoint as unavailable so we don't keep retrying
        if (result.code === "ENDPOINT_NOT_DEPLOYED" || res.status === 404) {
          setEndpointAvailable(false);
        }
        return;
      }

      setData(result);
      setEndpointAvailable(true);

      // Propagate correlation data to parent so the top-level metric card updates
      if (onCorrelationData) {
        onCorrelationData(result);
      }
    } catch (err) {
      setError(err.message || "Network error");
      setErrorCode("NETWORK_ERROR");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbols, endpointAvailable, onCorrelationData]);

  // Auto-detect when we have enough symbols (only once)
  useEffect(() => {
    if (
      symbols.length >= 2 &&
      !data &&
      !loading &&
      !hasAutoFired.current &&
      endpointAvailable !== false
    ) {
      hasAutoFired.current = true;
      detect();
    }
  }, [symbols.length]);

  // If endpoint is known to be unavailable, show Coming Soon card
  if (endpointAvailable === false && !loading) {
    return (
      <ComingSoonCard
        title="Correlation Detection"
        description="Analyze how your portfolio assets move together. Detect correlation regimes and identify diversification opportunities across your holdings."
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-info"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        }
        onRetry={() => {
          setEndpointAvailable(null);
          hasAutoFired.current = false;
          setData(null);
          setError(null);
          setErrorCode(null);
          setHint(null);
          detect();
        }}
      />
    );
  }

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-warning"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-sm">Correlation Detection</h3>
              <span className="text-xs text-base-content/40">
                {symbols.length} symbol{symbols.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button
            className={`btn btn-warning gap-1 min-h-[44px] sm:min-h-0 sm:btn-sm ${loading ? "btn-disabled" : ""}`}
            onClick={detect}
            disabled={loading || symbols.length < 2}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
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
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            Detect
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-3">
            <span className="loading loading-spinner loading-md text-warning"></span>
            <span className="text-sm text-base-content/60">
              Analyzing correlations...
            </span>
          </div>
        )}

        {/* Error State (non-deployment errors only, deployment errors show ComingSoon) */}
        {!loading && error && errorCode !== "ENDPOINT_NOT_DEPLOYED" && (
          <div
            className={`alert ${errorCode === "INSUFFICIENT_SYMBOLS" || errorCode === "SERVICE_STARTING" ? "alert-warning" : "alert-error"} py-3`}
          >
            <div className="flex-1">
              {errorCode === "INSUFFICIENT_SYMBOLS" ? (
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              ) : errorCode === "SERVICE_STARTING" ? (
                <span className="loading loading-spinner loading-sm shrink-0"></span>
              ) : (
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
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <div>
                <div className="font-medium text-sm">{error}</div>
                {hint && <div className="text-xs opacity-70 mt-1">{hint}</div>}
              </div>
            </div>
            <button className="btn btn-xs btn-ghost" onClick={detect}>
              {errorCode === "SERVICE_STARTING" ? "Retry Now" : "Retry"}
            </button>
          </div>
        )}

        {/* Success State — Correlation Matrix */}
        {!loading && !error && data && (
          <div className="space-y-3">
            {/* Correlation Regime */}
            {data.regime_label && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-base-content/50">Regime:</span>
                <span className={`badge badge-sm ${regimeBadgeClass(data.regime_label)}`}>
                  {regimeDisplayLabel(data.regime_label)}
                </span>
                {data.confidence != null && (
                  <span className="text-xs text-base-content/40">
                    ({((data.confidence || 0) * 100).toFixed(0)}% confidence)
                  </span>
                )}
              </div>
            )}

            {/* Mean |ρ| and Blended Risk Multiplier */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-base-300/50 rounded-lg p-2">
                <div className="text-xs text-base-content/40">Mean |ρ|</div>
                <div className={`font-mono font-bold text-lg ${getRhoColor(data.mean_abs_correlation || 0)}`}>
                  {(data.mean_abs_correlation || 0).toFixed(3)}
                </div>
              </div>
              <div className="bg-base-300/50 rounded-lg p-2">
                <div className="text-xs text-base-content/40">Blended Risk</div>
                <div className="font-mono font-bold text-lg">
                  {(data.blended_risk_multiplier || 1).toFixed(2)}x
                </div>
              </div>
            </div>

            {/* Correlation Heatmap Table — Desktop */}
            {data.correlation_matrix && (
              <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="table table-sm text-xs">
                    <thead>
                      <tr>
                        <th></th>
                        {symbols.map((s) => (
                          <th key={s} className="text-center font-mono">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {symbols.map((rowSym, i) => (
                        <tr key={rowSym}>
                          <td className="font-mono font-medium">{rowSym}</td>
                          {symbols.map((colSym, j) => {
                            const val = data.correlation_matrix?.[i]?.[j];
                            const numVal =
                              typeof val === "number" ? val : parseFloat(val);
                            return (
                              <td
                                key={colSym}
                                className="text-center p-1"
                              >
                                <div
                                  className={`${isNaN(numVal) ? "" : getHeatColor(numVal)} rounded px-2 py-1`}
                                >
                                  <span className="font-mono text-xs">
                                    {isNaN(numVal) ? "—" : numVal.toFixed(2)}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Correlation Pairs — Mobile */}
                <div className="sm:hidden space-y-1">
                  {(() => {
                    const pairs = [];
                    for (let i = 0; i < symbols.length; i++) {
                      for (let j = i + 1; j < symbols.length; j++) {
                        const val = data.correlation_matrix?.[i]?.[j];
                        const numVal = typeof val === "number" ? val : parseFloat(val);
                        if (!isNaN(numVal)) {
                          pairs.push({ symbol1: symbols[i], symbol2: symbols[j], correlation: numVal });
                        }
                      }
                    }
                    pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
                    return pairs.map((pair, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-base-200 rounded">
                        <span className="text-sm">{pair.symbol1} ↔ {pair.symbol2}</span>
                        <span className={`badge badge-sm ${Math.abs(pair.correlation) > 0.7 ? 'badge-error' : Math.abs(pair.correlation) > 0.4 ? 'badge-warning' : 'badge-success'}`}>
                          {pair.correlation.toFixed(2)}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}

            {/* Summary Info */}
            {data.summary && (
              <div className="text-xs text-base-content/50 bg-base-300/30 rounded-lg p-3">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(data.summary, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Empty/Idle State — no symbols */}
        {!loading && !error && !data && symbols.length < 2 && (
          <div className="text-center py-6 text-base-content/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-2 opacity-40"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <p className="text-sm">
              Need at least 2 symbols for correlation analysis
            </p>
            <p className="text-xs mt-1">
              Open more positions or add symbols to enable detection
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PortfolioOptimizer — portfolio optimization section
 */
function PortfolioOptimizer({ positions, totalValue }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [hint, setHint] = useState(null);
  const [endpointAvailable, setEndpointAvailable] = useState(null); // null=unknown, true, false

  const optimize = useCallback(async () => {
    if (!positions || positions.length === 0) {
      setError("No positions to optimize");
      setHint("Open some positions first to enable portfolio optimization");
      setErrorCode("NO_POSITIONS");
      return;
    }

    // Skip if we already know the endpoint is not deployed
    if (endpointAvailable === false) {
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setHint(null);

    try {
      const posData = positions.map((p) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty) || 0,
        market_value: parseFloat(p.market_value) || 0,
        current_price: parseFloat(p.current_price) || 0,
      }));

      const res = await fetch("/api/portfolio/optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: posData }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || `Request failed (${res.status})`);
        setErrorCode(result.code || "UNKNOWN");
        setHint(result.hint || null);
        setData(null);

        // Mark endpoint as unavailable so we don't keep retrying
        if (result.code === "ENDPOINT_NOT_DEPLOYED" || res.status === 404) {
          setEndpointAvailable(false);
        }
        return;
      }

      setData(result);
      setEndpointAvailable(true);
    } catch (err) {
      setError(err.message || "Network error");
      setErrorCode("NETWORK_ERROR");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [positions, endpointAvailable]);

  // If endpoint is known to be unavailable, show Coming Soon card
  if (endpointAvailable === false && !loading) {
    return (
      <ComingSoonCard
        title="Portfolio Optimizer"
        description="Find the optimal asset allocation for your portfolio using mean-variance optimization. Get recommended weight adjustments to maximize risk-adjusted returns."
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-info"
          >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9Z" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        }
        onRetry={() => {
          setEndpointAvailable(null);
          setData(null);
          setError(null);
          setErrorCode(null);
          setHint(null);
          optimize();
        }}
      />
    );
  }

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-warning"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9Z" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-sm">Portfolio Optimizer</h3>
              <span className="text-xs text-base-content/40">
                {positions?.length || 0} position
                {positions?.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button
            className={`btn btn-warning gap-1 min-h-[44px] sm:min-h-0 sm:btn-sm ${loading ? "btn-disabled" : ""}`}
            onClick={optimize}
            disabled={loading || !positions || positions.length === 0}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
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
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9Z" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            )}
            Optimize
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-3">
            <span className="loading loading-spinner loading-md text-warning"></span>
            <span className="text-sm text-base-content/60">
              Optimizing portfolio allocation...
            </span>
          </div>
        )}

        {/* Error State (non-deployment errors only) */}
        {!loading && error && errorCode !== "ENDPOINT_NOT_DEPLOYED" && (
          <div
            className={`alert ${errorCode === "NO_POSITIONS" || errorCode === "SERVICE_STARTING" ? "alert-warning" : "alert-error"} py-3`}
          >
            <div className="flex-1">
              {errorCode === "NO_POSITIONS" ? (
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              ) : errorCode === "SERVICE_STARTING" ? (
                <span className="loading loading-spinner loading-sm shrink-0"></span>
              ) : (
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
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <div>
                <div className="font-medium text-sm">{error}</div>
                {hint && <div className="text-xs opacity-70 mt-1">{hint}</div>}
              </div>
            </div>
            <button className="btn btn-xs btn-ghost" onClick={optimize}>
              {errorCode === "SERVICE_STARTING" ? "Retry Now" : "Retry"}
            </button>
          </div>
        )}

        {/* Success State — Optimized Weights */}
        {!loading && !error && data && (
          <div className="space-y-3">
            {/* Optimal Weights */}
            {data.optimal_weights && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/50 uppercase mb-2">
                  Optimal Allocation
                </h4>
                <div className="space-y-2">
                  {Object.entries(data.optimal_weights).map(
                    ([symbol, weight]) => {
                      const pct =
                        typeof weight === "number"
                          ? weight * 100
                          : parseFloat(weight) * 100;
                      const isNaN_ = isNaN(pct);
                      return (
                        <div key={symbol} className="flex items-center gap-3">
                          <span className="font-mono text-sm w-20">
                            {symbol}
                          </span>
                          <div className="flex-1 bg-base-300 rounded-full h-3 overflow-hidden">
                            <div
                              className="bg-warning h-full rounded-full transition-all"
                              style={{
                                width: isNaN_
                                  ? "0%"
                                  : `${Math.min(Math.abs(pct), 100)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-sm w-16 text-right">
                            {isNaN_ ? "—" : `${pct.toFixed(1)}%`}
                          </span>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {/* Key Metrics */}
            {data.expected_return != null && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-base-300/30 rounded-lg p-2">
                  <div className="text-xs text-base-content/40">
                    Expected Return
                  </div>
                  <div className="font-mono font-bold text-success">
                    {(typeof data.expected_return === "number"
                      ? data.expected_return * 100
                      : parseFloat(data.expected_return) * 100
                    ).toFixed(2)}
                    %
                  </div>
                </div>
                <div className="bg-base-300/30 rounded-lg p-2">
                  <div className="text-xs text-base-content/40">
                    Optimal Risk
                  </div>
                  <div className="font-mono font-bold text-warning">
                    {(typeof data.optimal_risk === "number"
                      ? data.optimal_risk * 100
                      : parseFloat(data.optimal_risk || 0) * 100
                    ).toFixed(2)}
                    %
                  </div>
                </div>
              </div>
            )}

            {/* Sharpe Ratio */}
            {data.sharpe_ratio != null && (
              <div className="bg-base-300/30 rounded-lg p-2">
                <div className="text-xs text-base-content/40">Sharpe Ratio</div>
                <div className="font-mono font-bold text-lg">
                  {typeof data.sharpe_ratio === "number"
                    ? data.sharpe_ratio.toFixed(3)
                    : data.sharpe_ratio}
                </div>
              </div>
            )}

            {/* Raw Data Toggle */}
            <details className="mt-2">
              <summary className="text-xs text-base-content/40 cursor-pointer hover:text-base-content/60">
                View raw optimization data
              </summary>
              <pre className="text-xs text-base-content/50 bg-base-300/30 rounded-lg p-3 mt-2 overflow-x-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Empty/Idle State — no positions */}
        {!loading &&
          !error &&
          !data &&
          (!positions || positions.length === 0) && (
            <div className="text-center py-6 text-base-content/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-2 opacity-40"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9Z" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              <p className="text-sm">No positions to optimize</p>
              <p className="text-xs mt-1">
                Open positions to enable portfolio optimization
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

/**
 * PortfolioOverview — main portfolio page component
 * Shows summary metrics + Correlation Detection + Portfolio Optimizer
 */
export default function PortfolioOverview({ positions = [], account = null, lastUpdated = null }) {
  // Extract symbol list from positions
  const symbols = positions.map((p) => p.symbol).filter(Boolean);

  // Correlation data state — lifted from child so the top metric card can show it
  const [corrData, setCorrData] = useState(null);

  // Calculate portfolio metrics
  const totalValue = positions.reduce(
    (sum, p) => sum + (parseFloat(p.market_value) || 0),
    0,
  );
  const totalExposure =
    positions.length > 0
      ? (positions.reduce(
          (sum, p) => sum + (parseFloat(p.market_value) || 0),
          0,
        ) /
          (parseFloat(account?.equity) || totalValue || 1)) *
        100
      : 0;

  // Simple VaR estimation (5th percentile based on position concentration)
  const concentrationRisk =
    positions.length > 0
      ? Math.max(
          ...positions.map(
            (p) => (parseFloat(p.market_value) || 0) / totalValue,
          ),
        )
      : 0;
  const estimatedVaR =
    positions.length > 0
      ? (concentrationRisk * 0.25 * 100).toFixed(1) // rough 95% VaR estimate
      : 0;

  // Derive correlation regime display for the metric card
  const corrRegimeValue = corrData?.regime_label
    ? regimeDisplayLabel(corrData.regime_label)
    : "—";
  const corrRegimeSubtext = corrData?.regime_label
    ? `Risk ${(corrData.blended_risk_multiplier || 1).toFixed(2)}x`
    : "Requires correlation data";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">
            Portfolio Overview
          </h1>
          <span className="badge badge-primary badge-sm">v3.0</span>
        </div>
        {lastUpdated && (
          <span className="text-xs text-base-content/40">
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Summary Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Portfolio VaR 95"
          value={`${estimatedVaR}%`}
          subtext={
            positions.length > 0
              ? `${positions.length} position${positions.length !== 1 ? "s" : ""}`
              : "No positions"
          }
          icon="📊"
        />
        <MetricCard
          label="Active Symbols"
          value={symbols.length.toString()}
          subtext={
            symbols.length > 0
              ? symbols.slice(0, 3).join(", ") +
                (symbols.length > 3 ? "..." : "")
              : "None"
          }
          icon="📈"
        />
        <MetricCard
          label="Corr Regime"
          value={corrRegimeValue}
          subtext={corrRegimeSubtext}
          icon="🔗"
        />
        <MetricCard
          label="Exposure"
          value={`${Math.min(totalExposure, 100).toFixed(0)}%`}
          subtext={
            totalValue > 0
              ? `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "$0.00"
          }
          icon="💰"
        />
      </div>

      {/* Correlation & Optimization Section */}
      <div>
        <div className="divider text-base-content/40 uppercase tracking-wider text-sm font-semibold">
          Correlation & Optimization
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CorrelationDetection
          symbols={symbols}
          positions={positions}
          onCorrelationData={setCorrData}
        />
        <PortfolioOptimizer positions={positions} totalValue={totalValue} />
      </div>
    </div>
  );
}
