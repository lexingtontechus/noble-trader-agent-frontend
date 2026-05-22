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
 * IMPORTANT: EventSource cannot read HTTP status codes — any non-200 response
 * triggers onerror with no status info, causing an infinite reconnect loop.
 * Therefore, ALL errors from the upstream FastAPI backend are converted to
 * SSE events (credentials_error, backend_error) and returned as HTTP 200
 * with Content-Type: text/event-stream. The client handles these events
 * gracefully instead of reconnecting blindly.
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
import { withAuth } from "@/lib/withAuth";

/** Maximum duration for an SSE proxy connection (10 minutes) */
const SSE_MAX_DURATION_MS = 10 * 60 * 1000;

export const GET = withAuth(async (request, context, authContext) => {
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

      // CRITICAL: EventSource cannot read HTTP status codes. Any non-200
      // response triggers onerror → reconnect loop forever. We MUST return
      // SSE events for ALL error types so the client can handle gracefully.
      let sseEvent;
      if (upstream.status === 403) {
        // No Alpaca API keys configured (or other authz failure)
        let code = "NO_KEYS";
        let message = "No Alpaca API keys configured. Connect keys in settings.";
        try {
          const detail = JSON.parse(errorText);
          if (detail?.detail?.includes?.("Alpaca")) code = "NO_KEYS";
          if (detail?.detail) message = detail.detail;
        } catch { /* not JSON, use defaults */ }
        sseEvent = { event: "credentials_error", data: { code, message } };
      } else if (upstream.status === 401) {
        // JWT rejected by backend (expired, invalid, or missing)
        sseEvent = {
          event: "credentials_error",
          data: { code: "AUTH_EXPIRED", message: "Authentication expired. Please refresh the page." },
        };
      } else if (upstream.status === 429) {
        // Rate limited by backend
        sseEvent = {
          event: "backend_error",
          data: { code: "RATE_LIMITED", message: "Too many requests. Retrying shortly..." },
        };
      } else if (upstream.status >= 500) {
        // Backend error (likely cold start)
        sseEvent = {
          event: "backend_error",
          data: { code: "UPSTREAM_ERROR", message: `Backend returned ${upstream.status}. Retrying...` },
        };
      } else {
        // Other client errors
        sseEvent = {
          event: "backend_error",
          data: { code: `HTTP_${upstream.status}`, message: `Unexpected error (${upstream.status}).` },
        };
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send the error event as SSE, then close the stream
      (async () => {
        try {
          await writer.write(encoder.encode(
            `data: ${JSON.stringify({
              ...sseEvent,
              timestamp: Date.now() / 1000,
            })}\n\n`
          ));
        } catch { /* ignore */ }
        try { await writer.close(); } catch { /* ignore */ }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
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
}, { minRole: "viewer" });
