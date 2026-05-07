import { NextResponse } from "next/server";

/**
 * POST /api/simulate
 * Local Monte Carlo regime transition simulation.
 *
 * Since the FastAPI backend does not expose /simulate/{symbol},
 * we implement the simulation here using:
 *   1. Historical returns → regime classification
 *   2. Transition matrix estimation from the regime sequence
 *   3. Forward Monte Carlo simulation using regime-conditional distributions
 *   4. FastAPI /regime/detect for the current regime label
 *
 * Body: { symbol, prices, horizon?, n_paths?, seed?, current_price? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { symbol, prices, ...options } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(prices) || prices.length < 81) {
      return NextResponse.json(
        {
          error: `Need at least 81 price bars, got ${Array.isArray(prices) ? prices.length : 0}`,
        },
        { status: 400 },
      );
    }

    const horizon = options.horizon ?? 20;
    const nPaths = options.n_paths ?? 500;
    const seed = options.seed ?? 42;
    const currentPrice = options.current_price ?? prices[prices.length - 1];

    // ── Step 1: Compute log returns ─────────────────────────────────────────
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }

    // ── Step 2: Classify regimes from rolling windows ───────────────────────
    const WINDOW = 20;
    const regimes = classifyRegimes(logReturns, WINDOW);

    // ── Step 3: Build transition matrix from regime sequence ────────────────
    const regimeLabels = [
      "low_vol_bull",
      "low_vol_bear",
      "high_vol_bull",
      "high_vol_bear",
    ];
    const transMatrix = buildTransitionMatrix(regimes, regimeLabels);

    // ── Step 4: Compute regime-conditional return statistics ────────────────
    const regimeStats = computeRegimeStats(logReturns, regimes, WINDOW);

    // ── Step 5: Get current regime from FastAPI (with short timeout) ────────
    let currentRegime = null;
    let riskMultiplier = 1.0;
    try {
      const FASTAPI_BASE =
        process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
        "https://noble-trader-fastapi-backend.onrender.com";
      const regimeRes = await fetch(`${FASTAPI_BASE}/regime/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices, symbol }),
        signal: AbortSignal.timeout(8000), // 8s timeout — fast fail, use local fallback
      });
      if (regimeRes.ok) {
        const regimeResult = await regimeRes.json();
        currentRegime = regimeResult.regime_label || null;
        riskMultiplier = regimeResult.risk_multiplier ?? 1.0;
      }
    } catch {
      // Fallback: derive from local classification
      currentRegime = regimes[regimes.length - 1] || "low_vol_bull";
    }

    // Map FastAPI regime label to our 4-state model
    const currentRegimeState = mapRegimeToState(currentRegime);

    // ── Step 6: Run Monte Carlo simulation ─────────────────────────────────
    const result = runMonteCarlo({
      currentPrice,
      currentRegimeState,
      transMatrix,
      regimeStats,
      regimeLabels,
      horizon,
      nPaths,
      seed,
      riskMultiplier,
    });

    // Add metadata
    result.symbol = symbol;
    result.current_regime = currentRegime;
    result.horizon = horizon;
    result.n_paths = nPaths;
    result.seed = seed;

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/simulate] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Simulation failed" },
      { status: 502 },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Simulation helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Classify each bar into one of 4 regimes based on rolling vol & return.
 */
function classifyRegimes(logReturns, window) {
  const regimes = [];
  for (let i = 0; i < logReturns.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = logReturns.slice(start, i + 1);

    // Compute rolling mean and std
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance =
      slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);

    // Annualize for threshold comparison (assuming daily data)
    const annVol = std * Math.sqrt(252);

    // Thresholds
    const isHighVol = annVol > 0.3;
    const isBull = mean >= 0;

    if (isHighVol && isBull) regimes.push("high_vol_bull");
    else if (isHighVol && !isBull) regimes.push("high_vol_bear");
    else if (!isHighVol && isBull) regimes.push("low_vol_bull");
    else regimes.push("low_vol_bear");
  }
  return regimes;
}

/**
 * Build a 4×4 transition matrix from the regime sequence.
 * Uses add-one (Laplace) smoothing to avoid zero probabilities.
 */
function buildTransitionMatrix(regimes, labels) {
  const n = labels.length;
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));

  // Count transitions
  const counts = Array.from({ length: n }, () => new Array(n).fill(1)); // Laplace smoothing
  for (let i = 1; i < regimes.length; i++) {
    const from = idx[regimes[i - 1]] ?? 0;
    const to = idx[regimes[i]] ?? 0;
    counts[from][to]++;
  }

  // Normalize rows
  const matrix = counts.map((row) => {
    const total = row.reduce((a, b) => a + b, 0);
    return row.map((c) => c / total);
  });

  return matrix;
}

/**
 * Compute mean and std of returns conditional on each regime.
 */
function computeRegimeStats(logReturns, regimes, window) {
  const labels = [
    "low_vol_bull",
    "low_vol_bear",
    "high_vol_bull",
    "high_vol_bear",
  ];
  const stats = {};

  for (const label of labels) {
    const regimeReturns = logReturns.filter((_, i) => regimes[i] === label);
    if (regimeReturns.length < 2) {
      // Fallback: use overall stats
      const allMean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
      const allVar =
        logReturns.reduce((a, b) => a + (b - allMean) ** 2, 0) /
        logReturns.length;
      stats[label] = { mean: allMean, std: Math.sqrt(allVar) || 0.01 };
      continue;
    }
    const mean =
      regimeReturns.reduce((a, b) => a + b, 0) / regimeReturns.length;
    const variance =
      regimeReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
      regimeReturns.length;
    stats[label] = { mean, std: Math.sqrt(variance) || 0.001 };
  }

  return stats;
}

/**
 * Map FastAPI regime label to our 4-state model.
 */
function mapRegimeToState(regimeLabel) {
  if (!regimeLabel) return "low_vol_bull";
  const l = regimeLabel.toLowerCase();
  const isHighVol = l.includes("high");
  const isBear = l.includes("bear");

  if (isHighVol && isBear) return "high_vol_bear";
  if (isHighVol && !isBear) return "high_vol_bull";
  if (!isHighVol && isBear) return "low_vol_bear";
  return "low_vol_bull";
}

/**
 * Seeded pseudo-random number generator (xorshift128+).
 * Returns a function that produces uniform random numbers in [0, 1).
 */
function createRNG(seed) {
  let s0 = seed ^ 0x12345678;
  let s1 = seed ^ 0x87654321;
  if (s0 === 0) s0 = 1;
  if (s1 === 0) s1 = 1;

  return function () {
    // xorshift128+
    let t = s0;
    t ^= t << 23;
    t ^= t >>> 17;
    t ^= s1;
    t ^= s1 >>> 26;
    s0 = s1;
    s1 = t;
    // Convert to [0, 1)
    return ((s0 + s1) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform: generate a normal random variable from uniform inputs.
 */
function normalRandom(rng) {
  const u1 = rng();
  const u2 = rng();
  const safe1 = Math.max(u1, 1e-10); // avoid log(0)
  return Math.sqrt(-2 * Math.log(safe1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sample next regime from transition matrix row using cumulative distribution.
 */
function sampleNextRegime(currentIdx, transMatrix, rng) {
  const row = transMatrix[currentIdx];
  const r = rng();
  let cumSum = 0;
  for (let j = 0; j < row.length; j++) {
    cumSum += row[j];
    if (r <= cumSum) return j;
  }
  return row.length - 1; // fallback
}

/**
 * Run the Monte Carlo simulation.
 */
function runMonteCarlo({
  currentPrice,
  currentRegimeState,
  transMatrix,
  regimeStats,
  regimeLabels,
  horizon,
  nPaths,
  seed,
  riskMultiplier,
}) {
  const rng = createRNG(seed);
  const currentRegimeIdx = regimeLabels.indexOf(currentRegimeState);

  // Storage for all terminal returns and per-step price percentiles
  const terminalReturns = [];
  const maxDrawdowns = [];

  // Per-step regime occupancy tracking
  const stepRegimeCounts = Array.from({ length: horizon }, () =>
    Object.fromEntries(regimeLabels.map((l) => [l, 0])),
  );

  // Per-step price arrays for percentile computation
  const stepPrices = Array.from({ length: horizon }, () => []);

  for (let p = 0; p < nPaths; p++) {
    let price = currentPrice;
    let regimeIdx = currentRegimeIdx;
    let maxPrice = price;
    let maxDD = 0;

    for (let step = 0; step < horizon; step++) {
      // Transition to next regime
      regimeIdx = sampleNextRegime(regimeIdx, transMatrix, rng);
      const regimeLabel = regimeLabels[regimeIdx];
      const stats = regimeStats[regimeLabel];

      // Generate return from regime-conditional distribution
      const ret = stats.mean + stats.std * normalRandom(rng);

      // Update price
      price = price * Math.exp(ret);
      stepPrices[step].push(price);

      // Track regime occupancy
      stepRegimeCounts[step][regimeLabel]++;

      // Track drawdown
      if (price > maxPrice) maxPrice = price;
      const dd = (maxPrice - price) / maxPrice;
      if (dd > maxDD) maxDD = dd;
    }

    // Terminal return
    const terminalRet = (price - currentPrice) / currentPrice;
    terminalReturns.push(terminalRet);
    maxDrawdowns.push(maxDD);
  }

  // ── Compute percentile bands for price fan chart ──────────────────────────
  const price_p5 = [];
  const price_p25 = [];
  const price_median = [];
  const price_p75 = [];
  const price_p95 = [];

  for (let step = 0; step < horizon; step++) {
    const sorted = stepPrices[step].sort((a, b) => a - b);
    price_p5.push(percentile(sorted, 5));
    price_p25.push(percentile(sorted, 25));
    price_median.push(percentile(sorted, 50));
    price_p75.push(percentile(sorted, 75));
    price_p95.push(percentile(sorted, 95));
  }

  // ── Compute return statistics ─────────────────────────────────────────────
  const sortedReturns = [...terminalReturns].sort((a, b) => a - b);
  const returnMean = terminalReturns.reduce((a, b) => a + b, 0) / nPaths;
  const returnVar =
    terminalReturns.reduce((a, b) => a + (b - returnMean) ** 2, 0) / nPaths;
  const returnStd = Math.sqrt(returnVar);

  const var95 = -percentile(sortedReturns, 5); // VaR is a positive number representing loss
  const cvar95 =
    -sortedReturns
      .slice(0, Math.floor(nPaths * 0.05))
      .reduce((a, b) => a + b, 0) / Math.floor(nPaths * 0.05);

  const pctPositive = terminalReturns.filter((r) => r > 0).length / nPaths;
  const meanMaxDD = maxDrawdowns.reduce((a, b) => a + b, 0) / nPaths;

  // ── Compute dominant regime per step ──────────────────────────────────────
  const stepDominantRegime = stepRegimeCounts.map((counts) => {
    let maxCount = 0;
    let dominant = regimeLabels[0];
    for (const [label, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = label;
      }
    }
    return dominant;
  });

  // ── Compute terminal regime mode ──────────────────────────────────────────
  const terminalRegimeCounts = Object.fromEntries(
    regimeLabels.map((l) => [l, 0]),
  );
  // Re-simulate last step regime occupancy (already tracked in stepRegimeCounts[horizon-1])
  const lastStepCounts = stepRegimeCounts[horizon - 1];
  let maxTerminalCount = 0;
  let terminalRegimeMode = regimeLabels[0];
  for (const [label, count] of Object.entries(lastStepCounts)) {
    if (count > maxTerminalCount) {
      maxTerminalCount = count;
      terminalRegimeMode = label;
    }
  }

  // ── Compute expected risk multiplier path ─────────────────────────────────
  // Risk multiplier per regime (matches FastAPI convention)
  const regimeRiskMult = {
    low_vol_bull: 1.0,
    low_vol_bear: 0.7,
    high_vol_bull: 0.5,
    high_vol_bear: 0.2,
  };

  const expectedRiskMult = stepRegimeCounts.map((counts) => {
    let totalPaths = 0;
    let weightedMult = 0;
    for (const [label, count] of Object.entries(counts)) {
      totalPaths += count;
      weightedMult += (regimeRiskMult[label] ?? 0.5) * count;
    }
    return totalPaths > 0
      ? (weightedMult / totalPaths) * riskMultiplier
      : riskMultiplier;
  });

  return {
    // Price fan chart data
    price_p5,
    price_p25,
    price_median,
    price_p75,
    price_p95,

    // Return statistics
    return_mean: returnMean,
    return_std: returnStd,
    return_var95: var95,
    return_cvar95: cvar95,

    // Path statistics
    pct_paths_positive: pctPositive,
    max_drawdown_mean: meanMaxDD,

    // Regime info
    current_regime: null, // Will be set by caller
    terminal_regime_mode: terminalRegimeMode,
    step_dominant_regime: stepDominantRegime,
    expected_risk_mult: expectedRiskMult,
  };
}

/**
 * Compute the percentile value from a sorted array.
 */
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  return (
    sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (idx - lower)
  );
}
