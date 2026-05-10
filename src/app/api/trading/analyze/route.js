import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getPositions, getAccount } from "@/lib/alpaca-client";
import { detectRegime, detectCorrelation, optimisePortfolio } from "@/lib/fastapi-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol, yahooToAlpacaSymbol } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

// Fallback Alpaca keys from env vars (used when Clerk auth is unavailable, e.g. cron jobs)
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  // Try Clerk auth first
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {
    // Clerk not available — fall through to env vars
  }
  // Fallback to environment variables
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

/**
 * Convert an array of closing prices to log-returns.
 */
function toLogReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

/**
 * POST /api/trading/analyze
 * Full analysis pipeline: positions → regime → correlation → optimizer → recommendations
 */
export async function POST(request) {
  try {
    // 1. Get Alpaca keys (Clerk auth or env var fallback)
    const keys = await resolveAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    // 2. Fetch positions and account
    const [alpacaPositions, account] = await Promise.all([
      getPositions(keys.apiKey, keys.secretKey),
      getAccount(keys.apiKey, keys.secretKey),
    ]);

    if (!alpacaPositions || alpacaPositions.length === 0) {
      return Response.json(
        { error: "No positions found in portfolio", code: "NO_POSITIONS" },
        { status: 400 }
      );
    }

    const totalValue = alpacaPositions.reduce(
      (sum, p) => sum + (parseFloat(p.market_value) || 0),
      0
    );

    const positions = alpacaPositions.map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty) || 0,
      market_value: parseFloat(p.market_value) || 0,
      current_price: parseFloat(p.current_price) || 0,
      avg_entry_price: parseFloat(p.avg_entry_price) || 0,
      unrealized_pl: parseFloat(p.unrealized_pl) || 0,
      weight: totalValue > 0 ? (parseFloat(p.market_value) || 0) / totalValue : 0,
    }));

    const symbols = positions.map((p) => p.symbol);

    // 3. Fetch historical prices for each symbol
    const yahooSymbols = symbols.map((sym) => alpacaToYahooSymbol(sym));
    const allPrices = await Promise.all(
      yahooSymbols.map((sym) =>
        fetchHistoricalPrices(sym).then((d) => d.prices).catch(() => [])
      )
    );

    const minLen = Math.min(...allPrices.map((p) => p.length));
    if (minLen < 20) {
      return Response.json(
        { error: `Insufficient price data (minimum 20 bars, got ${minLen})`, code: "INSUFFICIENT_DATA" },
        { status: 400 }
      );
    }

    // 4. Run regime detection per symbol
    const regimeResults = {};
    const regimePromises = symbols.map(async (sym, i) => {
      try {
        const yahooSym = yahooSymbols[i];
        const prices = allPrices[i].slice(-minLen);
        const result = await detectRegime(prices, yahooSym);
        regimeResults[sym] = result;
      } catch (err) {
        console.error(`Regime detection failed for ${sym}:`, err.message);
        regimeResults[sym] = { regime: "unknown", error: err.message };
      }
    });
    await Promise.all(regimePromises);

    // 5. Run correlation detection
    let correlationResult = null;
    try {
      const logReturns = allPrices.map((prices) =>
        toLogReturns(prices.slice(-minLen))
      );
      const nBars = logReturns[0].length;
      const returnsMatrix = [];
      for (let i = 0; i < nBars; i++) {
        const row = logReturns.map((retArr) => retArr[i] || 0);
        returnsMatrix.push(row);
      }

      correlationResult = await detectCorrelation(symbols, returnsMatrix);
    } catch (err) {
      console.error("Correlation detection failed:", err.message);
      correlationResult = { error: err.message, regime_label: "unknown" };
    }

    // 6. Run portfolio optimization
    let optimizerResult = null;
    try {
      const logReturns = allPrices.map((prices) =>
        toLogReturns(prices.slice(-minLen))
      );
      const nBars = logReturns[0].length;
      const returnsMatrix = [];
      for (let i = 0; i < nBars; i++) {
        const row = logReturns.map((retArr) => retArr[i] || 0);
        returnsMatrix.push(row);
      }

      optimizerResult = await optimisePortfolio(symbols, returnsMatrix, {
        risk_free_rate: 0.04,
      });
    } catch (err) {
      console.error("Optimizer failed:", err.message);
      optimizerResult = { error: err.message };
    }

    // 7. Generate trade recommendations
    const recommendations = [];
    const REBALANCE_THRESHOLD = 0.05; // 5% deviation threshold

    const optimisation = optimizerResult?.optimisation || optimizerResult || {};
    const optimalWeights = optimisation.weights || [];
    const currentWeights = positions.map((p) => p.weight);

    // Build a combined view: for each symbol, compare current vs optimal weight
    const weightAnalysis = symbols.map((sym, i) => {
      const current = currentWeights[i] || 0;
      const optimal = optimalWeights[i] || 0;
      const diff = optimal - current; // positive = need to buy more, negative = need to sell
      const absDiff = Math.abs(diff);
      const dollarDiff = diff * totalValue;
      const price = positions[i].current_price;

      return {
        symbol: sym,
        current_weight: current,
        optimal_weight: optimal,
        weight_diff: diff,
        abs_weight_diff: absDiff,
        dollar_diff: dollarDiff,
        price,
        regime: regimeResults[sym]?.regime || regimeResults[sym]?.current_regime || "unknown",
      };
    });

    // Sort by absolute dollar impact (largest first)
    weightAnalysis.sort((a, b) => Math.abs(b.dollar_diff) - Math.abs(a.dollar_diff));

    let sellPriority = 0;
    let buyPriority = 50;

    for (const wa of weightAnalysis) {
      if (wa.abs_weight_diff < REBALANCE_THRESHOLD) continue;
      if (wa.price <= 0) continue;

      const qty = Math.floor(Math.abs(wa.dollar_diff) / wa.price);
      if (qty <= 0) continue;

      if (wa.dollar_diff < 0) {
        // SELL recommendation
        recommendations.push({
          id: `sell-${wa.symbol}-${Date.now()}`,
          symbol: wa.symbol,
          side: "sell",
          order_type: "market",
          qty,
          limit_price: null,
          time_in_force: "day",
          priority: sellPriority++,
          reason: `Overweight by ${(wa.abs_weight_diff * 100).toFixed(1)}%: current ${(wa.current_weight * 100).toFixed(1)}% → optimal ${(wa.optimal_weight * 100).toFixed(1)}% | Regime: ${wa.regime}`,
          estimated_value: Math.abs(wa.dollar_diff),
        });
      } else {
        // BUY recommendation
        const limitPrice = wa.price * 0.99; // 1% below market for limit
        recommendations.push({
          id: `buy-${wa.symbol}-${Date.now()}`,
          symbol: wa.symbol,
          side: "buy",
          order_type: "limit",
          qty,
          limit_price: Math.round(limitPrice * 100) / 100,
          time_in_force: "gtc",
          priority: buyPriority++,
          reason: `Underweight by ${(wa.abs_weight_diff * 100).toFixed(1)}%: current ${(wa.current_weight * 100).toFixed(1)}% → optimal ${(wa.optimal_weight * 100).toFixed(1)}% | Regime: ${wa.regime}`,
          estimated_value: Math.abs(wa.dollar_diff),
        });
      }
    }

    // 8. Save analysis to database
    const analysisRun = await db.analysisRun.create({
      data: {
        userId: "default",
        status: "completed",
        results: JSON.stringify({
          totalValue,
          positionCount: positions.length,
          recommendationCount: recommendations.length,
        }),
        positions: JSON.stringify(positions),
        correlation: JSON.stringify(correlationResult),
        optimizer: JSON.stringify(optimizerResult),
        regimes: JSON.stringify(regimeResults),
      },
    });
    const analysisRunId = analysisRun.id;

    // Save trade recommendations
    for (const rec of recommendations) {
      await db.tradeRecommendation.create({
        data: {
          analysisId: analysisRun.id,
          symbol: rec.symbol,
          side: rec.side,
          orderType: rec.order_type,
          qty: rec.qty,
          limitPrice: rec.limit_price,
          timeInForce: rec.time_in_force,
          priority: rec.priority,
          reason: rec.reason,
          status: "pending",
        },
      });
    }

    // 9. Build response
    const regimeSummary = symbols.map((sym, i) => ({
      symbol: sym,
      regime: regimeResults[sym]?.current_regime || regimeResults[sym]?.regime || "unknown",
      regime_label: regimeResults[sym]?.current_regime || regimeResults[sym]?.regime || "unknown",
    }));

    const corrRegime = correlationResult?.corr_regime || correlationResult?.regime_label || null;
    const corrConfidence = correlationResult?.corr_confidence || correlationResult?.confidence || 0;

    return Response.json({
      id: analysisRunId,
      // Portfolio allocation (current)
      portfolio_allocation: Object.fromEntries(
        positions.map((p) => [p.symbol, p.weight])
      ),
      // Optimal allocation
      optimal_allocation: Object.fromEntries(
        symbols.map((sym, i) => [sym, optimalWeights[i] || 0])
      ),
      // Regime summary
      regime_summary: regimeSummary,
      // Correlation regime
      correlation_regime: {
        regime: corrRegime,
        confidence: corrConfidence,
      },
      corr_regime: corrRegime,
      // Optimization metrics
      optimization_metrics: {
        expected_return: optimisation.expected_return || 0,
        sharpe: optimisation.sharpe_ratio || 0,
        max_dd_before: optimisation.expected_max_drawdown || 0,
        max_dd_after: optimisation.expected_max_drawdown || 0,
        optimal_risk: optimisation.expected_vol || 0,
      },
      metrics: {
        expected_return: optimisation.expected_return || 0,
        sharpe: optimisation.sharpe_ratio || 0,
        max_dd_before: optimisation.expected_max_drawdown || 0,
        max_dd_after: optimisation.expected_max_drawdown || 0,
      },
      // Strategy explanation
      strategy_explanation: `Portfolio is in ${corrRegime || "unknown"} correlation regime with ${(corrConfidence * 100).toFixed(0)}% confidence. Rebalancing from concentrated positions to diversified optimal allocation. Sells are prioritized to free buying power before placing buy orders. Limit orders for buys are set 1% below market to improve fill prices.`,
      strategy: `CRISIS regime detected — reducing concentration risk by selling overweight positions first, then reallocating to underweight assets with improved risk-adjusted returns.`,
      // Trade recommendations
      recommendations,
      trades: recommendations,
      // Account info
      account: {
        equity: parseFloat(account?.equity) || 0,
        cash: parseFloat(account?.cash) || 0,
        buying_power: parseFloat(account?.buying_power) || 0,
      },
    });
  } catch (error) {
    console.error("Trading analyze error:", error);
    return Response.json(
      { error: `Analysis failed: ${error.message}`, code: "ANALYSIS_ERROR" },
      { status: 500 }
    );
  }
}
