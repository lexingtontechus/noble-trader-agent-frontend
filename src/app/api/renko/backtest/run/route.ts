/**
 * POST /api/renko/backtest/run
 *
 * BFF proxy: runs a Renko pipeline backtest via the FastAPI backend.
 * Uses an isolated pipeline instance (never affects the live pipeline).
 *
 * Redis L1 cache: Results for identical configs are cached with 1h TTL.
 * Cache key is a deterministic hash of symbol + all config params.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { redis } from "@/lib/redis";
import { FASTAPI_BASE } from "@/lib/config";
import type { RenkoBacktestRequest, RenkoBacktestResponse } from "@/types/backtest";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      prices,
      symbol = "SPY",
      brickSize = 0.5,
      brickSizeMode = "fixed",
      reversalBricks = 2,
      bullTriggerN = 3,
      bearTriggerN = 3,
      slBricks = 3,
      tpBricks = 5,
      trailingStop = true,
      trailAfterBricks = 3,
      trailDistanceBricks = 2,
      maxTradesPerSession = 15,
      maxDailyLossBricks = 10.0,
      maxConsecutiveLosses = 3,
      cooldownSeconds = 30.0,
      regimeGate = true,
      slippageBps = 2.0,
      commissionBps = 5.0,
      spreadBps = 1.0,
      ocoPriority = "sl_first",
      initialCapital = 100000.0,
      timestamps,
      regimes,
      signalConfidenceMin,
      // Phase 5: Data Quality
      universeMode = "current_constituents",
      indexName = null,
      priceAdjustment = "raw",
      lookAheadAudit = false,
      // Phase 7: Execution Modeling
      enableMarketImpact = false,
      avgDailyVolume = 1000000,
      impactGamma = 0.314,
      impactEta = 0.142,
      enableFillProbability = false,
      enableBorrowCosts = false,
      borrowRateAnnual = 0.005,
      hardToBorrow = false,
      htbPremiumRate = 0.10,
      enableMarginCosts = false,
      marginRateAnnual = 0.065,
      marginRequirement = 0.50,
    } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 50) {
      return Response.json(
        { error: "prices array with min 50 ticks required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload: RenkoBacktestRequest = {
      prices,
      symbol,
      brick_size: brickSize,
      brick_size_mode: brickSizeMode,
      reversal_bricks: reversalBricks,
      bull_trigger_n: bullTriggerN,
      bear_trigger_n: bearTriggerN,
      sl_bricks: slBricks,
      tp_bricks: tpBricks,
      trailing_stop: trailingStop,
      trail_after_bricks: trailAfterBricks,
      trail_distance_bricks: trailDistanceBricks,
      max_trades_per_session: maxTradesPerSession,
      max_daily_loss_bricks: maxDailyLossBricks,
      max_consecutive_losses: maxConsecutiveLosses,
      cooldown_seconds: cooldownSeconds,
      regime_gate: regimeGate,
      slippage_bps: slippageBps,
      commission_bps: commissionBps,
      spread_bps: spreadBps,
      oco_priority: ocoPriority,
      initial_capital: initialCapital,
      // Phase 5: Data Quality
      universe_mode: universeMode,
      price_adjustment: priceAdjustment,
      look_ahead_audit: lookAheadAudit,
      // Phase 7: Execution Modeling
      enable_market_impact: enableMarketImpact,
      avg_daily_volume: avgDailyVolume,
      impact_gamma: impactGamma,
      impact_eta: impactEta,
      enable_fill_probability: enableFillProbability,
      enable_borrow_costs: enableBorrowCosts,
      borrow_rate_annual: borrowRateAnnual,
      hard_to_borrow: hardToBorrow,
      htb_premium_rate: htbPremiumRate,
      enable_margin_costs: enableMarginCosts,
      margin_rate_annual: marginRateAnnual,
      margin_requirement: marginRequirement,
    };

    if (timestamps) payload.timestamps = timestamps;
    if (regimes) payload.regimes = regimes;
    if (signalConfidenceMin !== undefined) payload.signal_confidence_min = signalConfidenceMin;
    if (indexName) payload.index_name = indexName;

    // ── Check Redis cache (L1) ──────────────────────────────────────────
    const { prices: _omitPrices, ...cacheConfig } = payload;
    // Don't include prices array in cache key hash (too large) — use length + first/last as fingerprint
    const cacheKey = { ...cacheConfig, _price_fingerprint: `${prices.length}:${prices[0]}:${prices[prices.length - 1]}` } as Record<string, unknown>;

    const cached = await redis.getBacktestCache(symbol, cacheKey);
    if (cached) {
      return Response.json({ ...cached, _cached: true, _cache_ttl: "1h" });
    }

    // ── Cache miss: call FastAPI ────────────────────────────────────────
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/renko/backtest/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000), // 2 min for heavy computation
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    const data: RenkoBacktestResponse = await resp.json();

    // ── Save to Redis cache (fire-and-forget, never blocks) ─────────────
    redis.setBacktestCache(symbol, cacheKey, data).catch(() => {
      // Cache write failure is non-critical
    });

    return Response.json(data);
  } catch (error) {
    console.error("[renko/backtest/run] Error:", error);
    return Response.json(
      { error: `Renko backtest failed: ${(error as Error).message}`, code: "RENKO_BACKTEST_ERROR" },
      { status: 500 }
    );
  }
}
