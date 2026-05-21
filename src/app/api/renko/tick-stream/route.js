/**
 * BFF Route: /api/renko/tick-stream
 * Batch tick streaming endpoint for the Renko pipeline.
 *
 * POST: Feed a batch of live ticks
 *   Body: { symbol, ticks: [{ price, timestamp }, ...] }
 *   Proxies to FastAPI /renko/tick/batch
 *   Also updates price cache if available
 *   Returns processed results
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol = "SPY", ticks = [] } = body;

    if (!Array.isArray(ticks) || ticks.length === 0) {
      return Response.json(
        { error: "ticks array is required and must be non-empty" },
        { status: 400 }
      );
    }

    // Validate tick structure
    for (const tick of ticks) {
      if (tick.price == null || typeof tick.price !== "number") {
        return Response.json(
          { error: `Invalid tick: price must be a number, got ${tick.price}` },
          { status: 400 }
        );
      }
    }

    // Extract prices and timestamps for the batch endpoint
    const prices = ticks.map((t) => t.price);
    const timestamps = ticks.map((t) =>
      t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000)
    );

    // Get auth headers
    const authHeaders = await getFastAPIAuthHeaders();

    // Proxy to FastAPI /renko/tick/batch
    const batchRes = await fetch(
      `${RENKO_BASE}/tick/batch?symbol=${encodeURIComponent(symbol)}`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prices,
          timestamps,
          symbol,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!batchRes.ok) {
      const contentType = batchRes.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        return Response.json(
          { error: "Backend is starting up. Please try again in a moment.", code: "COLD_START" },
          { status: 503 }
        );
      }
      const errData = await batchRes.json().catch(() => ({ detail: batchRes.statusText }));
      return Response.json(
        { error: errData.detail || `Backend error: HTTP ${batchRes.status}` },
        { status: batchRes.status }
      );
    }

    const data = await batchRes.json();

    // Optionally update price cache (non-critical)
    try {
      const lastTick = ticks[ticks.length - 1];
      if (lastTick?.price) {
        // Fire-and-forget cache update
        fetch(`/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`, {
          method: "GET",
        }).catch(() => {}); // Ignore cache update errors
      }
    } catch {
      // Non-critical
    }

    return Response.json({
      success: true,
      symbol,
      ticks_processed: ticks.length,
      bricks_created: data.bricks_created || [],
      total_bricks: data.total_bricks || 0,
      trades: data.trades || [],
      signal: data.signal || null,
    });
  } catch (err) {
    console.error("[tick-stream] Error:", err);
    return Response.json(
      { error: `Tick stream failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
