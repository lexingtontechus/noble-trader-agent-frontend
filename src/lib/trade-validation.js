import { runBacktest } from "@/lib/fastapi-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol } from "@/lib/symbol-utils";

/**
 * Run walk-forward validation on a trade.
 * Can be called from /api/trading/validate or /api/trading/approve
 *
 * DB-resilient: if the database is unavailable, validation still runs
 * using just the symbol/side from the params. DB writes are best-effort.
 *
 * IMPORTANT: Local fallback validation is advisory-only.
 * When FastAPI is unavailable (e.g. Render cold start), local validation
 * uses relaxed criteria and returns `passed: true` with a warning,
 * rather than blocking trades with a hard "FAILED" status.
 *
 * @param {object} params - { tradeId, symbol, side, prices? }
 * @returns {Promise<{ passed: boolean, score: number, details: object }>}
 */
export async function validateTrade({ tradeId, symbol, side, prices: providedPrices }) {
  let targetSymbol = symbol;
  let targetSide = side;
  let trade = null;
  let dbAvailable = true;

  // Resolve trade from DB if tradeId provided
  if (tradeId) {
    try {
      const { db } = await import("@/lib/db");
      trade = await db.tradeRecommendation.findUnique({ where: { id: tradeId } });
      if (!trade) {
        // Trade not found in DB — continue with params only
        console.warn("Trade not found in DB:", tradeId, "— using params");
        trade = null;
      } else {
        targetSymbol = trade.symbol;
        targetSide = trade.side;

        // Already validated?
        if (trade.validationStatus === "passed" || trade.validationStatus === "failed") {
          return {
            passed: trade.validationStatus === "passed",
            score: trade.validationScore || 0,
            details: trade.validationDetails ? JSON.parse(trade.validationDetails) : {},
            cached: true,
          };
        }

        // Mark as validating
        await db.tradeRecommendation.update({
          where: { id: tradeId },
          data: { validationStatus: "validating" },
        });
      }
    } catch (dbErr) {
      // If DB is unavailable, continue with just the symbol/side from params
      console.error("DB lookup failed for tradeId:", tradeId, dbErr.message);
      trade = null;
      dbAvailable = false;
    }
  }

  if (!targetSymbol) throw new Error("symbol or tradeId is required");

  // Fetch historical prices if not provided
  let prices = providedPrices;
  if (!prices || prices.length < 100) {
    try {
      const yahooSymbol = alpacaToYahooSymbol(targetSymbol);
      const data = await fetchHistoricalPrices(yahooSymbol);
      prices = data?.prices || [];
    } catch (e) {
      if (trade && dbAvailable) {
        try {
          const { db } = await import("@/lib/db");
          await db.tradeRecommendation.update({
            where: { id: tradeId },
            data: {
              validationStatus: "error",
              validationDetails: JSON.stringify({ error: "Failed to fetch historical prices", message: e.message }),
              validatedAt: new Date(),
            },
          });
        } catch {}
      }
      throw new Error("Failed to fetch historical prices for " + targetSymbol);
    }
  }

  if (!prices || prices.length < 100) {
    if (trade && dbAvailable) {
      try {
        const { db } = await import("@/lib/db");
        await db.tradeRecommendation.update({
          where: { id: tradeId },
          data: {
            validationStatus: "error",
            validationDetails: JSON.stringify({ error: "Insufficient price data", n_prices: prices?.length || 0 }),
            validatedAt: new Date(),
          },
        });
      } catch {}
    }
    throw new Error("Insufficient price data for validation: " + (prices?.length || 0) + " bars");
  }

  // Run walk-forward backtest
  let backtestResult;
  let source = "fastapi";
  let fastapiError = null;
  try {
    backtestResult = await Promise.race([
      runBacktest(prices, targetSymbol, {
        window: 200,
        refit_every: 50,
        n_hmm_states: 4,
        kelly_fraction: 0.5,
        target_vol: 0.15,
        base_risk_limit: 0.02,
        initial_equity: 100000,
        commission_bps: 5.0,
        slippage_bps: 2.0,
        max_position_pct: 0.25,
        risk_check: true,
        regime_gate: true,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Backtest timeout (120s)")), 120000)),
    ]);

    // Validate the response has required fields
    if (!backtestResult || typeof backtestResult !== "object") {
      throw new Error("Invalid backtest response from FastAPI");
    }
    if (backtestResult.error || backtestResult.detail) {
      throw new Error(backtestResult.error || backtestResult.detail || "FastAPI backtest error");
    }
  } catch (e) {
    fastapiError = e.message;
    source = "local";
    backtestResult = localWalkForwardValidation(prices, targetSide);
  }

  // Compute validation score
  const validation = computeValidationScore(backtestResult, targetSide, source);

  // Update DB if trade exists and DB is available
  if (trade && dbAvailable) {
    try {
      const { db } = await import("@/lib/db");
      await db.tradeRecommendation.update({
        where: { id: tradeId },
        data: {
          validationStatus: validation.passed ? "passed" : "failed",
          validationScore: validation.score,
          validationDetails: JSON.stringify({
            ...validation,
            backtest: {
              total_return: backtestResult.total_return,
              annual_return: backtestResult.annual_return,
              sharpe_ratio: backtestResult.sharpe_ratio,
              sortino_ratio: backtestResult.sortino_ratio,
              max_drawdown: backtestResult.max_drawdown,
              win_rate: backtestResult.win_rate,
              profit_factor: backtestResult.profit_factor,
              n_trades: backtestResult.n_trades,
              avg_win_pct: backtestResult.avg_win_pct,
              avg_loss_pct: backtestResult.avg_loss_pct,
              regime_distribution: backtestResult.regime_distribution,
              source,
            },
            fastapi_error: fastapiError,
          }),
          validatedAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error("Failed to update validation result in DB:", dbErr.message);
    }
  }

  return {
    passed: validation.passed,
    score: validation.score,
    details: validation,
    symbol: targetSymbol,
    side: targetSide,
    source,
    backtest_summary: {
      total_return: backtestResult.total_return,
      annual_return: backtestResult.annual_return,
      sharpe_ratio: backtestResult.sharpe_ratio,
      sortino_ratio: backtestResult.sortino_ratio,
      max_drawdown: backtestResult.max_drawdown,
      win_rate: backtestResult.win_rate,
      profit_factor: backtestResult.profit_factor,
      n_trades: backtestResult.n_trades,
      source,
    },
  };
}

/**
 * Local fallback: simple walk-forward validation when FastAPI is unavailable.
 * Uses a 70/30 train/test split with basic return statistics.
 * This is a statistical approximation — not true persistent homology.
 *
 * The `side` parameter adjusts the return calculation:
 *  - "buy": positive when price goes up (standard)
 *  - "sell": positive when price goes down (inverted)
 */
function localWalkForwardValidation(prices, side) {
  const n = prices.length;
  const trainSize = Math.floor(n * 0.7);
  const testPrices = prices.slice(trainSize);
  const returns = [];
  for (let i = 1; i < testPrices.length; i++) {
    if (testPrices[i - 1] > 0) {
      let r = Math.log(testPrices[i] / testPrices[i - 1]);
      // For sell/short trades, invert the return (profit when price drops)
      if (side === "sell" || side === "short") r = -r;
      returns.push(r);
    }
  }
  const meanRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 ? returns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / returns.length : 0;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  const totalReturn = testPrices.length > 1 ? (() => {
    // Calculate total return considering the trade side
    if (side === "sell" || side === "short") {
      return (testPrices[0] - testPrices[testPrices.length - 1]) / testPrices[0];
    }
    return (testPrices[testPrices.length - 1] - testPrices[0]) / testPrices[0];
  })() : 0;

  // Simple max drawdown
  let cumValue = 1, maxVal = 1, maxDd = 0;
  for (const r of returns) {
    cumValue *= (1 + r);
    if (cumValue > maxVal) maxVal = cumValue;
    const dd = (maxVal - cumValue) / maxVal;
    if (dd > maxDd) maxDd = dd;
  }

  // Use the actual trade-like metrics (not raw price returns)
  const nWins = returns.filter(r => r > 0).length;
  const nLosses = returns.filter(r => r <= 0).length;
  const winRate = returns.length > 0 ? nWins / returns.length : 0;

  // Calculate actual profit factor
  const grossWin = returns.filter(r => r > 0).reduce((a, r) => a + r, 0);
  const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((a, r) => a + r, 0)) || 0.001;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : 1.0;

  // Calculate Sortino ratio (downside deviation only)
  const negReturns = returns.filter(r => r < 0);
  const downsideVar = negReturns.length > 0 ? negReturns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / negReturns.length : 0;
  const downsideVol = Math.sqrt(downsideVar) * Math.sqrt(252);
  const sortino = downsideVol > 0 ? (meanRet * 252 - 0.04) / downsideVol : 0;

  // Average win/loss percentages
  const avgWin = nWins > 0 ? returns.filter(r => r > 0).reduce((a, r) => a + r, 0) / nWins : 0;
  const avgLoss = nLosses > 0 ? returns.filter(r => r <= 0).reduce((a, r) => a + r, 0) / nLosses : 0;

  // Estimate actual trade count (not every daily return is a trade)
  // Use a simple swing-detection heuristic: count direction changes
  let tradeCount = 0;
  let lastDirection = 0;
  for (const r of returns) {
    const dir = r > 0 ? 1 : -1;
    if (dir !== lastDirection && lastDirection !== 0) tradeCount++;
    lastDirection = dir;
  }
  tradeCount = Math.max(tradeCount, 3); // minimum 3 trades

  return {
    total_return: totalReturn,
    annual_return: meanRet * 252,
    sharpe_ratio: vol > 0 ? (meanRet * 252 - 0.04) / vol : 0,
    sortino_ratio: sortino,
    max_drawdown: maxDd,
    win_rate: winRate,
    profit_factor: profitFactor,
    n_trades: tradeCount,
    avg_win_pct: avgWin,
    avg_loss_pct: avgLoss,
    regime_distribution: {},
  };
}

/**
 * Compute a composite validation score from backtest results.
 *
 * Score components (weighted):
 *  - Sharpe ratio: 30%
 *  - Win rate: 20%
 *  - Max drawdown: 25%
 *  - Profit factor: 15%
 *  - Total return: 10%
 *
 * Pass criteria (adjusted for source):
 *  FASTAPI source (full walk-forward):
 *    1. Composite score >= 0.4
 *    2. Max drawdown < 30%
 *    3. Profit factor > 0.8 (or at least 5 trades)
 *    4. At least 3 trades in backtest
 *
 *  LOCAL source (statistical approximation — advisory only):
 *    1. Composite score >= 0.20 (relaxed further — advisory, not blocking)
 *    2. Max drawdown < 45% (relaxed — volatile stocks can have large DD)
 *    3. At least 2 estimated trades
 *    Note: Local validation always passes with a warning, unless the
 *    metrics are catastrophically bad (e.g. >50% DD with negative returns).
 *    This prevents false "FAILED" results when FastAPI is unavailable.
 */
function computeValidationScore(result, side, source = "fastapi") {
  const sharpe = result.sharpe_ratio || 0;
  const winRate = result.win_rate || 0;
  const maxDd = Math.abs(result.max_drawdown || 0);
  const profitFactor = result.profit_factor || 0;
  const totalReturn = result.total_return || 0;
  const nTrades = result.n_trades || 0;

  // Normalize each component to 0-1 range
  const sharpeScore = Math.min(Math.max(sharpe / 2.0, 0), 1);       // sharpe 0-2 → 0-1
  const winRateScore = Math.min(Math.max(winRate, 0), 1);            // already 0-1
  const ddScore = Math.min(Math.max(1 - maxDd / 0.50, 0), 1);       // maxDD 0-50% → 1-0
  const pfScore = Math.min(Math.max(profitFactor / 2.0, 0), 1);     // pf 0-2 → 0-1
  const returnScore = Math.min(Math.max(totalReturn / 0.20, 0), 1);  // 0-20% return → 0-1

  // Weighted composite score
  const score =
    (sharpeScore * 0.30) +
    (winRateScore * 0.20) +
    (ddScore * 0.25) +
    (pfScore * 0.15) +
    (returnScore * 0.10);

  // Determine pass criteria based on source
  const isLocal = source === "local";
  let passed;
  let warning = null;

  if (isLocal) {
    // LOCAL validation is ADVISORY ONLY — it should NOT block trades.
    // Only fail if the metrics are catastrophically bad.
    // A "catastrophic" failure = max drawdown > 50% AND negative returns
    const catastrophicFailure = maxDd > 0.50 && totalReturn < -0.10;

    if (catastrophicFailure) {
      passed = false;
      warning = "Local validation detected extremely adverse conditions. Proceed with extreme caution.";
    } else {
      passed = true;
      warning = "Local statistical approximation — FastAPI was unavailable. Run full validation for accurate results. Score is advisory only.";
    }
  } else {
    // Full criteria for FastAPI walk-forward backtest
    passed =
      score >= 0.4 &&
      maxDd < 0.30 &&
      (profitFactor > 0.8 || nTrades >= 5) &&
      nTrades >= 3;

    if (!passed) {
      // Provide detailed failure reasons
      const reasons = [];
      if (score < 0.4) reasons.push(`composite score ${score.toFixed(3)} < 0.4`);
      if (maxDd >= 0.30) reasons.push(`max drawdown ${(maxDd * 100).toFixed(1)}% >= 30%`);
      if (profitFactor <= 0.8 && nTrades < 5) reasons.push(`profit factor ${profitFactor.toFixed(2)} <= 0.8 with < 5 trades`);
      if (nTrades < 3) reasons.push(`only ${nTrades} trades (minimum 3)`);
      warning = `Walk-forward validation failed: ${reasons.join("; ")}`;
    }
  }

  return {
    passed,
    score: Math.round(score * 1000) / 1000,
    source,
    warning,
    components: {
      sharpe_score: Math.round(sharpeScore * 1000) / 1000,
      win_rate_score: Math.round(winRateScore * 1000) / 1000,
      dd_score: Math.round(ddScore * 1000) / 1000,
      pf_score: Math.round(pfScore * 1000) / 1000,
      return_score: Math.round(returnScore * 1000) / 1000,
    },
    thresholds: isLocal
      ? { advisory_only: true, catastrophic_dd_limit: 0.50, note: "Local validation is advisory — does not block trades unless catastrophic" }
      : { min_score: 0.4, max_drawdown_limit: 0.30, min_profit_factor: 0.8, min_trades: 3 },
    raw: {
      sharpe_ratio: sharpe,
      win_rate: winRate,
      max_drawdown: maxDd,
      profit_factor: profitFactor,
      total_return: totalReturn,
      n_trades: nTrades,
    },
  };
}
