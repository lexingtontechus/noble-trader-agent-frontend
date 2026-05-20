/**
 * POST /api/renko/backtest/optimize
 *
 * BFF proxy: run a parameter sweep (grid search) for the Renko pipeline
 * via the FastAPI backend.
 *
 * Redis L1 cache: Results for identical param grids are cached with 1h TTL.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { redis } from "@/lib/redis";
import type { RenkoBacktestOptimizeRequest, RenkoBacktestOptimizeResponse } from "@/types/backtest";

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prices, symbol = "SPY", param_grid, ...options } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 50) {
      return Response.json(
        { error: "prices array with min 50 ticks required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!param_grid || typeof param_grid !== "object" || Object.keys(param_grid).length === 0) {
      return Response.json(
        { error: "param_grid object with at least one parameter required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Estimate combinations and warn if too many
    const comboCount = Object.values(param_grid).reduce(
      (acc: number, vals: unknown) => acc * (Array.isArray(vals) ? vals.length : 1),
      1
    );
    if (comboCount > 50) {
      return Response.json(
        { error: `Too many combinations (${comboCount}). Max 50 to avoid timeout.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload: RenkoBacktestOptimizeRequest = {
      prices,
      symbol,
      param_grid,
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
      slippage_bps: options.slippage_bps ?? 2.0,
      commission_bps: options.commission_bps ?? 5.0,
      spread_bps: options.spread_bps ?? 1.0,
      oco_priority: options.oco_priority ?? "sl_first",
      // Phase 7: Execution Modeling
      enable_market_impact: options.enable_market_impact ?? false,
      avg_daily_volume: options.avg_daily_volume ?? 1000000,
      impact_gamma: options.impact_gamma ?? 0.314,
      impact_eta: options.impact_eta ?? 0.142,
      enable_fill_probability: options.enable_fill_probability ?? false,
      enable_borrow_costs: options.enable_borrow_costs ?? false,
      borrow_rate_annual: options.borrow_rate_annual ?? 0.005,
      hard_to_borrow: options.hard_to_borrow ?? false,
      htb_premium_rate: options.htb_premium_rate ?? 0.10,
      enable_margin_costs: options.enable_margin_costs ?? false,
      margin_rate_annual: options.margin_rate_annual ?? 0.065,
      margin_requirement: options.margin_requirement ?? 0.50,
    };

    // ── Check Redis cache (L1) ──────────────────────────────────────────
    const cacheConfig = { symbol, param_grid, brick_size: payload.brick_size, sl_bricks: payload.sl_bricks, tp_bricks: payload.tp_bricks, regime_gate: payload.regime_gate, _price_fingerprint: `${prices.length}:${prices[0]}:${prices[prices.length - 1]}` } as Record<string, unknown>;

    const cached = await redis.getBacktestCache(`${symbol}:optimize`, cacheConfig);
    if (cached) {
      return Response.json({ ...cached, _cached: true, _cache_ttl: "1h" });
    }

    // ── Cache miss: call FastAPI ────────────────────────────────────────
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/renko/backtest/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300000), // 5 min for parameter sweeps
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    const data: RenkoBacktestOptimizeResponse = await resp.json();

    // ── Save to Redis cache (fire-and-forget) ───────────────────────────
    redis.setBacktestCache(`${symbol}:optimize`, cacheConfig, data).catch(() => {});

    return Response.json(data);
  } catch (error) {
    console.error("[renko/backtest/optimize] Error:", error);
    return Response.json(
      { error: `Renko optimize failed: ${(error as Error).message}`, code: "RENKO_OPTIMIZE_ERROR" },
      { status: 500 }
    );
  }
}
