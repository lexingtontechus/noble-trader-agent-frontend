/**
 * BFF Route: /api/renko/warmup
 *
 * v2: Simplified architecture — backend handles all warmup logic.
 *
 * GET  /api/renko/warmup?symbol=SPY  — load cached snapshot (Redis L1 → Supabase L2)
 * POST /api/renko/warmup              — thin proxy to backend POST /renko/warmup
 *
 * The old BFF POST (which fetched Yahoo prices, chunked them into 150-tick
 * batches, made N round-trips to /tick/batch, then 5 GET calls) was:
 *   1. A Vercel Fluid Compute risk (30-60s function lifetime)
 *   2. Incompatible with backend's snapshot format (different data shapes)
 *   3. Redundant — the backend warmup endpoint now returns full pipeline state
 *
 * The new POST simply proxies to the backend, which handles:
 *   - Snapshot restore (Redis L1 → Supabase L2) if fresh <4h
 *   - Incremental warmup if pipeline is already warm
 *   - Full warmup if pipeline is cold
 *   - Returns full pipeline state (bricks, classified, trades, signals, stats)
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { db } from "@/lib/supabase/db";
import { redis } from "@/lib/redis";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

// ── GET: Load cached snapshot (Redis L1 → Supabase L2) ──────────────────────

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") || "SPY";
    const brickSize = parseFloat(url.searchParams.get("brick_size") || "0.5");

    // ── L1: Check Redis first (fastest path) ──────────────────────────────
    const redisSnapshot = await redis.getSnapshot(symbol, brickSize);
    if (redisSnapshot) {
      // Redis hit — compute staleness from updated_at
      const age = Date.now() - new Date(redisSnapshot.updated_at).getTime();
      const maxAge = 4 * 60 * 60 * 1000; // 4 hours
      const stale = age > maxAge;

      return Response.json({
        cached: true,
        stale,
        source: "redis",
        symbol: redisSnapshot.symbol,
        brick_size: redisSnapshot.brick_size,
        prices_fed: redisSnapshot.prices_fed,
        total_bricks: redisSnapshot.total_bricks,
        total_trades: redisSnapshot.total_trades,
        total_pnl_bricks: redisSnapshot.total_pnl_bricks,
        bricks: redisSnapshot.bricks,
        classified: redisSnapshot.classified,
        signals: redisSnapshot.signals,
        trades: redisSnapshot.trades,
        stats: redisSnapshot.stats,
        config: redisSnapshot.config,
        price_range: redisSnapshot.price_range,
        period: redisSnapshot.period,
        updated_at: redisSnapshot.updated_at,
      });
    }

    // ── L2: Check Supabase ───────────────────────────────────────────────
    const snapshot = await db.renkoSnapshot.findFirst({
      where: { symbol, brick_size: brickSize },
      orderBy: { created_at: "desc" },
    });

    if (!snapshot) {
      return Response.json({ cached: false, symbol });
    }

    // Supabase hit — backfill Redis L1 for next time (fire-and-forget)
    redis.setSnapshot(symbol, brickSize, {
      symbol: snapshot.symbol,
      brick_size: snapshot.brick_size,
      prices_fed: snapshot.prices_fed,
      total_bricks: snapshot.total_bricks,
      total_trades: snapshot.total_trades,
      total_pnl_bricks: snapshot.total_pnl_bricks,
      bricks: snapshot.bricks,
      classified: snapshot.classified,
      signals: snapshot.signals,
      trades: snapshot.trades,
      stats: snapshot.stats,
      config: snapshot.config,
      price_range: snapshot.price_range,
      period: snapshot.period,
      updated_at: snapshot.updated_at,
    }).catch(() => {}); // Non-critical — don't await

    // Check if cache is stale (>4 hours old)
    const age = Date.now() - new Date(snapshot.updated_at).getTime();
    const maxAge = 4 * 60 * 60 * 1000; // 4 hours
    const stale = age > maxAge;

    return Response.json({
      cached: true,
      stale,
      source: "supabase",
      symbol: snapshot.symbol,
      brick_size: snapshot.brick_size,
      prices_fed: snapshot.prices_fed,
      total_bricks: snapshot.total_bricks,
      total_trades: snapshot.total_trades,
      total_pnl_bricks: snapshot.total_pnl_bricks,
      bricks: snapshot.bricks,
      classified: snapshot.classified,
      signals: snapshot.signals,
      trades: snapshot.trades,
      stats: snapshot.stats,
      config: snapshot.config,
      price_range: snapshot.price_range,
      period: snapshot.period,
      updated_at: snapshot.updated_at,
    });
  } catch (err) {
    console.error("[warmup GET] Error:", err);
    return Response.json({ cached: false, error: err.message });
  }
}

// ── POST: Thin proxy to backend POST /renko/warmup ────────────────────────
//
// The backend handles all warmup logic: snapshot restore, incremental/full
// warmup, Yahoo price fetching, and returns full pipeline state.
// This eliminates the old chunked BFF warmup that was a Vercel Fluid Compute risk.
//
// v3: Added Render cold-start detection (HTML responses) + retry logic,
// matching the pattern in /api/renko/[action]/route.js.

export async function POST(request) {
  try {
    const body = await request.json();
    const authHeaders = await getFastAPIAuthHeaders();
    const requestBody = {
      symbol: body.symbol || "SPY",
      period: body.period || "6mo",
      mode: body.mode || "auto",
      include_state: body.include_state ?? true,
    };

    // Retry logic for Render cold starts (backend may return HTML while spinning up)
    const maxRetries = 3;
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(`${RENKO_BASE}/warmup`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000), // 2 min for Yahoo fetch + pipeline processing
        });

        // ── Guard: detect HTML responses (Render cold start) ──
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          console.warn(
            `[warmup POST] Backend returned HTML (attempt ${i + 1}/${maxRetries}) — likely cold start`
          );
          if (i < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
            continue;
          }
          return Response.json(
            {
              error:
                "Backend service is starting up. Please try again in a moment.",
              code: "COLD_START",
            },
            { status: 503 }
          );
        }

        // ── Parse response safely ──
        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
          // Response is not valid JSON — could be a raw error page or truncated response
          const text = await res.text().catch(() => "");
          console.error(
            `[warmup POST] Non-JSON response (HTTP ${res.status}):`,
            text.substring(0, 200)
          );
          return Response.json(
            {
              error: `Backend returned non-JSON response (HTTP ${res.status}). The service may be starting up.`,
              code: "INVALID_RESPONSE",
              preview: text.substring(0, 100),
            },
            { status: 502 }
          );
        }

        // If backend returned an error, forward it
        if (!res.ok) {
          return Response.json(
            {
              error:
                data.detail || data.error || `Backend warmup failed (HTTP ${res.status})`,
            },
            { status: res.status }
          );
        }

        // Transform backend response to BFF format for backward compatibility
        // Frontend components may still check data.success or data.total_bricks
        return Response.json({
          success: data.status === "ok",
          cached:
            data.source === "snapshot_restore" || data.source === "up_to_date",
          symbol: data.symbol,
          source: data.source,
          mode: data.mode,
          prices_fed: data.prices_fed || 0,
          brick_count: data.brick_count,
          total_bricks: data.brick_count, // Backward compat alias
          new_bricks: data.new_bricks || 0,
          total_trades: data.total_trades || 0,
          total_pnl_bricks: data.total_pnl_bricks || 0,
          // Full pipeline state (when include_state=true)
          bricks: data.bricks || [],
          classified: data.classified || [],
          signals: data.signals || [],
          trades: data.trades || [],
          stats: data.stats || {},
          config: data.config || data.stats?.config || {},
          readiness: data.readiness || null,
          state: data.state || null,
          elapsed_ms: data.elapsed_ms,
        });
      } catch (fetchErr) {
        lastError = fetchErr;
        // Timeout or network error — retry with backoff
        if (i < maxRetries - 1) {
          console.warn(
            `[warmup POST] Fetch failed (attempt ${i + 1}/${maxRetries}):`,
            fetchErr.message
          );
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
      }
    }

    // All retries exhausted
    console.error("[warmup POST] All retries exhausted:", lastError?.message);
    return Response.json(
      {
        error: `Warm-up failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
        code: "TIMEOUT",
      },
      { status: 504 }
    );
  } catch (err) {
    console.error("[warmup POST] Error:", err);
    return Response.json(
      { error: `Warm-up failed: ${err.message}` },
      { status: 500 }
    );
  }
}
