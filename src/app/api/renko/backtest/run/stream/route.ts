/**
 * POST /api/renko/backtest/run/stream
 *
 * BFF proxy: streams a Renko backtest with progressive chunked results.
 * Pipes the SSE stream from FastAPI `/renko/backtest/run/stream` directly
 * to the client, enabling the frontend to render partial equity curves
 * and live-updating statistics as chunks are processed.
 *
 * The frontend uses `fetch()` + `ReadableStream` (not `EventSource`)
 * because this is a POST request with a JSON body.
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

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

    // ── Check Redis L1 cache first — if HIT, return as a single SSE complete event ──
    const { redis } = await import("@/lib/redis");
    const cacheConfig = { ...payload };
    delete cacheConfig.prices;
    (cacheConfig as Record<string, unknown>)._price_fingerprint = `${prices.length}:${prices[0]}:${prices[prices.length - 1]}`;

    const cached = await redis.getBacktestCache(symbol, cacheConfig);
    if (cached) {
      // Return a single SSE event with the cached result
      const sseData = `data: ${JSON.stringify({ type: "complete", ...cached, cached: true })}\n\n`;
      return new Response(sseData, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Cache miss: pipe SSE stream from FastAPI ──────────────────────────────
    const authHeaders = await getFastAPIAuthHeaders();

    const upstreamResp = await fetch(`${FASTAPI_URL}/renko/backtest/run/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000), // 3 min for large backtests
    });

    if (!upstreamResp.ok) {
      const text = await upstreamResp.text();
      return Response.json(
        { error: `FastAPI returned ${upstreamResp.status}`, detail: text.slice(0, 500) },
        { status: upstreamResp.status }
      );
    }

    if (!upstreamResp.body) {
      return Response.json(
        { error: "No response body from streaming endpoint", code: "STREAM_ERROR" },
        { status: 500 }
      );
    }

    // ── Pipe the SSE stream through to the client ─────────────────────────────
    // We also tee the stream to capture the final result for Redis caching.
    const reader = upstreamResp.body.getReader();
    const encoder = new TextEncoder();

    let buffer = ""; // Accumulate partial SSE data
    let finalResult: Record<string, unknown> | null = null;

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();

          if (done) {
            // Stream ended — cache the final result if we captured one
            if (finalResult) {
              redis.setBacktestCache(symbol, cacheConfig, finalResult).catch(() => {
                // Cache write failure is non-critical
              });
            }
            controller.close();
            return;
          }

          // Pass through the raw bytes
          controller.enqueue(value);

          // Also accumulate text to detect the "complete" event for caching
          buffer += new TextDecoder().decode(value, { stream: true });

          // Parse SSE lines looking for the "complete" event
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(line.slice(6));
                if (eventData.type === "complete" && !eventData.cached) {
                  // Capture for caching (without the 'type' and 'cached' fields)
                  finalResult = {
                    symbol,
                    total_ticks: eventData.total_ticks,
                    total_bricks: eventData.total_bricks,
                    config_used: eventData.config_used,
                    stats: eventData.stats?.journal || eventData.stats,
                    trades: eventData.trades,
                  };
                }
              } catch {
                // Malformed SSE data — skip
              }
            }
          }
        } catch (err) {
          console.error("[renko/backtest/run/stream] Stream read error:", err);
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[renko/backtest/run/stream] Error:", error);
    return Response.json(
      { error: `Renko backtest stream failed: ${(error as Error).message}`, code: "RENKO_STREAM_ERROR" },
      { status: 500 }
    );
  }
}
