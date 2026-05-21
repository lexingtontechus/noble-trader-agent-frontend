/**
 * POST /api/renko/backtest/compare
 *
 * BFF proxy: compare multiple Renko pipeline configs side-by-side
 * via the FastAPI backend.
 *
 * Redis L1 cache: Results for identical configs are cached with 1h TTL.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { redis } from "@/lib/redis";
import { FASTAPI_BASE } from "@/lib/config";
import type { RenkoBacktestCompareRequest, RenkoBacktestCompareResponse } from "@/types/backtest";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request: Request, context: any, authContext: any) => {
  try {
    const body = await request.json();
    const { prices, symbol = "SPY", configs, timestamps, regimes } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 50) {
      return Response.json(
        { error: "prices array with min 50 ticks required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!configs || !Array.isArray(configs) || configs.length < 2) {
      return Response.json(
        { error: "configs array with min 2 configs required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload: RenkoBacktestCompareRequest = {
      prices,
      symbol,
      configs,
    };

    if (timestamps) payload.timestamps = timestamps;
    if (regimes) payload.regimes = regimes;

    // ── Check Redis cache (L1) ──────────────────────────────────────────
    const cacheConfig = { symbol, configs } as Record<string, unknown>;
    cacheConfig._price_fingerprint = `${prices.length}:${prices[0]}:${prices[prices.length - 1]}`;

    const cached = await redis.getBacktestCache(`${symbol}:compare`, cacheConfig);
    if (cached) {
      return Response.json({ ...cached, _cached: true, _cache_ttl: "1h" });
    }

    // ── Cache miss: call FastAPI ────────────────────────────────────────
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/renko/backtest/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000), // 3 min for multi-config comparison
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    const data: RenkoBacktestCompareResponse = await resp.json();

    // ── Save to Redis cache (fire-and-forget) ───────────────────────────
    redis.setBacktestCache(`${symbol}:compare`, cacheConfig, data).catch(() => {});

    return Response.json(data);
  } catch (error) {
    console.error("[renko/backtest/compare] Error:", error);
    return Response.json(
      { error: `Renko backtest compare failed: ${(error as Error).message}`, code: "RENKO_COMPARE_ERROR" },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
