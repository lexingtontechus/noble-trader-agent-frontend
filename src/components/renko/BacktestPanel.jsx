"use client";

import { useState, useCallback } from "react";
import BacktestResults from "./BacktestResults";
import BacktestComparison from "./BacktestComparison";
import ParameterSweep from "./ParameterSweep";

// ── BFF fetch helpers (avoids importing renko-client.js which pulls in server-only Clerk) ──

async function bffFetch(path, body, timeoutMs = 120000) {
  const res = await fetch(`/api/renko/backtest/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new Error(detail?.error || detail?.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * BacktestPanel — 7th tab of the Renko HFT Pipeline.
 *
 * Sections:
 *   1. Mode selector (Run / Compare / Optimize)
 *   2. Configuration Form — all tunable Renko parameters
 *   3. Action Buttons — trigger backtest via BFF route
 *   4. Results Display — delegates to BacktestResults / BacktestComparison / ParameterSweep
 */

// ── Default config values (match backend RenkoConfig) ──────────────────────

const DEFAULT_CONFIG = {
  brick_size: 0.5,
  brick_size_mode: "fixed",
  reversal_bricks: 2,
  bull_trigger_n: 3,
  bear_trigger_n: 3,
  sl_bricks: 3,
  tp_bricks: 5,
  trailing_stop: true,
  trail_after_bricks: 3,
  trail_distance_bricks: 2,
  max_trades_per_session: 15,
  max_daily_loss_bricks: 10.0,
  max_consecutive_losses: 3,
  cooldown_seconds: 30.0,
  regime_gate: true,
};

// ── Price Source Options ──────────────────────────────────────────────────

const PRICE_SOURCES = [
  { value: "demo_300", label: "Demo 300 ticks (random walk)" },
  { value: "demo_500", label: "Demo 500 ticks (trending)" },
  { value: "demo_1000", label: "Demo 1000 ticks (regime shifts)" },
];

function generateDemoPrices(n = 300, mode = "random") {
  const prices = [100.0];
  for (let i = 1; i < n; i++) {
    let drift = 0.0005;
    let vol = 0.015;
    if (mode === "trending") {
      drift = i < n / 2 ? 0.002 : -0.001;
      vol = 0.012;
    } else if (mode === "regime") {
      const third = n / 3;
      if (i < third) {
        drift = 0.002;
        vol = 0.01;
      } else if (i < third * 2) {
        drift = -0.003;
        vol = 0.04;
      } else {
        drift = 0.002;
        vol = 0.01;
      }
    }
    const ret = drift + vol * (Math.random() * 2 - 1);
    prices.push(prices[i - 1] * (1 + ret));
  }
  return prices.map((p) => Math.round(p * 100) / 100);
}

// ── Sub-modes ────────────────────────────────────────────────────────────

const MODES = [
  { key: "run", label: "Run Backtest", icon: "🚀", desc: "Run a single backtest with your config" },
  { key: "compare", label: "Compare", icon: "⚖️", desc: "Compare 2-3 configs side-by-side" },
  { key: "optimize", label: "Optimize", icon: "🔍", desc: "Grid search over parameter ranges" },
];

// ── Parameter Input ──────────────────────────────────────────────────────

function ParamInput({ label, name, value, onChange, type = "number", min, max, step, help }) {
  return (
    <div className="form-control">
      <label className="label py-1">
        <span className="label-text text-xs font-medium">{label}</span>
        {help && (
          <span className="label-text-alt text-[10px] text-base-content/30">{help}</span>
        )}
      </label>
      {type === "number" ? (
        <input
          type="number"
          className="input input-sm input-bordered font-mono w-full"
          value={value}
          onChange={(e) => onChange(name, parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step || 1}
        />
      ) : type === "select" ? (
        <select
          className="select select-sm select-bordered font-mono w-full"
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
        >
          {min.map((opt) => (
            <option key={opt.value ?? opt} value={opt.value ?? opt}>
              {opt.label ?? opt}
            </option>
          ))}
        </select>
      ) : type === "toggle" ? (
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={value}
          onChange={(e) => onChange(name, e.target.checked)}
        />
      ) : null}
    </div>
  );
}

// ── Config Form Section ──────────────────────────────────────────────────

function ConfigForm({ config, onChange, prefix = "" }) {
  const set = (name, val) => onChange({ ...config, [name]: val });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
      <ParamInput label="Brick Size" name="brick_size" value={config.brick_size} onChange={set} step={0.05} min={0.05} help="dollars" />
      <ParamInput label="Mode" name="brick_size_mode" value={config.brick_size_mode} onChange={set} type="select" min={[{ value: "fixed", label: "Fixed" }, { value: "atr", label: "ATR" }, { value: "dynamic", label: "Dynamic" }]} />
      <ParamInput label="Reversal Bricks" name="reversal_bricks" value={config.reversal_bricks} onChange={set} min={1} max={5} />
      <ParamInput label="Bull Trigger N" name="bull_trigger_n" value={config.bull_trigger_n} onChange={set} min={1} max={10} />
      <ParamInput label="Bear Trigger N" name="bear_trigger_n" value={config.bear_trigger_n} onChange={set} min={1} max={10} />
      <ParamInput label="SL Bricks" name="sl_bricks" value={config.sl_bricks} onChange={set} min={1} max={20} help="stop-loss" />
      <ParamInput label="TP Bricks" name="tp_bricks" value={config.tp_bricks} onChange={set} min={1} max={20} help="take-profit" />
      <ParamInput label="Trailing Stop" name="trailing_stop" value={config.trailing_stop} onChange={set} type="toggle" />
      <ParamInput label="Trail After (br)" name="trail_after_bricks" value={config.trail_after_bricks} onChange={set} min={1} max={10} />
      <ParamInput label="Trail Distance (br)" name="trail_distance_bricks" value={config.trail_distance_bricks} onChange={set} min={1} max={10} />
      <ParamInput label="Max Trades/Session" name="max_trades_per_session" value={config.max_trades_per_session} onChange={set} min={1} max={50} />
      <ParamInput label="Max Daily Loss (br)" name="max_daily_loss_bricks" value={config.max_daily_loss_bricks} onChange={set} step={0.5} min={1} />
      <ParamInput label="Max Consec. Losses" name="max_consecutive_losses" value={config.max_consecutive_losses} onChange={set} min={1} max={10} />
      <ParamInput label="Cooldown (sec)" name="cooldown_seconds" value={config.cooldown_seconds} onChange={set} step={5} min={0} />
      <ParamInput label="Regime Gate" name="regime_gate" value={config.regime_gate} onChange={set} type="toggle" help="HMM filter" />
    </div>
  );
}

// ── Compare Config Slot ──────────────────────────────────────────────────

function CompareSlot({ index, config, onChange, onRemove, canRemove }) {
  const label = config.label || `Config ${String.fromCharCode(65 + index)}`;
  return (
    <div className="bg-base-300/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <input
          type="text"
          className="input input-xs input-bordered font-semibold w-36"
          value={config.label}
          onChange={(e) => onChange({ ...config, label: e.target.value })}
          placeholder={`Config ${String.fromCharCode(65 + index)}`}
        />
        {canRemove && (
          <button className="btn btn-xs btn-ghost text-error" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      <ConfigForm config={config} onChange={(newCfg) => onChange(newCfg)} />
    </div>
  );
}

// ── Optimize Param Grid ─────────────────────────────────────────────────

function ParamGridEditor({ paramGrid, onChange }) {
  const SWEEPABLE_PARAMS = [
    { key: "sl_bricks", label: "SL Bricks", min: 1, max: 10 },
    { key: "tp_bricks", label: "TP Bricks", min: 1, max: 10 },
    { key: "brick_size", label: "Brick Size", min: 0.1, max: 2.0, step: 0.1 },
    { key: "bull_trigger_n", label: "Bull Trigger", min: 1, max: 6 },
    { key: "bear_trigger_n", label: "Bear Trigger", min: 1, max: 6 },
    { key: "trail_after_bricks", label: "Trail After", min: 1, max: 8 },
    { key: "trail_distance_bricks", label: "Trail Distance", min: 1, max: 6 },
    { key: "max_trades_per_session", label: "Max Trades", min: 5, max: 30 },
  ];

  const addParam = (key) => {
    if (paramGrid[key]) return;
    const paramDef = SWEEPABLE_PARAMS.find((p) => p.key === key);
    if (!paramDef) return;
    const step = paramDef.step || 1;
    const values = [];
    for (let v = paramDef.min; v <= Math.min(paramDef.max, paramDef.min + step * 4); v += step) {
      values.push(Math.round(v * 100) / 100);
    }
    onChange({ ...paramGrid, [key]: values });
  };

  const removeParam = (key) => {
    const newGrid = { ...paramGrid };
    delete newGrid[key];
    onChange(newGrid);
  };

  const updateValues = (key, valuesStr) => {
    const values = valuesStr
      .split(",")
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v));
    onChange({ ...paramGrid, [key]: values });
  };

  // Estimate total combinations
  const comboCount = Object.values(paramGrid).reduce((acc, vals) => acc * (vals?.length || 1), 1);
  const overLimit = comboCount > 50;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-base-content/70">Parameter Grid</span>
        <span className={`badge badge-xs ${overLimit ? "badge-error" : comboCount > 0 ? "badge-success" : "badge-ghost"}`}>
          {comboCount} combos {overLimit && "(max 50!)"}
        </span>
      </div>

      {/* Existing grid entries */}
      {Object.entries(paramGrid).map(([key, values]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs font-mono w-32 text-base-content/60">{key}</span>
          <input
            type="text"
            className="input input-xs input-bordered font-mono flex-1"
            value={values.join(", ")}
            onChange={(e) => updateValues(key, e.target.value)}
            placeholder="1, 2, 3"
          />
          <button className="btn btn-xs btn-ghost text-error" onClick={() => removeParam(key)}>
            ✕
          </button>
        </div>
      ))}

      {/* Add param dropdown */}
      <div className="flex items-center gap-2">
        <select
          className="select select-xs select-bordered"
          value=""
          onChange={(e) => {
            if (e.target.value) addParam(e.target.value);
          }}
        >
          <option value="" disabled>
            + Add parameter...
          </option>
          {SWEEPABLE_PARAMS.filter((p) => !paramGrid[p.key]).map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function BacktestPanel({ symbol = "SPY" }) {
  const [mode, setMode] = useState("run");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [priceSource, setPriceSource] = useState("demo_300");

  // Result state
  const [runResult, setRunResult] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);

  // Config state
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [compareConfigs, setCompareConfigs] = useState([
    { ...DEFAULT_CONFIG, label: "Conservative", sl_bricks: 4, tp_bricks: 6 },
    { ...DEFAULT_CONFIG, label: "Aggressive", sl_bricks: 2, tp_bricks: 4 },
  ]);
  const [paramGrid, setParamGrid] = useState({ sl_bricks: [2, 3, 4], tp_bricks: [4, 5, 6] });

  // ── Price generation ──────────────────────────────────────────────────
  const getPrices = useCallback(() => {
    switch (priceSource) {
      case "demo_300":
        return generateDemoPrices(300, "random");
      case "demo_500":
        return generateDemoPrices(500, "trending");
      case "demo_1000":
        return generateDemoPrices(1000, "regime");
      default:
        return generateDemoPrices(300, "random");
    }
  }, [priceSource]);

  // ── Run backtest ──────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRunResult(null);
    try {
      const prices = getPrices();
      const result = await bffFetch("run", { prices, symbol, ...config });
      setRunResult(result);
    } catch (e) {
      setError(e.message || "Backtest failed");
    } finally {
      setLoading(false);
    }
  }, [config, symbol, getPrices]);

  // ── Compare backtests ────────────────────────────────────────────────
  const handleCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCompareResult(null);
    try {
      const prices = getPrices();
      const configs = compareConfigs.map((c) => {
        const { label, ...params } = c;
        return { label, ...params };
      });
      const result = await bffFetch("compare", { prices, symbol, configs }, 180000);
      setCompareResult(result);
    } catch (e) {
      setError(e.message || "Compare failed");
    } finally {
      setLoading(false);
    }
  }, [compareConfigs, symbol, getPrices]);

  // ── Optimize backtest ────────────────────────────────────────────────
  const handleOptimize = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOptimizeResult(null);
    try {
      const prices = getPrices();
      const result = await bffFetch("optimize", { prices, symbol, param_grid: paramGrid, ...config }, 300000);
      setOptimizeResult(result);
    } catch (e) {
      setError(e.message || "Optimize failed");
    } finally {
      setLoading(false);
    }
  }, [config, paramGrid, symbol, getPrices]);

  // ── Reset ────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRunResult(null);
    setCompareResult(null);
    setOptimizeResult(null);
    setError(null);
  };

  const hasResult = runResult || compareResult || optimizeResult;

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`btn btn-sm ${mode === m.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setMode(m.key);
              handleReset();
            }}
          >
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {/* Price Source Selector */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-base-content/60">Price Data:</span>
            <select
              className="select select-xs select-bordered"
              value={priceSource}
              onChange={(e) => setPriceSource(e.target.value)}
            >
              {PRICE_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="badge badge-xs badge-ghost">
              {symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <span className="text-xs">⚙️</span>
            </div>
            <h4 className="font-semibold text-sm">
              {mode === "run" && "Backtest Configuration"}
              {mode === "compare" && "Compare Configurations"}
              {mode === "optimize" && "Base Configuration + Parameter Grid"}
            </h4>
            {mode === "run" && (
              <button
                className="btn btn-xs btn-ghost ml-auto"
                onClick={() => setConfig({ ...DEFAULT_CONFIG })}
              >
                Reset Defaults
              </button>
            )}
          </div>

          {mode === "run" && (
            <ConfigForm config={config} onChange={setConfig} />
          )}

          {mode === "compare" && (
            <div className="space-y-4">
              {compareConfigs.map((cfg, i) => (
                <CompareSlot
                  key={i}
                  index={i}
                  config={cfg}
                  onChange={(newCfg) => {
                    const updated = [...compareConfigs];
                    updated[i] = newCfg;
                    setCompareConfigs(updated);
                  }}
                  onRemove={() => {
                    setCompareConfigs(compareConfigs.filter((_, j) => j !== i));
                  }}
                  canRemove={compareConfigs.length > 2}
                />
              ))}
              {compareConfigs.length < 5 && (
                <button
                  className="btn btn-sm btn-outline btn-primary"
                  onClick={() =>
                    setCompareConfigs([
                      ...compareConfigs,
                      { ...DEFAULT_CONFIG, label: `Config ${String.fromCharCode(65 + compareConfigs.length)}` },
                    ])
                  }
                >
                  + Add Config
                </button>
              )}
            </div>
          )}

          {mode === "optimize" && (
            <div className="space-y-4">
              {/* Base config */}
              <details className="collapse collapse-arrow bg-base-300/30 rounded-lg">
                <summary className="collapse-title text-xs font-semibold py-2 min-h-0">
                  Base Configuration (applied to every run)
                </summary>
                <div className="collapse-content pt-0">
                  <ConfigForm config={config} onChange={setConfig} />
                </div>
              </details>
              {/* Param grid */}
              <ParamGridEditor paramGrid={paramGrid} onChange={setParamGrid} />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          className={`btn btn-primary ${loading ? "btn-disabled" : ""}`}
          onClick={mode === "run" ? handleRun : mode === "compare" ? handleCompare : handleOptimize}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              Running...
            </>
          ) : (
            <>
              {mode === "run" && "🚀 Run Backtest"}
              {mode === "compare" && "⚖️ Compare Configs"}
              {mode === "optimize" && "🔍 Run Optimization"}
            </>
          )}
        </button>
        {hasResult && (
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
            Clear Results
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error alert-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Cache Indicator */}
      {(runResult?._cached || compareResult?._cached || optimizeResult?._cached) && (
        <div className="alert alert-info alert-sm py-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs">Result served from Redis cache (1h TTL). Identical config = instant response.</span>
        </div>
      )}

      {/* Results Display */}
      {mode === "run" && runResult && (
        <BacktestResults result={runResult} symbol={symbol} />
      )}
      {mode === "compare" && compareResult && (
        <BacktestComparison result={compareResult} symbol={symbol} />
      )}
      {mode === "optimize" && optimizeResult && (
        <ParameterSweep result={optimizeResult} symbol={symbol} config={config} />
      )}
    </div>
  );
}
