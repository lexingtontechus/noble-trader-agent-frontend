/**
 * BFF Route: /api/renko/warmup
 * Fetches historical prices from Yahoo Finance, feeds them into the Renko
 * pipeline via tick/batch, then saves the full snapshot to Supabase for
 * instant loading on subsequent visits (no re-warmup needed).
 *
 * POST /api/renko/warmup  { symbol, period, force }
 * GET  /api/renko/warmup?symbol=SPY  — load cached snapshot
 */

import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { db } from "@/lib/supabase/db";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

// Chunk size for batch requests (Render free tier has request limits)
const CHUNK_SIZE = 150;

// ── GET: Load cached snapshot from Supabase ────────────────────────────────

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") || "SPY";
    const brickSize = parseFloat(url.searchParams.get("brick_size") || "0.5");

    const snapshot = await db.renkoSnapshot.findFirst({
      where: { symbol, brick_size: brickSize },
    });

    if (!snapshot) {
      return Response.json({ cached: false, symbol });
    }

    // Check if cache is stale (>4 hours old)
    const age = Date.now() - new Date(snapshot.updated_at).getTime();
    const maxAge = 4 * 60 * 60 * 1000; // 4 hours
    const stale = age > maxAge;

    return Response.json({
      cached: true,
      stale,
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

// ── POST: Warm up pipeline and save to Supabase ───────────────────────────

export async function POST(request) {
  try {
    const body = await request.json();
    const symbol = body.symbol || "SPY";
    const period = body.period || "6mo";
    const brickSize = parseFloat(body.brick_size || "0.5");
    const force = body.force || false;

    // Check for existing snapshot (skip warmup if fresh)
    if (!force) {
      try {
        const existing = await db.renkoSnapshot.findFirst({
          where: { symbol, brick_size: brickSize },
        });
        if (existing) {
          const age = Date.now() - new Date(existing.updated_at).getTime();
          const maxAge = 4 * 60 * 60 * 1000; // 4 hours
          if (age < maxAge) {
            // Fresh cache — return it directly without re-warming
            return Response.json({
              success: true,
              cached: true,
              symbol,
              prices_fed: existing.prices_fed,
              total_bricks: existing.total_bricks,
              total_trades: existing.total_trades,
              total_pnl_bricks: existing.total_pnl_bricks,
              bricks: existing.bricks,
              classified: existing.classified,
              signals: existing.signals,
              trades: existing.trades,
              stats: existing.stats,
              config: existing.config,
              price_range: existing.price_range,
              period: existing.period,
              updated_at: existing.updated_at,
            });
          }
        }
      } catch (cacheErr) {
        console.warn("[warmup] Cache check failed, proceeding with warmup:", cacheErr.message);
      }
    }

    // Step 1: Fetch historical prices from Yahoo Finance
    const priceData = await fetchHistoricalPrices(symbol, period);

    if (!priceData.prices || priceData.prices.length < 10) {
      return Response.json(
        { error: `Insufficient price data for ${symbol}: ${priceData.count} bars` },
        { status: 400 }
      );
    }

    // Step 2: Reset the pipeline first
    const authHeaders = await getFastAPIAuthHeaders();
    const resetRes = await fetch(`${RENKO_BASE}/reset?symbol=${encodeURIComponent(symbol)}`, {
      method: "POST",
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });

    if (!resetRes.ok) {
      console.warn("[warmup] Reset failed, continuing anyway");
    }

    // Step 3: Set regime to low_vol_bull for warm-up (allows signals)
    await fetch(`${RENKO_BASE}/regime?symbol=${encodeURIComponent(symbol)}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ regime: "low_vol_bull" }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {}); // Non-critical

    // Step 4: Feed prices in chunks via tick/batch
    const prices = priceData.prices;
    let totalBricks = 0;
    let totalTrades = 0;
    let chunksProcessed = 0;
    const totalChunks = Math.ceil(prices.length / CHUNK_SIZE);

    for (let i = 0; i < prices.length; i += CHUNK_SIZE) {
      const chunk = prices.slice(i, i + CHUNK_SIZE);
      const timestamps = chunk.map((_, idx) => {
        // Generate market-hours timestamps
        const dayOffset = Math.floor((i + idx) / 390);
        const minuteOffset = (i + idx) % 390;
        return 1716292200 + dayOffset * 86400 + minuteOffset * 60;
      });

      try {
        const batchRes = await fetch(`${RENKO_BASE}/tick/batch`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prices: chunk,
            timestamps,
            regimes: Array(chunk.length).fill("low_vol_bull"),
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (batchRes.ok) {
          const data = await batchRes.json();
          totalBricks += data.total_bricks || 0;
          totalTrades += (data.trades || []).length;
        }

        chunksProcessed++;
      } catch (chunkErr) {
        console.warn(`[warmup] Chunk ${chunksProcessed} failed:`, chunkErr.message);
      }
    }

    // Step 5: Fetch full pipeline data from backend
    const [bricksRes, classifiedRes, signalsRes, tradesRes, statsRes] = await Promise.allSettled([
      fetch(`${RENKO_BASE}/bricks?symbol=${encodeURIComponent(symbol)}&last_n=500`, {
        headers: authHeaders, signal: AbortSignal.timeout(10000),
      }),
      fetch(`${RENKO_BASE}/classified?symbol=${encodeURIComponent(symbol)}&last_n=500`, {
        headers: authHeaders, signal: AbortSignal.timeout(10000),
      }),
      fetch(`${RENKO_BASE}/signals?symbol=${encodeURIComponent(symbol)}&last_n=100`, {
        headers: authHeaders, signal: AbortSignal.timeout(10000),
      }),
      fetch(`${RENKO_BASE}/trades?symbol=${encodeURIComponent(symbol)}&last_n=100`, {
        headers: authHeaders, signal: AbortSignal.timeout(10000),
      }),
      fetch(`${RENKO_BASE}/stats?symbol=${encodeURIComponent(symbol)}`, {
        headers: authHeaders, signal: AbortSignal.timeout(10000),
      }),
    ]);

    const bricks = bricksRes.status === "fulfilled" && bricksRes.value.ok ? await bricksRes.value.json() : [];
    const classified = classifiedRes.status === "fulfilled" && classifiedRes.value.ok ? await classifiedRes.value.json() : [];
    const signals = signalsRes.status === "fulfilled" && signalsRes.value.ok ? await signalsRes.value.json() : [];
    const trades = tradesRes.status === "fulfilled" && tradesRes.value.ok ? await tradesRes.value.json() : [];
    const stats = statsRes.status === "fulfilled" && statsRes.value.ok ? await statsRes.value.json() : {};

    const config = stats?.config || {};
    const totalPnlBricks = stats?.state?.total_pnl_bricks || 0;

    // Step 6: Save to Supabase (upsert by symbol + brick_size)
    try {
      const snapshotData = {
        symbol,
        brick_size: brickSize,
        prices_fed: prices.length,
        total_bricks: totalBricks,
        total_trades: totalTrades,
        total_pnl_bricks: totalPnlBricks,
        bricks: Array.isArray(bricks) ? bricks : [],
        classified: Array.isArray(classified) ? classified : [],
        signals: Array.isArray(signals) ? signals : [],
        trades: Array.isArray(trades) ? trades : [],
        stats: stats || {},
        config: config || {},
        price_range: {
          min: Math.min(...prices),
          max: Math.max(...prices),
        },
        period,
        updated_at: new Date().toISOString(),
      };

      // Try update first, then create
      const existing = await db.renkoSnapshot.findFirst({
        where: { symbol, brick_size: brickSize },
      });

      if (existing) {
        await db.renkoSnapshot.update({
          where: { id: existing.id },
          data: snapshotData,
        });
      } else {
        await db.renkoSnapshot.create({ data: snapshotData });
      }

      console.log(`[warmup] Saved snapshot for ${symbol}: ${totalBricks} bricks, ${totalTrades} trades`);
    } catch (dbErr) {
      console.warn("[warmup] Failed to save to Supabase:", dbErr.message);
      // Non-critical — still return the data
    }

    return Response.json({
      success: true,
      cached: false,
      symbol,
      prices_fed: prices.length,
      chunks_processed: chunksProcessed,
      total_chunks: totalChunks,
      total_bricks: totalBricks,
      total_trades: totalTrades,
      total_pnl_bricks: totalPnlBricks,
      bricks: Array.isArray(bricks) ? bricks : [],
      classified: Array.isArray(classified) ? classified : [],
      signals: Array.isArray(signals) ? signals : [],
      trades: Array.isArray(trades) ? trades : [],
      stats: stats || {},
      config: config || {},
      price_range: {
        min: Math.min(...prices),
        max: Math.max(...prices),
      },
    });
  } catch (err) {
    console.error("[warmup] Error:", err);
    return Response.json(
      { error: `Warm-up failed: ${err.message}` },
      { status: 500 }
    );
  }
}
