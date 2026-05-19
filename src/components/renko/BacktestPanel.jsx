"use client";

import { useState } from "react";

const DEFAULT_BACKTEST_CONFIG = {
  symbol: "SPY",
  brick_size: 0.5,
  sl_bricks: 3,
  tp_bricks: 5,
  // Phase 2: Transaction costs
  slippage_bps: 2.0,
  commission_bps: 5.0,
  spread_bps: 1.0,
  // Phase 7: Execution modeling
  market_impact_mode: "none",
  adv_shares: 10000000,
  fill_probability_mode: "always_fill",
  borrow_rate_bps: 50,
  margin_rate_bps: 150,
  is_hard_to_borrow: false,
  dividend_yield_bps: 200,
  initial_capital: 100000,
  // Phase 6: Statistical rigor
  n_trials: 1,
  confidence_level: 0.95,
};

/**
 * BacktestPanel — Configure and run backtests with Phase 2-7 parameters.
 * Uses bffFetch prop (renkoApiFetch from RenkoPage) for API calls.
 * Extended with Deep Analysis (Phase 6+7 dedicated endpoints).
 */
export default function BacktestPanel({
  bffFetch,
  onResult,
  onOptimizeResult,
  onSignificanceTests,
  onExecutionModelDetail,
}) {
  const [config, setConfig] = useState(DEFAULT_BACKTEST_CONFIG);
  const [running, setRunning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const updateConfig = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleRunBacktest = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await bffFetch("backtest-run", {
        method: "POST",
        body: config,
      });
      if (onResult) onResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setError(null);
    try {
      const data = await bffFetch("backtest-optimize", {
        method: "POST",
        body: {
          ...config,
          brick_sizes: [0.25, 0.5, 1.0],
          sl_bricks_range: [2, 3, 4],
          tp_bricks_range: [4, 5, 6],
        },
      });
      if (onOptimizeResult) onOptimizeResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setOptimizing(false);
    }
  };

  /**
   * Deep Analysis — Calls dedicated Phase 6+7 endpoints for full statistical
   * rigor and execution modeling detail. These return richer data than the
   * inline backtest response.
   */
  const handleDeepAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      // Call both endpoints in parallel
      const [rigorData, execData] = await Promise.allSettled([
        bffFetch("statistics-rigor", {
          method: "POST",
          body: config,
        }),
        bffFetch("execution-model", {
          method: "POST",
          body: config,
        }),
      ]);

      // Unwrap results — pass dedicated data to specialized callbacks
      if (rigorData.status === "fulfilled" && rigorData.value) {
        const rigor = rigorData.value;
        if (onSignificanceTests) onSignificanceTests(rigor.significance_tests);
      }

      if (execData.status === "fulfilled" && execData.value) {
        const exec = execData.value;
        if (onExecutionModelDetail) onExecutionModelDetail(exec);
      }

      // Check for failures
      if (rigorData.status === "rejected" && execData.status === "rejected") {
        throw new Error(
          `Deep analysis failed: ${rigorData.reason?.message || "Unknown error"}`
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Basic Configuration */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <span className="text-xs">📊</span>
            </div>
            <h4 className="font-semibold text-sm">Backtest Configuration</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Symbol</span>
              </label>
              <input
                type="text"
                className="input input-sm input-bordered w-full font-mono"
                value={config.symbol}
                onChange={(e) => updateConfig("symbol", e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Brick Size ($)</span>
              </label>
              <input
                type="number"
                step="0.1"
                className="input input-sm input-bordered w-full font-mono"
                value={config.brick_size}
                onChange={(e) => updateConfig("brick_size", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">SL Bricks</span>
              </label>
              <input
                type="number"
                className="input input-sm input-bordered w-full font-mono"
                value={config.sl_bricks}
                onChange={(e) => updateConfig("sl_bricks", parseInt(e.target.value) || 3)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">TP Bricks</span>
              </label>
              <input
                type="number"
                className="input input-sm input-bordered w-full font-mono"
                value={config.tp_bricks}
                onChange={(e) => updateConfig("tp_bricks", parseInt(e.target.value) || 5)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Phase 2: Transaction Costs */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
              <span className="text-xs">💸</span>
            </div>
            <h4 className="font-semibold text-sm">Transaction Costs</h4>
            <span className="badge badge-xs badge-ghost">Phase 2</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Slippage (bps)</span>
                <span className="label-text-alt text-[10px] text-base-content/40">Price impact</span>
              </label>
              <input
                type="number"
                step="0.5"
                className="input input-sm input-bordered w-full font-mono"
                value={config.slippage_bps}
                onChange={(e) => updateConfig("slippage_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Commission (bps)</span>
                <span className="label-text-alt text-[10px] text-base-content/40">Per trade</span>
              </label>
              <input
                type="number"
                step="0.5"
                className="input input-sm input-bordered w-full font-mono"
                value={config.commission_bps}
                onChange={(e) => updateConfig("commission_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Spread (bps)</span>
                <span className="label-text-alt text-[10px] text-base-content/40">Bid-ask</span>
              </label>
              <input
                type="number"
                step="0.5"
                className="input input-sm input-bordered w-full font-mono"
                value={config.spread_bps}
                onChange={(e) => updateConfig("spread_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Phase 7: Execution Modeling */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <span className="text-xs">⚡</span>
            </div>
            <h4 className="font-semibold text-sm">Execution Modeling</h4>
            <span className="badge badge-xs badge-ghost">Phase 7</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Market Impact</span>
              </label>
              <select
                className="select select-sm select-bordered w-full font-mono"
                value={config.market_impact_mode}
                onChange={(e) => updateConfig("market_impact_mode", e.target.value)}
              >
                <option value="none">None</option>
                <option value="almgren_chriss">Almgren-Chriss</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Fill Probability</span>
              </label>
              <select
                className="select select-sm select-bordered w-full font-mono"
                value={config.fill_probability_mode}
                onChange={(e) => updateConfig("fill_probability_mode", e.target.value)}
              >
                <option value="always_fill">Always Fill</option>
                <option value="realistic">Realistic</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">ADV (shares)</span>
                <span className="label-text-alt text-[10px] text-base-content/40">Avg daily vol</span>
              </label>
              <input
                type="number"
                className="input input-sm input-bordered w-full font-mono"
                value={config.adv_shares}
                onChange={(e) => updateConfig("adv_shares", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Borrow Rate (bps/yr)</span>
              </label>
              <input
                type="number"
                step="10"
                className="input input-sm input-bordered w-full font-mono"
                value={config.borrow_rate_bps}
                onChange={(e) => updateConfig("borrow_rate_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Margin Rate (bps/yr)</span>
              </label>
              <input
                type="number"
                step="10"
                className="input input-sm input-bordered w-full font-mono"
                value={config.margin_rate_bps}
                onChange={(e) => updateConfig("margin_rate_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label cursor-pointer py-1">
                <div>
                  <span className="label-text text-xs">Hard to Borrow</span>
                  <div className="text-[10px] text-base-content/40">
                    Short restriction
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-primary"
                  checked={config.is_hard_to_borrow}
                  onChange={(e) => updateConfig("is_hard_to_borrow", e.target.checked)}
                />
              </label>
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Div Yield (bps)</span>
              </label>
              <input
                type="number"
                step="10"
                className="input input-sm input-bordered w-full font-mono"
                value={config.dividend_yield_bps}
                onChange={(e) => updateConfig("dividend_yield_bps", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Capital ($)</span>
              </label>
              <input
                type="number"
                step="10000"
                className="input input-sm input-bordered w-full font-mono"
                value={config.initial_capital}
                onChange={(e) => updateConfig("initial_capital", parseFloat(e.target.value) || 100000)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Phase 6: Statistical Rigor */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <span className="text-xs">🔬</span>
            </div>
            <h4 className="font-semibold text-sm">Statistical Rigor</h4>
            <span className="badge badge-xs badge-ghost">Phase 6</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">N Trials (for DSR)</span>
                <span className="label-text-alt text-[10px] text-base-content/40">
                  Multiple testing trials
                </span>
              </label>
              <input
                type="number"
                className="input input-sm input-bordered w-full font-mono"
                value={config.n_trials}
                onChange={(e) => updateConfig("n_trials", parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Confidence Level</span>
              </label>
              <select
                className="select select-sm select-bordered w-full font-mono"
                value={config.confidence_level}
                onChange={(e) => updateConfig("confidence_level", parseFloat(e.target.value))}
              >
                <option value="0.9">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <button
            className="btn btn-sm btn-primary flex-1"
            onClick={handleRunBacktest}
            disabled={running || optimizing || analyzing}
          >
            {running ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Running...
              </>
            ) : (
              <>▶ Run Backtest</>
            )}
          </button>
          <button
            className="btn btn-sm btn-secondary flex-1"
            onClick={handleOptimize}
            disabled={running || optimizing || analyzing}
          >
            {optimizing ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Optimizing...
              </>
            ) : (
              <>🔍 Optimize</>
            )}
          </button>
        </div>

        {/* Deep Analysis button — calls Phase 6+7 dedicated endpoints */}
        <button
          className="btn btn-sm btn-outline w-full"
          onClick={handleDeepAnalysis}
          disabled={running || optimizing || analyzing}
        >
          {analyzing ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Analyzing...
            </>
          ) : (
            <>🔬 Deep Analysis (Significance + Execution)</>
          )}
        </button>
      </div>

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
          <span className="text-xs">{error}</span>
        </div>
      )}
    </div>
  );
}
