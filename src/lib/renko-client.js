/**
 * Renko HFT Pipeline API Client
 * Follows the same pattern as fastapi-client.js with retry + auth support.
 */

import { FASTAPI_BASE } from "@/lib/config";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

const DEFAULT_TIMEOUT = 30000;

/**
 * Fetch with retry and exponential backoff for Renko endpoints.
 * Handles Render cold starts gracefully.
 */
async function renkoFetch(path, options = {}) {
  const maxRetries = options.retries ?? 3;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const authHeaders = await getFastAPIAuthHeaders();
      const headers = { ...authHeaders, ...(options.headers || {}) };

      const url = `${RENKO_BASE}${path}`;
      const res = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok) {
        // Guard against Render spin-up returning HTML
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          if (i === maxRetries - 1) {
            throw new Error(
              "Backend service is starting up. Please try again in a moment."
            );
          }
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
        return res;
      }

      if (res.status >= 400 && res.status < 500) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          throw new Error(
            `Backend returned HTML instead of JSON (HTTP ${res.status}). The service may be starting up.`
          );
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      // 5xx — retry
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

// ── GET Endpoints ────────────────────────────────────────────────────────────

/**
 * Get current pipeline state.
 * GET /renko/state?symbol=SPY
 */
export async function getRenkoState(symbol = "SPY") {
  const res = await renkoFetch(`/state?symbol=${encodeURIComponent(symbol)}`);
  return res.json();
}

/**
 * Get comprehensive stats.
 * GET /renko/stats?symbol=SPY
 */
export async function getRenkoStats(symbol = "SPY") {
  const res = await renkoFetch(`/stats?symbol=${encodeURIComponent(symbol)}`);
  return res.json();
}

/**
 * Get recent bricks.
 * GET /renko/bricks?symbol=SPY&last_n=100
 */
export async function getRenkoBricks(symbol = "SPY", lastN = 100) {
  const res = await renkoFetch(
    `/bricks?symbol=${encodeURIComponent(symbol)}&last_n=${lastN}`
  );
  return res.json();
}

/**
 * Get classified bricks with swing labels.
 * GET /renko/classified?symbol=SPY&last_n=100
 */
export async function getRenkoClassified(symbol = "SPY", lastN = 100) {
  const res = await renkoFetch(
    `/classified?symbol=${encodeURIComponent(symbol)}&last_n=${lastN}`
  );
  return res.json();
}

/**
 * Get pattern signals.
 * GET /renko/signals?symbol=SPY&last_n=50
 */
export async function getRenkoSignals(symbol = "SPY", lastN = 50) {
  const res = await renkoFetch(
    `/signals?symbol=${encodeURIComponent(symbol)}&last_n=${lastN}`
  );
  return res.json();
}

/**
 * Get trade records.
 * GET /renko/trades?symbol=SPY&last_n=50
 */
export async function getRenkoTrades(symbol = "SPY", lastN = 50) {
  const res = await renkoFetch(
    `/trades?symbol=${encodeURIComponent(symbol)}&last_n=${lastN}`
  );
  return res.json();
}

/**
 * Get swing points.
 * GET /renko/swing-points?symbol=SPY&last_n=50
 */
export async function getRenkoSwingPoints(symbol = "SPY", lastN = 50) {
  const res = await renkoFetch(
    `/swing-points?symbol=${encodeURIComponent(symbol)}&last_n=${lastN}`
  );
  return res.json();
}

/**
 * Get backtest stats.
 * GET /renko/backtest/stats?symbol=SPY
 */
export async function getRenkoBacktestStats(symbol = "SPY") {
  const res = await renkoFetch(
    `/backtest/stats?symbol=${encodeURIComponent(symbol)}`
  );
  return res.json();
}

/**
 * Run a full Renko pipeline backtest (isolated from live pipeline).
 * POST /renko/backtest/run
 *
 * @param {number[]} prices - Historical price series (min 50 ticks)
 * @param {string} symbol - Trading symbol
 * @param {object} options - Optional Renko config params (brick_size, sl_bricks, etc.)
 * @returns {Promise<object>} RenkoBacktestResponse
 */
export async function runRenkoBacktest(prices, symbol = "SPY", options = {}) {
  const body = {
    prices,
    symbol,
    brick_size: options.brick_size ?? 0.5,
    brick_size_mode: options.brick_size_mode ?? "fixed",
    reversal_bricks: options.reversal_bricks ?? 2,
    bull_trigger_n: options.bull_trigger_n ?? 3,
    bear_trigger_n: options.bear_trigger_n ?? 3,
    sl_bricks: options.sl_bricks ?? 3,
    tp_bricks: options.tp_bricks ?? 5,
    trailing_stop: options.trailing_stop ?? true,
    trail_after_bricks: options.trail_after_bricks ?? 3,
    trail_distance_bricks: options.trail_distance_bricks ?? 2,
    max_trades_per_session: options.max_trades_per_session ?? 15,
    max_daily_loss_bricks: options.max_daily_loss_bricks ?? 10.0,
    max_consecutive_losses: options.max_consecutive_losses ?? 3,
    cooldown_seconds: options.cooldown_seconds ?? 30.0,
    regime_gate: options.regime_gate ?? true,
  };
  if (options.timestamps) body.timestamps = options.timestamps;
  if (options.regimes) body.regimes = options.regimes;
  if (options.signal_confidence_min !== undefined) {
    body.signal_confidence_min = options.signal_confidence_min;
  }

  const res = await renkoFetch(`/backtest/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 120000, // 2 min for heavy computation
  });
  return res.json();
}

/**
 * Compare multiple Renko pipeline configurations side-by-side.
 * POST /renko/backtest/compare
 *
 * @param {number[]} prices - Historical price series (min 50 ticks)
 * @param {string} symbol - Trading symbol
 * @param {object[]} configs - Array of config objects (2-10), each with label + Renko params
 * @param {object} options - Optional overrides (timestamps, regimes)
 * @returns {Promise<object>} RenkoBacktestCompareResponse
 */
export async function compareRenkoBacktests(prices, symbol = "SPY", configs = [], options = {}) {
  const body = {
    prices,
    symbol,
    configs,
  };
  if (options.timestamps) body.timestamps = options.timestamps;
  if (options.regimes) body.regimes = options.regimes;

  const res = await renkoFetch(`/backtest/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 180000, // 3 min for multi-config comparison
  });
  return res.json();
}

/**
 * Run a parameter sweep (grid search) for Renko pipeline optimization.
 * POST /renko/backtest/optimize
 *
 * @param {number[]} prices - Historical price series (min 50 ticks)
 * @param {string} symbol - Trading symbol
 * @param {object} paramGrid - Map of param name to array of values to sweep
 * @param {object} options - Optional fixed params (brick_size, sl_bricks, etc.)
 * @returns {Promise<object>} RenkoBacktestOptimizeResponse
 */
export async function optimizeRenkoBacktest(prices, symbol = "SPY", paramGrid = {}, options = {}) {
  const body = {
    prices,
    symbol,
    param_grid: paramGrid,
    brick_size: options.brick_size ?? 0.5,
    brick_size_mode: options.brick_size_mode ?? "fixed",
    reversal_bricks: options.reversal_bricks ?? 2,
    bull_trigger_n: options.bull_trigger_n ?? 3,
    bear_trigger_n: options.bear_trigger_n ?? 3,
    sl_bricks: options.sl_bricks ?? 3,
    tp_bricks: options.tp_bricks ?? 5,
    trailing_stop: options.trailing_stop ?? true,
    trail_after_bricks: options.trail_after_bricks ?? 3,
    trail_distance_bricks: options.trail_distance_bricks ?? 2,
    max_trades_per_session: options.max_trades_per_session ?? 15,
    max_daily_loss_bricks: options.max_daily_loss_bricks ?? 10.0,
    max_consecutive_losses: options.max_consecutive_losses ?? 3,
    regime_gate: options.regime_gate ?? true,
  };
  if (options.timestamps) body.timestamps = options.timestamps;
  if (options.regimes) body.regimes = options.regimes;

  const res = await renkoFetch(`/backtest/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 300000, // 5 min for parameter sweeps
  });
  return res.json();
}

// ── POST Endpoints ───────────────────────────────────────────────────────────

/**
 * Process a single tick.
 * POST /renko/tick
 */
export async function processRenkoTick(price, symbol = "SPY") {
  const res = await renkoFetch(`/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price, symbol }),
  });
  return res.json();
}

/**
 * Batch process ticks (for backtesting).
 * POST /renko/tick/batch
 */
export async function processRenkoBatch(prices, timestamps, regimes) {
  const body = { prices };
  if (timestamps) body.timestamps = timestamps;
  if (regimes) body.regimes = regimes;

  const res = await renkoFetch(`/tick/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 60000,
  });
  return res.json();
}

/**
 * Update HMM regime.
 * POST /renko/regime
 */
export async function updateRenkoRegime(regime, symbol = "SPY") {
  const res = await renkoFetch(`/regime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regime, symbol }),
  });
  return res.json();
}

/**
 * Update equity.
 * POST /renko/equity
 */
export async function updateRenkoEquity(equity, symbol = "SPY") {
  const res = await renkoFetch(`/equity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equity, symbol }),
  });
  return res.json();
}

/**
 * Update pipeline configuration (resets pipeline).
 * POST /renko/config
 */
export async function updateRenkoConfig(config) {
  const res = await renkoFetch(`/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

/**
 * Reset the pipeline.
 * POST /renko/reset?symbol=SPY
 */
export async function resetRenkoPipeline(symbol = "SPY") {
  const res = await renkoFetch(
    `/reset?symbol=${encodeURIComponent(symbol)}`,
    {
      method: "POST",
    }
  );
  return res.json();
}
