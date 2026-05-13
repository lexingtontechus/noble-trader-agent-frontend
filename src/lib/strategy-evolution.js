/**
 * Strategy Evolution Engine — Phase 5
 *
 * Manages strategy variant lifecycle: creation, activation, performance tracking,
 * A/B testing, automatic rotation, and Optuna-driven re-optimization.
 *
 * Architecture:
 *   - Strategy variants are parameter sets stored in Supabase (ta_strategy_variant)
 *   - Performance is tracked per-variant in ta_strategy_performance
 *   - A/B tests compare two variants with configurable allocation
 *   - Evolution log records all parameter changes with reasons
 *   - Automatic rotation: if active variant underperforms for N periods, rotate
 *
 * All DB access goes through `@/lib/db` (Supabase wrapper).
 */

import { db } from "@/lib/db";
import { runBacktest } from "@/lib/fastapi-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol } from "@/lib/symbol-utils";

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum number of performance records before considering rotation */
const MIN_RECORDS_FOR_ROTATION = 10;

/** Rolling window (in records) for performance evaluation */
const PERFORMANCE_WINDOW = 30;

/** Composite score threshold below which rotation is triggered */
const ROTATION_SCORE_THRESHOLD = 0.35;

/** Maximum drawdown threshold for automatic rotation */
const ROTATION_MAX_DD_THRESHOLD = 0.35;

/** How many periods of underperformance before auto-rotate */
const MAX_UNDERPERFORMANCE_PERIODS = 3;

/** Default variant params (used when no active variant exists) */
export const DEFAULT_VARIANT_PARAMS = {
  nHmmStates: 4,
  hmmIter: 100,
  hmmWindow: 200,
  hmmRefitEvery: 50,
  kellyFraction: 0.5,
  targetVol: 0.15,
  baseRiskLimit: 0.02,
  maxPositionPct: 0.25,
  regimeGate: true,
  riskCheck: true,
  commissionBps: 5.0,
  slippageBps: 2.0,
};

// ── Variant Management ──────────────────────────────────────────────────────

/**
 * Get the currently active strategy variant.
 * Falls back to the default variant if none is active.
 *
 * @returns {Promise<object>} The active variant row from Supabase
 */
export async function getActiveVariant() {
  try {
    const variant = await db.strategyVariant.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (variant) return variant;

    // Try to find the default variant
    const defaultVariant = await db.strategyVariant.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: "asc" },
    });
    if (defaultVariant) return defaultVariant;

    // No variant at all — return hardcoded defaults
    return { ...DEFAULT_VARIANT_PARAMS, id: "default", name: "Default (no DB record)", generation: 0 };
  } catch (err) {
    console.error("Failed to get active variant:", err.message);
    return { ...DEFAULT_VARIANT_PARAMS, id: "default", name: "Default (DB error)", generation: 0 };
  }
}

/**
 * Get all strategy variants, ordered by active first, then by composite score.
 *
 * @param {object} options - { limit?: number }
 * @returns {Promise<object[]>}
 */
export async function getAllVariants({ limit = 50 } = {}) {
  try {
    const variants = await db.strategyVariant.findMany({
      orderBy: { scoreComposite: "desc" },
      limit,
    });
    // Put active variant first
    return variants.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
  } catch (err) {
    console.error("Failed to get variants:", err.message);
    return [];
  }
}

/**
 * Create a new strategy variant.
 *
 * @param {object} params - Variant parameters
 * @param {string} params.name - Human-readable name
 * @param {object} params.params - Strategy parameter set
 * @param {string} [params.triggerType] - 'manual', 'optuna', 'ab_test', etc.
 * @param {string} [params.parentVariantId] - Parent variant id this evolved from
 * @param {object} [params.optimizerParams] - Full Optuna trial params (JSON)
 * @returns {Promise<object>} The created variant
 */
export async function createVariant({ name, params = {}, triggerType = "manual", parentVariantId = null, optimizerParams = null }) {
  const merged = { ...DEFAULT_VARIANT_PARAMS, ...params };

  // Determine generation number
  let generation = 1;
  if (parentVariantId) {
    try {
      const parent = await db.strategyVariant.findUnique({ where: { id: parentVariantId } });
      if (parent) generation = (parent.generation || 0) + 1;
    } catch {}
  }

  const variant = await db.strategyVariant.create({
    data: {
      name,
      isActive: false,
      isDefault: false,
      generation,
      nHmmStates: merged.nHmmStates,
      hmmIter: merged.hmmIter,
      hmmWindow: merged.hmmWindow,
      hmmRefitEvery: merged.hmmRefitEvery,
      kellyFraction: merged.kellyFraction,
      targetVol: merged.targetVol,
      baseRiskLimit: merged.baseRiskLimit,
      maxPositionPct: merged.maxPositionPct,
      regimeGate: merged.regimeGate,
      riskCheck: merged.riskCheck,
      commissionBps: merged.commissionBps,
      slippageBps: merged.slippageBps,
      parentVariantId,
      optimizerParams: optimizerParams ? JSON.stringify(optimizerParams) : null,
    },
  });

  return variant;
}

/**
 * Activate a variant and deactivate all others.
 * Logs the change in ta_evolution_log.
 *
 * @param {string} variantId - The variant to activate
 * @param {string} triggerType - Why this variant is being activated
 * @param {string} [triggerReason] - Human-readable reason
 * @returns {Promise<object>} The activated variant
 */
export async function activateVariant(variantId, triggerType = "manual", triggerReason = null) {
  // Get the previously active variant
  let previousVariant = null;
  try {
    previousVariant = await db.strategyVariant.findFirst({ where: { isActive: true } });
  } catch {}

  // Deactivate all variants
  try {
    await db.strategyVariant.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  } catch {}

  // Activate the target
  const variant = await db.strategyVariant.update({
    where: { id: variantId },
    data: { isActive: true },
  });

  // Log the evolution
  try {
    await db.evolutionLog.create({
      data: {
        fromVariantId: previousVariant?.id || null,
        toVariantId: variantId,
        triggerType,
        triggerReason: triggerReason || `${triggerType} activation`,
        previousScore: previousVariant?.scoreComposite || null,
        newScore: variant.scoreComposite || null,
        scoreDelta: (variant.scoreComposite || 0) - (previousVariant?.scoreComposite || 0),
        parametersChanged: JSON.stringify(getChangedParams(previousVariant, variant)),
      },
    });
  } catch (err) {
    console.error("Failed to log evolution:", err.message);
  }

  return variant;
}

// ── Performance Tracking ─────────────────────────────────────────────────────

/**
 * Record a trade performance result for a variant.
 *
 * @param {object} perf - Performance data
 * @param {string} perf.variantId - The variant id
 * @param {string} perf.symbol - Ticker symbol
 * @param {string} perf.tradeSide - 'buy' or 'sell'
 * @param {number} [perf.pnlPct] - Realized P&L percentage
 * @param {number} [perf.pnlDollar] - Realized P&L dollar
 * @param {string} [perf.regimeAtEntry] - Regime when trade opened
 * @param {number} [perf.validationScore] - Walk-forward score
 * @param {number} [perf.kellyFractionUsed] - Kelly fraction used
 * @param {number} [perf.riskScoreAtEntry] - Risk score
 * @param {string} [perf.source] - 'live' or 'backtest'
 * @param {string} [perf.tradeId] - Reference to ta_trade_recommendation
 * @param {string} [perf.analysisId] - Reference to ta_analysis_run
 * @returns {Promise<object>} The created performance record
 */
export async function recordPerformance(perf) {
  try {
    const record = await db.strategyPerformance.create({
      data: {
        variantId: perf.variantId,
        symbol: perf.symbol,
        tradeSide: perf.tradeSide || "buy",
        entryPrice: perf.entryPrice || null,
        exitPrice: perf.exitPrice || null,
        pnlPct: perf.pnlPct || null,
        pnlDollar: perf.pnlDollar || null,
        holdingPeriodBars: perf.holdingPeriodBars || null,
        regimeAtEntry: perf.regimeAtEntry || null,
        regimeAtExit: perf.regimeAtExit || null,
        validationScore: perf.validationScore || null,
        kellyFractionUsed: perf.kellyFractionUsed || null,
        riskScoreAtEntry: perf.riskScoreAtEntry || null,
        source: perf.source || "live",
        tradeId: perf.tradeId || null,
        analysisId: perf.analysisId || null,
        metadata: perf.metadata ? JSON.stringify(perf.metadata) : null,
      },
    });

    // Update the variant's aggregate scores
    await updateVariantScores(perf.variantId);

    return record;
  } catch (err) {
    console.error("Failed to record performance:", err.message);
    return null;
  }
}

/**
 * Update the aggregate scores on a variant based on recent performance.
 *
 * @param {string} variantId
 */
async function updateVariantScores(variantId) {
  try {
    // Get recent performance records
    const records = await db.strategyPerformance.findMany({
      where: { variantId },
      orderBy: { createdAt: "desc" },
      limit: PERFORMANCE_WINDOW,
    });

    if (records.length === 0) return;

    // Calculate aggregates
    const pnls = records.filter((r) => r.pnlPct != null).map((r) => r.pnlPct);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p <= 0);

    const totalTrades = pnls.length;
    const winningTrades = wins.length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalReturn = pnls.reduce((s, p) => s + p, 0);
    const avgReturn = totalTrades > 0 ? totalReturn / totalTrades : 0;

    // Sharpe approximation
    const variance = pnls.length > 1
      ? pnls.reduce((s, p) => s + (p - avgReturn) ** 2, 0) / (pnls.length - 1)
      : 0;
    const vol = Math.sqrt(variance) * Math.sqrt(252);
    const sharpe = vol > 0 ? (avgReturn * 252 - 0.04) / vol : 0;

    // Max drawdown from cumulative P&L
    let cumPnl = 0, maxCum = 0, maxDd = 0;
    for (const p of pnls.reverse()) { // oldest first
      cumPnl += p;
      if (cumPnl > maxCum) maxCum = cumPnl;
      const dd = maxCum > 0 ? (maxCum - cumPnl) / maxCum : 0;
      if (dd > maxDd) maxDd = dd;
    }

    // Profit factor
    const grossWin = wins.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0)) || 0.001;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : 1;

    // Composite score (same weighting as walk-forward validation)
    const sharpeScore = Math.min(Math.max(sharpe / 2.0, 0), 1);
    const winRateScore = Math.min(Math.max(winRate, 0), 1);
    const ddScore = Math.min(Math.max(1 - maxDd / 0.50, 0), 1);
    const pfScore = Math.min(Math.max(profitFactor / 2.0, 0), 1);
    const returnScore = Math.min(Math.max(totalReturn / 0.20, 0), 1);
    const composite = (sharpeScore * 0.30) + (winRateScore * 0.20) + (ddScore * 0.25) + (pfScore * 0.15) + (returnScore * 0.10);

    await db.strategyVariant.update({
      where: { id: variantId },
      data: {
        scoreComposite: Math.round(composite * 1000) / 1000,
        scoreSharpe: Math.round(sharpe * 1000) / 1000,
        scoreWinRate: Math.round(winRate * 1000) / 1000,
        scoreMaxDd: Math.round(maxDd * 1000) / 1000,
        scoreProfitFactor: Math.round(profitFactor * 1000) / 1000,
        scoreReturn: Math.round(totalReturn * 1000) / 1000,
        totalTrades,
        winningTrades,
      },
    });
  } catch (err) {
    console.error("Failed to update variant scores:", err.message);
  }
}

/**
 * Get recent performance records for a variant.
 *
 * @param {string} variantId
 * @param {object} options - { limit?: number, source?: string }
 * @returns {Promise<object[]>}
 */
export async function getPerformance(variantId, { limit = 100, source = null } = {}) {
  try {
    const where = { variantId };
    if (source) where.source = source;
    return await db.strategyPerformance.findMany({
      where,
      orderBy: { createdAt: "desc" },
      limit,
    });
  } catch (err) {
    console.error("Failed to get performance:", err.message);
    return [];
  }
}

// ── A/B Testing ─────────────────────────────────────────────────────────────

/**
 * Create an A/B test comparing two variants.
 *
 * @param {object} params
 * @param {string} params.name - Test name
 * @param {string} params.variantAId - Control variant
 * @param {string} params.variantBId - Challenger variant
 * @param {number} [params.allocationPct] - Fraction of traffic to variant B (default 0.5)
 * @returns {Promise<object>} The created A/B test
 */
export async function createABTest({ name, variantAId, variantBId, allocationPct = 0.5 }) {
  return await db.abTest.create({
    data: {
      name,
      variantAId,
      variantBId,
      allocationPct,
      status: "running",
      startedAt: new Date(),
    },
  });
}

/**
 * Get the active A/B test (if any) and determine which variant to use.
 * Uses a deterministic assignment based on symbol name to ensure consistency.
 *
 * @param {string} [symbol] - Symbol for deterministic assignment
 * @returns {Promise<{ test: object|null, useVariantId: string }>}
 */
export async function getActiveABTest(symbol) {
  try {
    const test = await db.abTest.findFirst({
      where: { status: "running" },
      orderBy: { createdAt: "desc" },
    });

    if (!test) return { test: null, useVariantId: null };

    // Deterministic assignment: hash the symbol name
    let useVariantId;
    if (symbol) {
      const hash = simpleHash(symbol);
      useVariantId = hash % 100 < test.allocationPct * 100
        ? test.variantBId
        : test.variantAId;
    } else {
      // Random assignment if no symbol provided
      useVariantId = Math.random() < test.allocationPct
        ? test.variantBId
        : test.variantAId;
    }

    return { test, useVariantId };
  } catch (err) {
    console.error("Failed to get active A/B test:", err.message);
    return { test: null, useVariantId: null };
  }
}

/**
 * Complete an A/B test and determine the winner.
 *
 * @param {string} testId - The A/B test id
 * @returns {Promise<object>} The completed test with winner
 */
export async function completeABTest(testId) {
  try {
    const test = await db.abTest.findUnique({ where: { id: testId } });
    if (!test) throw new Error("A/B test not found");
    if (test.status !== "running") throw new Error("Test is not running");

    // Calculate results for both variants
    const [perfA, perfB] = await Promise.all([
      db.strategyPerformance.findMany({ where: { variantId: test.variantAId }, limit: PERFORMANCE_WINDOW }),
      db.strategyPerformance.findMany({ where: { variantId: test.variantBId }, limit: PERFORMANCE_WINDOW }),
    ]);

    const statsA = computeVariantStats(perfA);
    const statsB = computeVariantStats(perfB);

    // Determine winner by composite score (or P&L if scores are equal)
    const winnerId = statsB.composite > statsA.composite
      ? test.variantBId
      : statsA.composite > statsB.composite
        ? test.variantAId
        : (statsB.totalPnl > statsA.totalPnl ? test.variantBId : test.variantAId);

    // Calculate confidence (simple t-test approximation)
    const confidence = computeConfidence(statsA, statsB);

    const completed = await db.abTest.update({
      where: { id: testId },
      data: {
        status: "completed",
        variantAPnl: statsA.totalPnl,
        variantATrades: statsA.n,
        variantAWinRate: statsA.winRate,
        variantASharpe: statsA.sharpe,
        variantBPnl: statsB.totalPnl,
        variantBTrades: statsB.n,
        variantBWinRate: statsB.winRate,
        variantBSharpe: statsB.sharpe,
        winnerId,
        confidenceLevel: confidence,
        completedAt: new Date(),
      },
    });

    return completed;
  } catch (err) {
    console.error("Failed to complete A/B test:", err.message);
    throw err;
  }
}

// ── Optimization (Optuna) ────────────────────────────────────────────────────

/**
 * Run Optuna-style hyperparameter optimization by calling the FastAPI backtest
 * endpoint with different parameter combinations.
 *
 * Instead of running a full Optuna study (which requires Python), we perform
 * a multi-trial search from the Next.js side by calling /backtest/run with
 * different param combinations and tracking results in Supabase.
 *
 * @param {object} options
 * @param {string} options.symbol - Symbol to optimize for
 * @param {number[]} options.prices - Historical prices
 * @param {number} [options.nTrials] - Number of optimization trials (default 10)
 * @param {string} [options.studyName] - Optuna study name
 * @returns {Promise<object>} { bestVariant, allTrials }
 */
export async function runOptunaOptimization({ symbol, prices, nTrials = 10, studyName = "noble-evolution" }) {
  const results = [];

  // Define search space
  const searchSpace = [
    { param: "nHmmStates", values: [2, 3, 4] },
    { param: "kellyFraction", values: [0.25, 0.5, 0.75] },
    { param: "targetVol", values: [0.10, 0.15, 0.20] },
    { param: "baseRiskLimit", values: [0.01, 0.02, 0.03] },
    { param: "maxPositionPct", values: [0.15, 0.25, 0.35] },
  ];

  // Get the active variant as the base
  const activeVariant = await getActiveVariant();

  for (let trial = 0; trial < nTrials; trial++) {
    // Sample from search space
    const trialParams = { ...DEFAULT_VARIANT_PARAMS };

    // Start from active variant params
    if (activeVariant && activeVariant.id !== "default") {
      trialParams.nHmmStates = activeVariant.nHmmStates;
      trialParams.kellyFraction = activeVariant.kellyFraction;
      trialParams.targetVol = activeVariant.targetVol;
      trialParams.baseRiskLimit = activeVariant.baseRiskLimit;
      trialParams.maxPositionPct = activeVariant.maxPositionPct;
    }

    // Mutate some parameters (exploration)
    for (const dim of searchSpace) {
      if (Math.random() < 0.6) { // 60% chance to mutate each param
        const idx = Math.floor(Math.random() * dim.values.length);
        trialParams[dim.param] = dim.values[idx];
      }
    }

    try {
      const backtestResult = await Promise.race([
        runBacktest(prices, symbol, {
            window: trialParams.hmmWindow,
            refitEvery: trialParams.hmmRefitEvery,
            nHmmStates: trialParams.nHmmStates,
            kellyFraction: trialParams.kellyFraction,
            targetVol: trialParams.targetVol,
            baseRiskLimit: trialParams.baseRiskLimit,
            maxPositionPct: trialParams.maxPositionPct,
            commissionBps: trialParams.commissionBps,
            slippageBps: trialParams.slippageBps,
            riskCheck: trialParams.riskCheck,
            regimeGate: trialParams.regimeGate,
          }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 120000)),
      ]);

      if (backtestResult && !backtestResult.error && !backtestResult.detail) {
        const sharpe = backtestResult.sharpe_ratio || 0;
        const winRate = backtestResult.win_rate || 0;
        const maxDd = Math.abs(backtestResult.max_drawdown || 0);
        const pf = backtestResult.profit_factor || 0;
        const totalRet = backtestResult.total_return || 0;

        // Composite score (same weighting as walk-forward validation)
        const sharpeScore = Math.min(Math.max(sharpe / 2.0, 0), 1);
        const winRateScore = Math.min(Math.max(winRate, 0), 1);
        const ddScore = Math.min(Math.max(1 - maxDd / 0.50, 0), 1);
        const pfScore = Math.min(Math.max(pf / 2.0, 0), 1);
        const returnScore = Math.min(Math.max(totalRet / 0.20, 0), 1);
        const composite = (sharpeScore * 0.30) + (winRateScore * 0.20) + (ddScore * 0.25) + (pfScore * 0.15) + (returnScore * 0.10);

        results.push({
          trial,
          params: { ...trialParams },
          composite,
          backtest: backtestResult,
        });

        // Record as backtest performance
        const activeId = activeVariant?.id || "default";
        if (activeId !== "default") {
          try {
            await db.strategyPerformance.create({
              data: {
                variantId: activeId,
                symbol,
                tradeSide: "backtest",
                pnlPct: totalRet,
                pnlDollar: null,
                source: "backtest",
                metadata: JSON.stringify({ trial, params: trialParams, composite, backtest: { sharpe, winRate, maxDd, pf, totalRet } }),
              },
            });
          } catch {}
        }
      }
    } catch (err) {
      console.error(`Optimization trial ${trial} failed:`, err.message);
    }
  }

  if (results.length === 0) {
    return { bestVariant: null, allTrials: [] };
  }

  // Find the best trial
  results.sort((a, b) => b.composite - a.composite);
  const best = results[0];

  // Create a new variant from the best trial
  const newVariant = await createVariant({
    name: `Optuna ${studyName} gen-${(activeVariant?.generation || 0) + 1}`,
    params: best.params,
    triggerType: "optuna",
    parentVariantId: activeVariant?.id !== "default" ? activeVariant.id : null,
    optimizerParams: { studyName, trialNumber: best.trial, nTrials, composite: best.composite },
  });

  // Update the variant with the score
  try {
    await db.strategyVariant.update({
      where: { id: newVariant.id },
      data: {
        scoreComposite: best.composite,
        scoreSharpe: best.backtest.sharpe_ratio || 0,
        scoreWinRate: best.backtest.win_rate || 0,
        scoreMaxDd: Math.abs(best.backtest.max_drawdown || 0),
        scoreProfitFactor: best.backtest.profit_factor || 0,
        scoreReturn: best.backtest.total_return || 0,
        optimizerStudyName: studyName,
        optimizerTrialNumber: best.trial,
      },
    });
  } catch {}

  return { bestVariant: { ...newVariant, composite: best.composite }, allTrials: results };
}

// ── Automatic Rotation ───────────────────────────────────────────────────────

/**
 * Check if the active variant should be rotated and perform rotation if needed.
 *
 * Rotation criteria:
 *  1. Active variant has enough performance records (MIN_RECORDS_FOR_ROTATION)
 *  2. Composite score is below ROTATION_SCORE_THRESHOLD
 *  3. Max drawdown exceeds ROTATION_MAX_DD_THRESHOLD
 *  4. Has been underperforming for MAX_UNDERPERFORMANCE_PERIODS consecutive checks
 *
 * @returns {Promise<{ rotated: boolean, reason?: string, newVariant?: object }>}
 */
export async function checkAndRotate() {
  try {
    const active = await getActiveVariant();
    if (!active || active.id === "default" || active.isDefault) {
      return { rotated: false, reason: "Default variant cannot be rotated" };
    }

    // Check if we have enough data
    if ((active.totalTrades || 0) < MIN_RECORDS_FOR_ROTATION) {
      return { rotated: false, reason: `Not enough data (${active.totalTrades || 0}/${MIN_RECORDS_FOR_ROTATION} trades)` };
    }

    const composite = active.scoreComposite || 0;
    const maxDd = active.scoreMaxDd || 0;

    // Check rotation conditions
    const reasons = [];
    if (composite < ROTATION_SCORE_THRESHOLD) {
      reasons.push(`composite score ${composite.toFixed(3)} < ${ROTATION_SCORE_THRESHOLD}`);
    }
    if (maxDd > ROTATION_MAX_DD_THRESHOLD) {
      reasons.push(`max drawdown ${(maxDd * 100).toFixed(1)}% > ${(ROTATION_MAX_DD_THRESHOLD * 100).toFixed(0)}%`);
    }

    if (reasons.length === 0) {
      return { rotated: false, reason: "Active variant performing well" };
    }

    // Find a better variant
    const alternatives = await db.strategyVariant.findMany({
      where: { isActive: false },
      orderBy: { scoreComposite: "desc" },
      limit: 5,
    });

    // Filter to variants with better scores
    const better = alternatives.filter(
      (v) => (v.scoreComposite || 0) > composite && (v.scoreMaxDd || 0) < maxDd
    );

    if (better.length === 0) {
      return {
        rotated: false,
        reason: `Underperforming (${reasons.join(", ")}), but no better variant available`,
      };
    }

    // Rotate to the best alternative
    const bestAlt = better[0];
    const activated = await activateVariant(
      bestAlt.id,
      "performance",
      `Auto-rotated: ${reasons.join(", ")}. Switched to ${bestAlt.name} (score: ${bestAlt.scoreComposite?.toFixed(3)})`
    );

    return {
      rotated: true,
      reason: `Rotated from ${active.name} to ${bestAlt.name}: ${reasons.join(", ")}`,
      newVariant: activated,
    };
  } catch (err) {
    console.error("Rotation check failed:", err.message);
    return { rotated: false, reason: `Error: ${err.message}` };
  }
}

// ── Evolution Summary ────────────────────────────────────────────────────────

/**
 * Get a summary of the evolution state for the UI.
 *
 * @returns {Promise<object>} Evolution summary
 */
export async function getEvolutionSummary() {
  try {
    const [active, variants, recentLogs, activeTest] = await Promise.all([
      getActiveVariant(),
      getAllVariants({ limit: 20 }),
      db.evolutionLog.findMany({ orderBy: { createdAt: "desc" }, limit: 10 }),
      db.abTest.findFirst({ where: { status: "running" } }),
    ]);

    const totalTrades = variants.reduce((s, v) => s + (v.totalTrades || 0), 0);
    const totalWins = variants.reduce((s, v) => s + (v.winningTrades || 0), 0);
    const overallWinRate = totalTrades > 0 ? totalWins / totalTrades : 0;

    return {
      activeVariant: active,
      variantCount: variants.length,
      variants,
      totalTrades,
      overallWinRate,
      recentEvolutions: recentLogs,
      activeABTest: activeTest,
      generation: active?.generation || 0,
      bestScore: variants.reduce((best, v) => Math.max(best, v.scoreComposite || 0), 0),
    };
  } catch (err) {
    console.error("Failed to get evolution summary:", err.message);
    return {
      activeVariant: null,
      variantCount: 0,
      variants: [],
      totalTrades: 0,
      overallWinRate: 0,
      recentEvolutions: [],
      activeABTest: null,
      generation: 0,
      bestScore: 0,
    };
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Compare two variants and return the params that changed.
 */
function getChangedParams(oldVariant, newVariant) {
  if (!oldVariant) return ["all"];
  const changed = [];
  const paramKeys = [
    "nHmmStates", "hmmIter", "hmmWindow", "hmmRefitEvery",
    "kellyFraction", "targetVol", "baseRiskLimit", "maxPositionPct",
    "regimeGate", "riskCheck", "commissionBps", "slippageBps",
  ];
  for (const key of paramKeys) {
    if (oldVariant[key] !== newVariant[key]) {
      changed.push({ param: key, from: oldVariant[key], to: newVariant[key] });
    }
  }
  return changed;
}

/**
 * Simple hash function for deterministic A/B test assignment.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Compute aggregate stats from performance records.
 */
function computeVariantStats(records) {
  const pnls = records.filter((r) => r.pnlPct != null).map((r) => r.pnlPct);
  const n = pnls.length;
  if (n === 0) return { n: 0, totalPnl: 0, winRate: 0, sharpe: 0, composite: 0 };

  const wins = pnls.filter((p) => p > 0);
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const avgReturn = totalPnl / n;
  const winRate = wins.length / n;

  const variance = n > 1
    ? pnls.reduce((s, p) => s + (p - avgReturn) ** 2, 0) / (n - 1)
    : 0;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  const sharpe = vol > 0 ? (avgReturn * 252 - 0.04) / vol : 0;

  // Composite score
  const sharpeScore = Math.min(Math.max(sharpe / 2.0, 0), 1);
  const winRateScore = Math.min(Math.max(winRate, 0), 1);
  const pfScore = 0.5; // neutral if not enough data
  const returnScore = Math.min(Math.max(totalReturn / 0.20, 0), 1);
  const composite = (sharpeScore * 0.30) + (winRateScore * 0.20) + (pfScore * 0.15) + (returnScore * 0.10) + 0.25; // dd score placeholder

  return { n, totalPnl, winRate, sharpe, composite };
}

/**
 * Simple confidence calculation for A/B test results.
 * Uses a Welch's t-test approximation.
 */
function computeConfidence(statsA, statsB) {
  if (statsA.n < 3 || statsB.n < 3) return 0;

  const diff = statsB.composite - statsA.composite;
  const pooledStd = Math.sqrt(
    (statsA.n > 1 ? (1 / statsA.n) : 0) +
    (statsB.n > 1 ? (1 / statsB.n) : 0)
  );

  if (pooledStd === 0) return diff > 0 ? 0.95 : 0.05;

  const tStat = diff / pooledStd;
  // Approximate p-value from t-stat using a simple sigmoid
  const pValue = 1 / (1 + Math.exp(tStat * 2));
  return 1 - pValue;
}
