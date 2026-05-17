/**
 * BFF Route: /api/renko/warmup
 * Fetches historical prices from Yahoo Finance and feeds them
 * into the Renko pipeline via tick/batch to warm it up.
 *
 * POST /api/renko/warmup  { symbol, period }
 */

import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

// Chunk size for batch requests (Render free tier has request limits)
const CHUNK_SIZE = 150;

export async function POST(request) {
  try {
    const body = await request.json();
    const symbol = body.symbol || "SPY";
    const period = body.period || "6mo";

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

    // Step 5: Get final state
    let finalState = null;
    try {
      const stateRes = await fetch(
        `${RENKO_BASE}/state?symbol=${encodeURIComponent(symbol)}`,
        { headers: authHeaders, signal: AbortSignal.timeout(10000) }
      );
      if (stateRes.ok) finalState = await stateRes.json();
    } catch {}

    return Response.json({
      success: true,
      symbol,
      prices_fed: prices.length,
      chunks_processed: chunksProcessed,
      total_chunks: totalChunks,
      total_bricks: totalBricks,
      total_trades: totalTrades,
      price_range: {
        min: Math.min(...prices),
        max: Math.max(...prices),
      },
      final_state: finalState,
    });
  } catch (err) {
    console.error("[warmup] Error:", err);
    return Response.json(
      { error: `Warm-up failed: ${err.message}` },
      { status: 500 }
    );
  }
}
