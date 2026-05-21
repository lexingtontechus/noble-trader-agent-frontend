/**
 * GET /api/stream/pnl
 *
 * BFF SSE Proxy for real-time P&L events from the FastAPI backend.
 *
 * This solves two problems:
 * 1. EventSource cannot send custom headers (like Authorization: Bearer <jwt>)
 *    → This BFF route attaches the JWT server-side before proxying
 * 2. CORS — the browser can't connect directly to the FastAPI SSE endpoint
 *    → This route proxies the SSE stream through the Next.js server
 *
 * Flow:
 * 1. Client creates EventSource('/api/stream/pnl')
 * 2. This route resolves a Clerk JWT, then opens SSE to FastAPI /sse/pnl
 * 3. Events are forwarded to the client in real-time
 *
 * Event types from backend:
 *   position_update  — triggered by fill or position change
 *   price_tick       — real-time quote for held position (throttled 1/s)
 *   pnl_snapshot     — aggregate P&L (every 5s)
 *   account_update   — equity/cash/buying_power change
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";

/** Maximum duration for an SSE proxy connection (10 minutes) */
const SSE_MAX_DURATION_MS = 10 * 60 * 1000;

export async function GET(request) {
  // Resolve JWT for backend auth
  const authHeaders = await getFastAPIAuthHeaders();

  if (!authHeaders["Authorization"] && !authHeaders["X-API-Key"]) {
    return Response.json(
      { error: "Not authenticated", code: "NO_AUTH" },
      { status: 401 },
    );
  }

  const sseUrl = `${FASTAPI_BASE}/sse/pnl`;

  try {
    // Open SSE connection to FastAPI with JWT auth
    const upstream = await fetch(sseUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...authHeaders,
      },
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error(`[SSE PnL Proxy] FastAPI returned ${upstream.status}:`, errorText);

      // Return structured error for frontend to handle
      if (upstream.status === 403) {
        return Response.json(
          { error: "No Alpaca API keys configured", code: "NO_KEYS" },
          { status: 403 },
        );
      }

      return Response.json(
        { error: `FastAPI SSE returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    // Create a TransformStream to proxy the SSE data
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Connection timeout — close after 10 minutes so the client can reconnect
    let timeoutId = setTimeout(async () => {
      try {
        await writer.close();
      } catch {
        // Writer may already be closed
      }
      console.log("[SSE PnL Proxy] Connection timeout, closing");
    }, SSE_MAX_DURATION_MS);

    // Stream the upstream response to our client
    (async () => {
      try {
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          await writer.write(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[SSE PnL Proxy] Stream error:", err.message);
      } finally {
        clearTimeout(timeoutId);
        try {
          await writer.close();
        } catch {
          // Writer may already be closed by timeout
        }
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error("[SSE PnL Proxy] Connection error:", error.message);

    if (error.name === "TimeoutError") {
      return Response.json(
        { error: "Backend timed out (cold start possible)", code: "TIMEOUT" },
        { status: 504 },
      );
    }

    return Response.json(
      { error: `SSE proxy failed: ${error.message}` },
      { status: 500 },
    );
  }
}
