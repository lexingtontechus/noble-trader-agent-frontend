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

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

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
      timestamps,
      regimes,
      signalConfidenceMin,
    } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 50) {
      return Response.json(
        { error: "prices array with min 50 ticks required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
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
    };

    if (timestamps) payload.timestamps = timestamps;
    if (regimes) payload.regimes = regimes;
    if (signalConfidenceMin !== undefined) payload.signal_confidence_min = signalConfidenceMin;

    // ── Check Redis cache (L1) ──────────────────────────────────────────
    const cacheConfig = { ...payload };
    // Don't include prices array in cache key hash (too large) — use length + first/last as fingerprint
    delete cacheConfig.prices;
    cacheConfig._price_fingerprint = `${prices.length}:${prices[0]}:${prices[prices.length - 1]}`;

    const cached = await redis.getBacktestCache(symbol, cacheConfig);
    if (cached) {
      return Response.json({ ...cached, _cached: true, _cache_ttl: "1h" });
    }

    // ── Cache miss: call FastAPI ────────────────────────────────────────
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/renko/backtest/run`, {
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

    const data = await resp.json();

    // ── Save to Redis cache (fire-and-forget, never blocks) ─────────────
    redis.setBacktestCache(symbol, cacheConfig, data).catch(() => {
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
