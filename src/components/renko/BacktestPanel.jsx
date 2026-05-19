"use client";

import { useState, useCallback, useRef } from "react";
import BacktestResults from "./BacktestResults";
import BacktestComparison from "./BacktestComparison";
import ParameterSweep from "./ParameterSweep";
import WalkForwardResults from "./WalkForwardResults";
import MonteCarloResults from "./MonteCarloResults";

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
 * SSE streaming fetch — reads chunked backtest events from the BFF stream route.
 * Uses fetch() + ReadableStream (not EventSource) because it's a POST request.
 *
 * @param {Object} body - Request body (prices, config, etc.)
 * @param {Function} onProgress - Called with each "progress" event
 * @param {Function} onComplete - Called with the final "complete" event
 * @param {AbortSignal} signal - For cancellation support
 */
async function bffFetchStream(body, { onProgress, onComplete, signal }) {
  const res = await fetch("/api/renko/backtest/run/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new Error(detail?.error || detail?.detail || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("No response body from streaming endpoint");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines — events are separated by double newlines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === "progress") {
            onProgress(event);
          } else if (event.type === "complete") {
            onComplete(event);
          } else if (event.type === "error") {
            throw new Error(event.message || "Streaming backtest error");
          }
        } catch (parseErr) {
          // Skip malformed SSE lines
          if (parseErr.message && !parseErr.message.includes("JSON")) {
            throw parseErr;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * BacktestPanel — 7th tab of the Renko HFT Pipeline.
 *
 * Sections:
 *   1. Mode selector (Run / Compare / Optimize / Walk-Forward / Monte Carlo)
 *   2. Configuration Form — all tunable Renko parameters
 *   3. Action Buttons — trigger backtest via BFF route
 *   4. Results Display — delegates to specialized result components
 *
 * "Run" mode uses SSE streaming for progressive/chunked loading.
 * "Compare", "Optimize", "Walk-Forward", and "Monte Carlo" use standard request/response.
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
  slippage_bps: 2.0,
  commission_bps: 5.0,
  spread_bps: 1.0,
  oco_priority: "sl_first",
  initial_capital: 100000.0,
  universeMode: 'current_constituents',
  indexName: '',
  priceAdjustment: 'raw',
  lookAheadAudit: false,
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
  { key: "walk_forward", label: "Walk-Forward", icon: "🔄", desc: "Walk-forward validation (IS/OOS)" },
  { key: "monte_carlo", label: "Monte Carlo", icon: "🎲", desc: "Monte Carlo permutation test" },
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
      ) : type === "text" ? (
        <input
          type="text"
          className="input input-sm input-bordered font-mono w-full"
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={help}
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
      <ParamInput label="Slippage (bps)" name="slippage_bps" value={config.slippage_bps} onChange={set} step={0.5} min={0} help="adverse fill" />
      <ParamInput label="Commission (bps)" name="commission_bps" value={config.commission_bps} onChange={set} step={0.5} min={0} help="of notional" />
      <ParamInput label="Spread (bps)" name="spread_bps" value={config.spread_bps} onChange={set} step={0.5} min={0} help="bid-ask" />
      <ParamInput label="OCO Priority" name="oco_priority" value={config.oco_priority} onChange={set} type="select" min={[{ value: "sl_first", label: "SL First (Conservative)" }, { value: "tp_first", label: "TP First (Optimistic)" }, { value: "worst_case", label: "Worst Case" }]} help="OCA order" />
      <ParamInput label="Initial Capital ($)" name="initial_capital" value={config.initial_capital} onChange={set} step={10000} min={1000} help="starting capital" />

      {/* ── Data Quality (Phase 5) ────────────────────────────────────────── */}
      <div className="col-span-2 sm:col-span-3 lg:col-span-4 mt-2">
        <div className="divider text-xs text-base-content/40 before:bg-base-300 after:bg-base-300">Data Quality</div>
      </div>
      <ParamInput label="Universe Mode" name="universeMode" value={config.universeMode} onChange={set} type="select" min={[{ value: "current_constituents", label: "Current Constituents" }, { value: "pit_constituents", label: "Point-in-Time (Survivorship Bias Free)" }]} help="stock universe" />
      {config.universeMode === 'pit_constituents' && (
        <ParamInput label="Index Name" name="indexName" value={config.indexName} onChange={set} type="text" help="e.g. sp500" />
      )}
      <ParamInput label="Price Adjustment" name="priceAdjustment" value={config.priceAdjustment} onChange={set} type="select" min={[{ value: "raw", label: "Raw Prices" }, { value: "split_adjusted", label: "Split-Adjusted" }, { value: "fully_adjusted", label: "Fully Adjusted (incl. dividends)" }]} help="corporate actions" />
      <ParamInput label="Look-Ahead Audit" name="lookAheadAudit" value={config.lookAheadAudit} onChange={set} type="toggle" help="bias check" />
    </div>
  );
}

// ── Compare Config Slot ──────────────────────────────────────────────────

function CompareSlot({ index, config, onChange, onRemove, canRemove }) {
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

// ── Walk-Forward Config ─────────────────────────────────────────────────

function WalkForwardConfig({ wfConfig, onChange }) {
  const set = (name, val) => onChange({ ...wfConfig, [name]: val });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      <ParamInput label="Train Window" name="trainWindow" value={wfConfig.trainWindow} onChange={set} min={50} max={1000} step={50} help="ticks for IS" />
      <ParamInput label="Test Window" name="testWindow" value={wfConfig.testWindow} onChange={set} min={10} max={500} step={10} help="ticks for OOS" />
      <ParamInput label="Min Trades (stats)" name="minTradesForStats" value={wfConfig.minTradesForStats} onChange={set} min={1} max={30} help="skip windows below" />
    </div>
  );
}

// ── Monte Carlo Config ─────────────────────────────────────────────────

function MonteCarloConfig({ mcConfig, onChange }) {
  const set = (name, val) => onChange({ ...mcConfig, [name]: val });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      <ParamInput label="Simulations" name="nSimulations" value={mcConfig.nSimulations} onChange={set} min={100} max={5000} step={100} help="permutation count" />
    </div>
  );
}

// ── Progress Bar Component ──────────────────────────────────────────────────

function StreamingProgressBar({ progress }) {
  if (!progress) return null;
  const { chunk, total_chunks, percent, bricks_so_far, ticks_so_far } = progress;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-base-content/70">
            Streaming backtest...
          </span>
          <span className="text-xs font-mono text-base-content/50">
            chunk {chunk}/{total_chunks}
          </span>
        </div>
        <progress
          className="progress progress-primary w-full"
          value={percent}
          max="100"
        />
        <div className="flex items-center gap-4 text-[10px] text-base-content/40 font-mono">
          <span>{ticks_so_far} ticks</span>
          <span>{bricks_so_far} bricks</span>
          <span>{percent}%</span>
        </div>
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
  const [walkForwardResult, setWalkForwardResult] = useState(null);
  const [monteCarloResult, setMonteCarloResult] = useState(null);

  // Streaming progress state
  const [streamProgress, setStreamProgress] = useState(null);

  // AbortController ref for cancellation
  const abortRef = useRef(null);

  // Config state
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [compareConfigs, setCompareConfigs] = useState([
    { ...DEFAULT_CONFIG, label: "Conservative", sl_bricks: 4, tp_bricks: 6 },
    { ...DEFAULT_CONFIG, label: "Aggressive", sl_bricks: 2, tp_bricks: 4 },
  ]);
  const [paramGrid, setParamGrid] = useState({ sl_bricks: [2, 3, 4], tp_bricks: [4, 5, 6] });

  // Walk-forward config
  const [wfConfig, setWfConfig] = useState({
    trainWindow: 200,
    testWindow: 50,
    minTradesForStats: 5,
  });

  // Monte Carlo config
  const [mcConfig, setMcConfig] = useState({
    nSimulations: 1000,
  });

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

  // ── Run backtest (SSE streaming) ──────────────────────────────────────
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRunResult(null);
    setStreamProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const prices = getPrices();

      await bffFetchStream(
        { prices, symbol, ...config },
        {
          onProgress: (event) => {
            // Update progress bar
            setStreamProgress({
              chunk: event.chunk,
              total_chunks: event.total_chunks,
              percent: event.percent,
              bricks_so_far: event.bricks_so_far,
              ticks_so_far: event.ticks_so_far,
            });

            // Render partial results in real-time
            setRunResult({
              symbol,
              total_ticks: event.ticks_so_far,
              total_bricks: event.bricks_so_far,
              stats: event.stats_so_far || {},
              trades: event.trades_so_far || [],
              config_used: config,
              _streaming: true, // Flag to indicate partial data
            });
          },
          onComplete: (event) => {
            // Final result — normalize to match BacktestResults expected shape
            const journalStats = event.stats?.journal || event.stats || {};
            setRunResult({
              symbol,
              total_ticks: event.total_ticks,
              total_bricks: event.total_bricks,
              stats: journalStats,
              trades: event.trades || [],
              config_used: event.config_used || config,
              cached: event.cached || false,
              _streaming: false,
            });
          },
          signal: controller.signal,
        }
      );
    } catch (e) {
      if (e.name === "AbortError") {
        // User cancelled — keep partial results if any
      } else {
        setError(e.message || "Backtest failed");
      }
    } finally {
      setLoading(false);
      setStreamProgress(null);
      abortRef.current = null;
    }
  }, [config, symbol, getPrices]);

  // ── Cancel streaming backtest ──────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setStreamProgress(null);
  }, []);

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

  // ── Walk-Forward validation ──────────────────────────────────────────
  const handleWalkForward = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWalkForwardResult(null);
    try {
      const prices = getPrices();
      const result = await bffFetch("walk-forward", {
        prices,
        symbol,
        ...config,
        trainWindow: wfConfig.trainWindow,
        testWindow: wfConfig.testWindow,
        minTradesForStats: wfConfig.minTradesForStats,
      }, 300000);
      setWalkForwardResult(result);
    } catch (e) {
      setError(e.message || "Walk-forward validation failed");
    } finally {
      setLoading(false);
    }
  }, [config, wfConfig, symbol, getPrices]);

  // ── Monte Carlo permutation test ─────────────────────────────────────
  const handleMonteCarlo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMonteCarloResult(null);
    try {
      const prices = getPrices();
      const result = await bffFetch("monte-carlo", {
        prices,
        symbol,
        ...config,
        nSimulations: mcConfig.nSimulations,
      }, 300000);
      setMonteCarloResult(result);
    } catch (e) {
      setError(e.message || "Monte Carlo analysis failed");
    } finally {
      setLoading(false);
    }
  }, [config, mcConfig, symbol, getPrices]);

  // ── Reset ────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunResult(null);
    setCompareResult(null);
    setOptimizeResult(null);
    setWalkForwardResult(null);
    setMonteCarloResult(null);
    setError(null);
    setStreamProgress(null);
    setLoading(false);
  };

  const hasResult = runResult || compareResult || optimizeResult || walkForwardResult || monteCarloResult;

  // ── Determine handler and label for current mode ──────────────────────
  const getModeHandler = () => {
    switch (mode) {
      case "run": return handleRun;
      case "compare": return handleCompare;
      case "optimize": return handleOptimize;
      case "walk_forward": return handleWalkForward;
      case "monte_carlo": return handleMonteCarlo;
      default: return handleRun;
    }
  };

  const getModeLabel = () => {
    switch (mode) {
      case "run": return "🚀 Run Backtest";
      case "compare": return "⚖️ Compare Configs";
      case "optimize": return "🔍 Run Optimization";
      case "walk_forward": return "🔄 Run Walk-Forward";
      case "monte_carlo": return "🎲 Run Monte Carlo";
      default: return "🚀 Run Backtest";
    }
  };

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
            title={m.desc}
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
              {mode === "walk_forward" && "Walk-Forward Configuration"}
              {mode === "monte_carlo" && "Monte Carlo Configuration"}
            </h4>
            {(mode === "run" || mode === "walk_forward" || mode === "monte_carlo") && (
              <button
                className="btn btn-xs btn-ghost ml-auto"
                onClick={() => setConfig({ ...DEFAULT_CONFIG })}
              >
                Reset Defaults
              </button>
            )}
          </div>

          {(mode === "run" || mode === "walk_forward" || mode === "monte_carlo") && (
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

          {mode === "walk_forward" && (
            <div className="mt-4 space-y-3">
              <div className="divider text-xs text-base-content/40 before:bg-base-300 after:bg-base-300">Walk-Forward Settings</div>
              <WalkForwardConfig wfConfig={wfConfig} onChange={setWfConfig} />
            </div>
          )}

          {mode === "monte_carlo" && (
            <div className="mt-4 space-y-3">
              <div className="divider text-xs text-base-content/40 before:bg-base-300 after:bg-base-300">Monte Carlo Settings</div>
              <MonteCarloConfig mcConfig={mcConfig} onChange={setMcConfig} />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          className={`btn btn-primary ${loading && mode !== "run" ? "btn-disabled" : ""}`}
          onClick={getModeHandler()}
          disabled={loading && mode !== "run"}
        >
          {loading && mode === "run" ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              {streamProgress
                ? `Chunk ${streamProgress.chunk}/${streamProgress.total_chunks}...`
                : "Starting..."}
            </>
          ) : loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              Running...
            </>
          ) : (
            getModeLabel()
          )}
        </button>

        {/* Cancel button (visible during streaming) */}
        {loading && mode === "run" && (
          <button className="btn btn-error btn-sm" onClick={handleCancel}>
            ✕ Cancel
          </button>
        )}

        {hasResult && !loading && (
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
            Clear Results
          </button>
        )}
      </div>

      {/* Streaming Progress Bar */}
      {streamProgress && mode === "run" && (
        <StreamingProgressBar progress={streamProgress} />
      )}

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
      {(runResult?.cached || compareResult?._cached || optimizeResult?._cached || walkForwardResult?._cached || monteCarloResult?._cached) && (
        <div className="alert alert-info alert-sm py-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs">Result served from Redis cache (1h TTL). Identical config = instant response.</span>
        </div>
      )}

      {/* Results Display */}
      {mode === "run" && runResult && (
        <BacktestResults result={runResult} symbol={symbol} streaming={runResult._streaming} />
      )}
      {mode === "compare" && compareResult && (
        <BacktestComparison result={compareResult} symbol={symbol} />
      )}
      {mode === "optimize" && optimizeResult && (
        <ParameterSweep result={optimizeResult} symbol={symbol} config={config} />
      )}
      {mode === "walk_forward" && walkForwardResult && (
        <WalkForwardResults result={walkForwardResult} symbol={symbol} />
      )}
      {mode === "monte_carlo" && monteCarloResult && (
        <MonteCarloResults result={monteCarloResult} symbol={symbol} />
      )}
    </div>
  );
}
