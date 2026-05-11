import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getPositions, getAccount } from "@/lib/alpaca-client";
import { detectRegimeV2, strategySignal, analyzeRisk, detectCorrelation, optimisePortfolio } from "@/lib/fastapi-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol, yahooToAlpacaSymbol } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

// Fallback Alpaca keys from env vars (used when Clerk auth is unavailable, e.g. cron jobs)
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {
    // Clerk not available
  }
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

function toLogReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

// ── Local fallback computations (when FastAPI is unavailable) ──────────────

/**
 * Simple local regime detection based on moving average crossover + volatility.
 * Returns one of: "bullish", "bearish", "neutral", "crisis"
 */
function localRegimeDetect(prices) {
  if (prices.length < 50) return "unknown";
  const recent = prices.slice(-20);
  const longer = prices.slice(-50);
  const maShort = recent.reduce((a, b) => a + b, 0) / recent.length;
  const maLong = longer.reduce((a, b) => a + b, 0) / longer.length;

  // Volatility
  const returns = toLogReturns(prices.slice(-20));
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance) * Math.sqrt(252); // annualised

  const trend = (maShort - maLong) / maLong;

  if (vol > 0.40) return "crisis";
  if (trend > 0.03) return "bullish";
  if (trend < -0.03) return "bearish";
  return "neutral";
}

/**
 * Simple local correlation regime: classify based on average pairwise correlation.
 */
function localCorrelationDetect(symbols, logReturns) {
  const n = symbols.length;
  if (n < 2) return { regime_label: "unknown", corr_regime: "unknown", confidence: 0.5 };

  // Compute mean returns and std for each symbol
  const stats = logReturns.map((rets) => {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
    return { mean, std };
  });

  // Average pairwise correlation (sample)
  let corrSum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (stats[i].std === 0 || stats[j].std === 0) continue;
      let cov = 0;
      const len = Math.min(logReturns[i].length, logReturns[j].length);
      for (let k = 0; k < len; k++) {
        cov += (logReturns[i][k] - stats[i].mean) * (logReturns[j][k] - stats[j].mean);
      }
      cov /= len;
      corrSum += cov / (stats[i].std * stats[j].std);
      pairs++;
    }
  }

  const avgCorr = pairs > 0 ? corrSum / pairs : 0;

  let regime;
  if (avgCorr > 0.6) regime = "crisis";
  else if (avgCorr > 0.3) regime = "elevated";
  else if (avgCorr > 0) regime = "normal";
  else regime = "diversified";

  return {
    regime_label: regime,
    corr_regime: regime,
    corr_confidence: Math.abs(avgCorr),
    confidence: Math.abs(avgCorr),
    avg_correlation: avgCorr,
  };
}

/**
 * Simple equal-risk parity optimizer: allocate inversely proportional to vol.
 * More sophisticated than equal weight but doesn't need FastAPI.
 */
function localOptimize(symbols, logReturns) {
  const vols = logReturns.map((rets) => {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
    return Math.sqrt(variance) * Math.sqrt(252);
  });

  // Inverse volatility weighting
  const invVols = vols.map((v) => (v > 0.001 ? 1 / v : 1));
  const sumInv = invVols.reduce((a, b) => a + b, 0);
  const weights = invVols.map((iv) => iv / sumInv);

  // Simple expected return estimate
  const expReturns = logReturns.map((rets) => {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    return mean * 252; // annualised
  });

  const expectedReturn = weights.reduce((sum, w, i) => sum + w * expReturns[i], 0);
  const portfolioVol = Math.sqrt(
    weights.reduce((sum, w, i) => sum + (w * vols[i]) ** 2, 0)
  );
  const sharpe = portfolioVol > 0 ? (expectedReturn - 0.04) / portfolioVol : 0;

  return {
    optimisation: {
      weights,
      expected_return: expectedReturn,
      expected_vol: portfolioVol,
      sharpe_ratio: sharpe,
      expected_max_drawdown: portfolioVol * 2, // rough estimate
    },
  };
}

/**
 * Phase 2: Local fallback for strategy signal.
 * Based on regime context, return a simple long/short/flat signal.
 */
function localStrategySignal(prices, regime) {
  if (prices.length < 50) return { signal: "flat", confidence: 0.3, kelly_fraction: 0, position_size: 0, source: "local" };
  const returns = toLogReturns(prices.slice(-20));
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  let signal = "flat";
  let confidence = 0.4;
  if (regime === "bullish" || regime === "trending") { signal = "long"; confidence = 0.5 + Math.min(Math.abs(meanRet) * 10, 0.3); }
  else if (regime === "bearish" || regime === "crisis") { signal = "short"; confidence = 0.5 + Math.min(Math.abs(meanRet) * 10, 0.3); }
  else { signal = "flat"; confidence = 0.3; }
  const kellyFraction = vol > 0 ? Math.min(Math.max(meanRet / (vol * vol / 252), 0), 0.25) : 0;
  return { signal, confidence: Math.min(confidence, 0.9), kelly_fraction: kellyFraction, position_size: kellyFraction, source: "local" };
}

/**
 * Phase 2: Local fallback for risk analysis.
 * Compute basic VaR (5th percentile of returns), CVaR (mean of returns below VaR), risk_score.
 */
function localRiskAnalyze(prices) {
  if (prices.length < 20) return { var_daily: 0, cvar_daily: 0, risk_score: 0.5, stress_tests: {}, risk_limit_breach: false, source: "local" };
  const returns = toLogReturns(prices.slice(-60));
  const sorted = [...returns].sort((a, b) => a - b);
  const varIdx = Math.floor(sorted.length * 0.05);
  const varDaily = sorted[varIdx] || 0;
  const cvarReturns = sorted.slice(0, varIdx + 1);
  const cvarDaily = cvarReturns.length > 0 ? cvarReturns.reduce((a, b) => a + b, 0) / cvarReturns.length : varDaily;
  const variance = returns.reduce((a, r) => a + (r - returns.reduce((s, v) => s + v, 0) / returns.length) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  const riskScore = Math.min(vol / 0.4, 1.0);
  return { var_daily: varDaily, cvar_daily: cvarDaily, risk_score: riskScore, stress_tests: {}, risk_limit_breach: riskScore > 0.8, source: "local" };
}

/**
 * POST /api/trading/analyze
 * Full analysis pipeline with local fallbacks for resilience.
 *
 * Phase 2 pipeline: detectRegimeV2 → strategySignal → analyzeRisk → detectCorrelation → optimisePortfolio
 */
export async function POST(request) {
  try {
    // 1. Get Alpaca keys
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
      (sum, p) => sum + (parseFloat(p.market_value) || 0), 0
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
    const yahooSymbols = symbols.map((sym) => alpacaToYahooSymbol(sym));

    // 3. Fetch historical prices sequentially
    const allPrices = [];
    for (const ys of yahooSymbols) {
      try {
        const data = await fetchHistoricalPrices(ys);
        allPrices.push(data?.prices || []);
      } catch {
        allPrices.push([]);
      }
    }

    const minLen = Math.min(...allPrices.map((p) => p.length));
    if (minLen < 20) {
      return Response.json(
        { error: `Insufficient price data (minimum 20 bars, got ${minLen})`, code: "INSUFFICIENT_DATA" },
        { status: 400 }
      );
    }

    // Use a capped length to reduce memory footprint
    const useLen = Math.min(minLen, 252); // max 1 year of daily bars

    // 4. Regime detection V2 — try FastAPI, fall back to local
    const regimeResults = {};
    let fastApiAvailable = false;

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const prices = allPrices[i].slice(-useLen);
      try {
        const result = await Promise.race([
          detectRegimeV2(prices, yahooSymbols[i]),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]);
        regimeResults[sym] = result;
        fastApiAvailable = true;
      } catch {
        // Local fallback
        const localRegime = localRegimeDetect(prices);
        regimeResults[sym] = {
          regime: localRegime,
          current_regime: localRegime,
          regime_label: localRegime,
          source: "local",
        };
      }
    }

    // 5. Strategy signals — try FastAPI, fall back to local
    const strategyResults = {};

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const prices = allPrices[i].slice(-useLen);
      const regime = regimeResults[sym]?.current_regime || regimeResults[sym]?.regime || "unknown";
      if (fastApiAvailable) {
        try {
          const result = await Promise.race([
            strategySignal(prices, yahooSymbols[i], { use_regime: true, kelly_fraction: 0.5, target_vol: 0.15 }),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
          ]);
          strategyResults[sym] = result;
        } catch {
          // Local fallback
          strategyResults[sym] = localStrategySignal(prices, regime);
        }
      } else {
        strategyResults[sym] = localStrategySignal(prices, regime);
      }
    }

    // 6. Risk analysis — try FastAPI, fall back to local
    const riskResults = {};

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const prices = allPrices[i].slice(-useLen);
      if (fastApiAvailable) {
        try {
          const result = await Promise.race([
            analyzeRisk(prices, yahooSymbols[i], { use_regime: true, stress_scenarios: true }),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
          ]);
          riskResults[sym] = result;
        } catch {
          // Local fallback
          riskResults[sym] = localRiskAnalyze(prices);
        }
      } else {
        riskResults[sym] = localRiskAnalyze(prices);
      }
    }

    // 7. Correlation detection — try FastAPI, fall back to local
    const logReturns = allPrices.map((prices) => toLogReturns(prices.slice(-useLen)));

    let correlationResult;
    if (fastApiAvailable) {
      try {
        // Limit the matrix size to avoid memory issues
        const maxBars = Math.min(logReturns[0]?.length || 0, 120);
        const trimmedReturns = logReturns.map((r) => r.slice(-maxBars));
        const nBars = trimmedReturns[0].length;
        const returnsMatrix = [];
        for (let i = 0; i < nBars; i++) {
          returnsMatrix.push(trimmedReturns.map((retArr) => retArr[i] || 0));
        }
        correlationResult = await Promise.race([
          detectCorrelation(symbols, returnsMatrix),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
        ]);
      } catch {
        correlationResult = localCorrelationDetect(symbols, logReturns);
        correlationResult.source = "local";
      }
    } else {
      correlationResult = localCorrelationDetect(symbols, logReturns);
      correlationResult.source = "local";
    }

    // 8. Optimization — try FastAPI, fall back to local
    let optimizerResult;
    if (fastApiAvailable) {
      try {
        const maxBars = Math.min(logReturns[0]?.length || 0, 120);
        const trimmedReturns = logReturns.map((r) => r.slice(-maxBars));
        const nBars = trimmedReturns[0].length;
        const returnsMatrix = [];
        for (let i = 0; i < nBars; i++) {
          returnsMatrix.push(trimmedReturns.map((retArr) => retArr[i] || 0));
        }
        optimizerResult = await Promise.race([
          optimisePortfolio(symbols, returnsMatrix, { risk_free_rate: 0.04 }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000)),
        ]);
      } catch {
        optimizerResult = localOptimize(symbols, logReturns);
        optimizerResult.source = "local";
      }
    } else {
      optimizerResult = localOptimize(symbols, logReturns);
      optimizerResult.source = "local";
    }

    // 9. Generate trade recommendations (enhanced with strategy signals + risk analysis)
    const recommendations = [];
    const REBALANCE_THRESHOLD = 0.05;

    const optimisation = optimizerResult?.optimisation || optimizerResult || {};
    const optimalWeights = optimisation.weights || [];
    const currentWeights = positions.map((p) => p.weight);

    // Fallback to equal weight
    if (optimalWeights.length !== symbols.length || optimalWeights.every((w) => w === 0)) {
      for (let i = 0; i < symbols.length; i++) {
        optimalWeights[i] = 1 / symbols.length;
      }
    }

    const weightAnalysis = symbols.map((sym, i) => {
      const current = currentWeights[i] || 0;
      const optimal = optimalWeights[i] || 0;
      const diff = optimal - current;
      const absDiff = Math.abs(diff);
      const dollarDiff = diff * totalValue;
      const price = positions[i].current_price;
      const strategy = strategyResults[sym] || {};
      const risk = riskResults[sym] || {};
      const regime = regimeResults[sym]?.regime || regimeResults[sym]?.current_regime || "unknown";
      const regimeLabel = regimeResults[sym]?.regime_label || regime;
      return {
        symbol: sym,
        current_weight: current,
        optimal_weight: optimal,
        weight_diff: diff,
        abs_weight_diff: absDiff,
        dollar_diff: dollarDiff,
        price,
        regime,
        regimeLabel,
        strategySignal: strategy.signal || "flat",
        strategyConfidence: strategy.confidence || 0.3,
        kellyFraction: strategy.kelly_fraction || 0,
        kellySize: strategy.position_size || 0,
        riskScore: risk.risk_score || 0.5,
        varDaily: risk.var_daily || 0,
        cvarDaily: risk.cvar_daily || 0,
        riskLimitBreach: risk.risk_limit_breach || false,
      };
    });

    // Adjust priority based on strategy alignment:
    // - Strategy "long" + underweight → higher buy priority
    // - Strategy "short" + overweight → higher sell priority
    // - Strategy "flat" → skip unless weight diff is very large
    weightAnalysis.sort((a, b) => {
      // Primary sort: strategy-aligned trades first
      const aAligned = (a.strategySignal === "long" && a.dollar_diff > 0) ||
                       (a.strategySignal === "short" && a.dollar_diff < 0);
      const bAligned = (b.strategySignal === "long" && b.dollar_diff > 0) ||
                       (b.strategySignal === "short" && b.dollar_diff < 0);
      if (aAligned && !bAligned) return -1;
      if (!aAligned && bAligned) return 1;
      // Secondary sort: by absolute dollar diff
      return Math.abs(b.dollar_diff) - Math.abs(a.dollar_diff);
    });

    let sellPriority = 0;
    let buyPriority = 50;

    for (const wa of weightAnalysis) {
      // If strategy signal is "flat", skip unless the weight diff is very large (>15%)
      if (wa.strategySignal === "flat" && wa.abs_weight_diff < 0.15) continue;
      if (wa.abs_weight_diff < REBALANCE_THRESHOLD) continue;
      if (wa.price <= 0) continue;

      // Adjust quantity using Kelly fraction if available
      let qty = Math.floor(Math.abs(wa.dollar_diff) / wa.price);
      if (wa.kellyFraction > 0 && wa.kellyFraction < 1) {
        // Scale down position by Kelly fraction (conservative sizing)
        const kellyAdjustedQty = Math.floor(qty * wa.kellyFraction);
        if (kellyAdjustedQty > 0) qty = kellyAdjustedQty;
      }
      if (qty <= 0) continue;

      // Determine priority offset based on strategy confidence
      const confidenceOffset = Math.round((1 - wa.strategyConfidence) * 20);

      if (wa.dollar_diff < 0) {
        // Sell recommendation
        const isAligned = wa.strategySignal === "short";
        const priority = isAligned
          ? sellPriority + confidenceOffset  // Strategy-aligned sells get lower priority number (higher priority)
          : sellPriority + 20 + confidenceOffset; // Non-aligned sells get deprioritized
        recommendations.push({
          id: `sell-${wa.symbol}-${Date.now()}`,
          symbol: wa.symbol,
          side: "sell",
          order_type: "market",
          qty,
          limit_price: null,
          time_in_force: "day",
          priority,
          reason: `Overweight by ${(wa.abs_weight_diff * 100).toFixed(1)}%: current ${(wa.current_weight * 100).toFixed(1)}% → optimal ${(wa.optimal_weight * 100).toFixed(1)}% | Regime: ${wa.regime} | Signal: ${wa.strategySignal} (${(wa.strategyConfidence * 100).toFixed(0)}% conf) | VaR: ${(wa.varDaily * 100).toFixed(2)}% | Risk: ${(wa.riskScore * 100).toFixed(0)}%`,
          estimated_value: Math.abs(wa.dollar_diff),
          regime: wa.regime,
          regimeLabel: wa.regimeLabel,
          strategySignal: wa.strategySignal,
          strategyConfidence: wa.strategyConfidence,
          kellyFraction: wa.kellyFraction,
          kellySize: wa.kellySize * totalValue, // dollar size from Kelly
          riskScore: wa.riskScore,
          varDaily: wa.varDaily,
          cvarDaily: wa.cvarDaily,
        });
        sellPriority += 10;
      } else {
        // Buy recommendation
        const isAligned = wa.strategySignal === "long";
        const priority = isAligned
          ? buyPriority + confidenceOffset  // Strategy-aligned buys get lower priority number
          : buyPriority + 20 + confidenceOffset; // Non-aligned buys get deprioritized
        const limitPrice = wa.price * 0.99;
        recommendations.push({
          id: `buy-${wa.symbol}-${Date.now()}`,
          symbol: wa.symbol,
          side: "buy",
          order_type: "limit",
          qty,
          limit_price: Math.round(limitPrice * 100) / 100,
          time_in_force: "gtc",
          priority,
          reason: `Underweight by ${(wa.abs_weight_diff * 100).toFixed(1)}%: current ${(wa.current_weight * 100).toFixed(1)}% → optimal ${(wa.optimal_weight * 100).toFixed(1)}% | Regime: ${wa.regime} | Signal: ${wa.strategySignal} (${(wa.strategyConfidence * 100).toFixed(0)}% conf) | Kelly: ${(wa.kellyFraction * 100).toFixed(1)}% | Risk: ${(wa.riskScore * 100).toFixed(0)}%`,
          estimated_value: Math.abs(wa.dollar_diff),
          regime: wa.regime,
          regimeLabel: wa.regimeLabel,
          strategySignal: wa.strategySignal,
          strategyConfidence: wa.strategyConfidence,
          kellyFraction: wa.kellyFraction,
          kellySize: wa.kellySize * totalValue,
          riskScore: wa.riskScore,
          varDaily: wa.varDaily,
          cvarDaily: wa.cvarDaily,
        });
        buyPriority += 10;
      }
    }

    // 10. Save analysis to database (with Phase 2 data)
    let analysisRunId = null;
    try {
      // Prepare Phase 2 JSON data for storage
      const strategySignalsJson = JSON.stringify(
        Object.fromEntries(
          symbols.map((sym) => [sym, strategyResults[sym] || {}])
        )
      );
      const riskAnalysisJson = JSON.stringify(
        Object.fromEntries(
          symbols.map((sym) => [sym, riskResults[sym] || {}])
        )
      );
      const kellySizesJson = JSON.stringify(
        Object.fromEntries(
          symbols.map((sym) => [
            sym,
            {
              kelly_fraction: strategyResults[sym]?.kelly_fraction || 0,
              position_size: strategyResults[sym]?.position_size || 0,
            },
          ])
        )
      );

      const analysisRun = await db.analysisRun.create({
        data: {
          userId: "default",
          status: "completed",
          results: JSON.stringify({
            totalValue,
            positionCount: positions.length,
            recommendationCount: recommendations.length,
            fastApiAvailable,
          }),
          positions: JSON.stringify(positions),
          correlation: JSON.stringify(correlationResult),
          optimizer: JSON.stringify(optimizerResult),
          regimes: JSON.stringify(regimeResults),
          strategySignals: strategySignalsJson,
          riskAnalysis: riskAnalysisJson,
          kellySizes: kellySizesJson,
        },
      });
      analysisRunId = analysisRun.id;

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
            regime: rec.regime || null,
            regimeLabel: rec.regimeLabel || null,
            strategySignal: rec.strategySignal || null,
            strategyConfidence: rec.strategyConfidence || null,
            kellyFraction: rec.kellyFraction || null,
            kellySize: rec.kellySize || null,
            riskScore: rec.riskScore || null,
            varDaily: rec.varDaily || null,
            cvarDaily: rec.cvarDaily || null,
          },
        });
      }
    } catch (dbErr) {
      console.error("Database save failed (non-fatal):", dbErr.message);
    }

    // 11. Build response (with Phase 2 data)
    const regimeSummary = symbols.map((sym) => {
      const regimeData = regimeResults[sym] || {};
      return {
        symbol: sym,
        regime: regimeData.current_regime || regimeData.regime || "unknown",
        regime_label: regimeData.regime_label || regimeData.current_regime || regimeData.regime || "unknown",
        n_states: regimeData.n_states || null,
        state_probabilities: regimeData.state_probabilities || null,
      };
    });

    const corrRegime = correlationResult?.corr_regime || correlationResult?.regime_label || "unknown";
    const corrConfidence = correlationResult?.corr_confidence || correlationResult?.confidence || 0;

    // Build strategy signals summary
    const strategySignalsResponse = Object.fromEntries(
      symbols.map((sym) => [
        sym,
        {
          signal: strategyResults[sym]?.signal || "flat",
          confidence: strategyResults[sym]?.confidence || 0.3,
          kelly_fraction: strategyResults[sym]?.kelly_fraction || 0,
          position_size: strategyResults[sym]?.position_size || 0,
          regime_context: strategyResults[sym]?.regime_context || null,
          source: strategyResults[sym]?.source || "unknown",
        },
      ])
    );

    // Build risk analysis summary
    const riskAnalysisResponse = Object.fromEntries(
      symbols.map((sym) => [
        sym,
        {
          var_daily: riskResults[sym]?.var_daily || 0,
          cvar_daily: riskResults[sym]?.cvar_daily || 0,
          risk_score: riskResults[sym]?.risk_score || 0.5,
          risk_limit_breach: riskResults[sym]?.risk_limit_breach || false,
          stress_tests: riskResults[sym]?.stress_tests || {},
          source: riskResults[sym]?.source || "unknown",
        },
      ])
    );

    // Build Kelly sizing summary
    const kellySizingResponse = Object.fromEntries(
      symbols.map((sym) => [
        sym,
        {
          kelly_fraction: strategyResults[sym]?.kelly_fraction || 0,
          position_size: strategyResults[sym]?.position_size || 0,
        },
      ])
    );

    // Count strategy signal types for explanation
    const longCount = symbols.filter((s) => strategyResults[s]?.signal === "long").length;
    const shortCount = symbols.filter((s) => strategyResults[s]?.signal === "short").length;
    const flatCount = symbols.filter((s) => strategyResults[s]?.signal === "flat").length;
    const highRiskCount = symbols.filter((s) => (riskResults[s]?.risk_score || 0) > 0.7).length;

    return Response.json({
      id: analysisRunId,
      portfolio_allocation: Object.fromEntries(positions.map((p) => [p.symbol, p.weight])),
      optimal_allocation: Object.fromEntries(symbols.map((sym, i) => [sym, optimalWeights[i] || 0])),
      regime_summary: regimeSummary,
      correlation_regime: { regime: corrRegime, confidence: corrConfidence },
      corr_regime: corrRegime,
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
      strategy_signals: strategySignalsResponse,
      risk_analysis: riskAnalysisResponse,
      kelly_sizing: kellySizingResponse,
      strategy_explanation: `Portfolio is in ${corrRegime} correlation regime with ${(corrConfidence * 100).toFixed(0)}% confidence. Strategy signals: ${longCount} long, ${shortCount} short, ${flatCount} flat. ${highRiskCount > 0 ? `${highRiskCount} symbols have elevated risk (>70%).` : "All symbols within normal risk bounds."} ${fastApiAvailable ? "HMM-regime-aware" : "Statistical"} strategy signals and Kelly position sizing used. Sells prioritized to free buying power before placing buy orders.`,
      strategy: `${corrRegime} regime detected — ${longCount > shortCount ? "bullish bias" : shortCount > longCount ? "bearish bias" : "neutral stance"} with Kelly-adjusted position sizing. Reducing concentration risk by selling overweight positions first, then reallocating to underweight assets.`,
      recommendations,
      trades: recommendations,
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
