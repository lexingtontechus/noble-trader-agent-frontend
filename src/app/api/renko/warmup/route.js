/**
 * BFF Route: /api/renko/warmup
 *
 * v4: Cache-first with backend fallback — eliminates the "Cold - no data" dead-end.
 *
 * GET  /api/renko/warmup?symbol=SPY  — load cached snapshot (Redis L1 → Supabase L2 → Backend L3)
 * POST /api/renko/warmup              — proxy to backend POST /renko/warmup (force rebuild)
 *
 * Cache hierarchy for GET:
 *   L1: Upstash Redis (sub-5ms) — instant if hit
 *   L2: Supabase ta_renko_snapshot (~100ms) — durable, backfills L1
 *   L3: Backend warmup POST (5-60s) — restores from backend's own L1/L2, or Yahoo fetch
 *
 * The L3 fallback ensures that even when BFF caches are empty (first visit, TTL expired),
 * the system auto-recovers from the backend's snapshot restore — no more 6-call
 * fetchFromBackend that all fail on cold start.
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
      // ── L3: Backend fallback ──────────────────────────────────────────
      // When BFF L1/L2 are both empty, try the backend warmup endpoint.
      // The backend has its own L1/L2 cache (Redis + Supabase) and can
      // restore a snapshot or fall back to Yahoo fetch. This avoids the
      // frontend making 6 separate GET calls that all fail on cold start.
      try {
        const authHeaders = await getFastAPIAuthHeaders();
        const maxRetries = 2; // Fewer retries than POST — GET is for auto-refresh
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
          try {
            const res = await fetch(`${RENKO_BASE}/warmup`, {
              method: "POST",
              headers: {
                ...authHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                symbol,
                period: "6mo",
                mode: "auto",
                include_state: true,
              }),
              signal: AbortSignal.timeout(60000), // 60s — enough for snapshot restore
            });

            // Detect HTML (Render cold start)
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("text/html")) {
              console.warn(
                `[warmup GET] Backend returned HTML (attempt ${i + 1}/${maxRetries}) — cold start`
              );
              if (i < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
                continue;
              }
              break; // Return cache miss — frontend will auto-trigger rebuild
            }

            if (!res.ok) {
              console.warn(
                `[warmup GET] Backend warmup returned HTTP ${res.status} (attempt ${i + 1}/${maxRetries})`
              );
              if (i < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
                continue;
              }
              break;
            }

            const data = await res.json();
            const brickCount = data.brick_count || 0;

            // Only accept non-empty results
            if (brickCount === 0 && !data.bricks?.length) {
              console.warn("[warmup GET] Backend warmup returned empty pipeline");
              break;
            }

            // Build snapshot payload and cache it in BFF L1/L2
            const snapshotPayload = {
              symbol,
              brick_size: brickSize,
              prices_fed: data.prices_fed || 0,
              total_bricks: brickCount,
              total_trades: data.total_trades || 0,
              total_pnl_bricks: data.total_pnl_bricks || 0,
              bricks: data.bricks || [],
              classified: data.classified || [],
              signals: data.signals || [],
              trades: data.trades || [],
              stats: data.stats || {},
              config: data.config || data.stats?.config || {},
              period: "6mo",
              updated_at: new Date().toISOString(),
            };

            // Update BFF-side caches (fire-and-forget)
            redis.setSnapshot(symbol, brickSize, snapshotPayload).catch(() => {});
            try {
              await db.renkoSnapshot.upsert({
                data: snapshotPayload,
                onConflict: "symbol,brick_size",
              });
            } catch (dbErr) {
              console.warn("[warmup GET] Supabase cache update failed:", dbErr.message);
            }

            // Return as cached data (so frontend populateFromSnapshot works)
            return Response.json({
              cached: true,
              stale: false,
              source: data.source === "snapshot_restore" ? "backend_restore" : "backend_warmup",
              ...snapshotPayload,
            });
          } catch (fetchErr) {
            lastError = fetchErr;
            if (i < maxRetries - 1) {
              await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
              continue;
            }
          }
        }

        if (lastError) {
          console.warn("[warmup GET] Backend fallback failed:", lastError.message);
        }
      } catch (backendErr) {
        console.warn("[warmup GET] Backend fallback error:", backendErr.message);
      }

      return Response.json({ cached: false, symbol });
    }

    // Backfill Redis L1 for next time (fire-and-forget)
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
    }).catch(() => {});

    const age = Date.now() - new Date(snapshot.updated_at).getTime();
    const maxAge = 4 * 60 * 60 * 1000;
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

// ── POST: Proxy to backend POST /renko/warmup (force rebuild) ──────────────
//
// The backend handles all warmup logic: snapshot restore, incremental/full
// warmup, Yahoo price fetching, and returns full pipeline state.
//
// Includes: Render cold-start detection, retry logic, and safe JSON parsing.

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

    // Retry logic for Render cold starts
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

        // Guard: detect HTML responses (Render cold start)
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          console.warn(
            `[warmup POST] Backend returned HTML (attempt ${i + 1}/${maxRetries}) — likely cold start`
          );
          if (i < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
            continue;
          }
          return Response.json(
            {
              error: "Backend service is starting up. Please try again in a moment.",
              code: "COLD_START",
            },
            { status: 503 }
          );
        }

        // Parse response safely
        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
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

        // Forward backend errors
        if (!res.ok) {
          return Response.json(
            { error: data.detail || data.error || `Backend warmup failed (HTTP ${res.status})` },
            { status: res.status }
          );
        }

        // Transform backend response for BFF compatibility
        // Also update the BFF-side L1/L2 cache so next GET returns fresh data
        const brickCount = data.brick_count || 0;
        const snapshotPayload = {
          symbol: requestBody.symbol,
          brick_size: parseFloat(body.brick_size || "0.5"),
          prices_fed: data.prices_fed || 0,
          total_bricks: brickCount,
          total_trades: data.total_trades || 0,
          total_pnl_bricks: data.total_pnl_bricks || 0,
          bricks: data.bricks || [],
          classified: data.classified || [],
          signals: data.signals || [],
          trades: data.trades || [],
          stats: data.stats || {},
          config: data.config || data.stats?.config || {},
          period: requestBody.period,
          updated_at: new Date().toISOString(),
        };

        // Update BFF-side caches (fire-and-forget)
        redis.setSnapshot(requestBody.symbol, snapshotPayload.brick_size, snapshotPayload).catch(() => {});
        try {
          await db.renkoSnapshot.upsert({
            data: snapshotPayload,
            onConflict: "symbol,brick_size",
          });
        } catch (dbErr) {
          console.warn("[warmup POST] Failed to update Supabase cache:", dbErr.message);
        }

        return Response.json({
          success: data.status === "ok",
          cached: data.source === "snapshot_restore" || data.source === "up_to_date",
          symbol: data.symbol,
          source: data.source,
          mode: data.mode,
          prices_fed: data.prices_fed || 0,
          brick_count: brickCount,
          total_bricks: brickCount,
          new_bricks: data.new_bricks || 0,
          total_trades: data.total_trades || 0,
          total_pnl_bricks: data.total_pnl_bricks || 0,
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
        error: `Rebuild failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
        code: "TIMEOUT",
      },
      { status: 504 }
    );
  } catch (err) {
    console.error("[warmup POST] Error:", err);
    return Response.json(
      { error: `Rebuild failed: ${err.message}` },
      { status: 500 }
    );
  }
}
