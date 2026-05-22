/**
 * GET /api/stream/pnl
 *
 * BFF SSE Proxy for real-time P&L events.
 *
 * IMPORTANT: This route first checks for Alpaca credentials locally
 * (Supabase/Clerk) before proxying to FastAPI. This prevents false
 * "NO_KEYS" errors when the user HAS keys but the FastAPI backend
 * doesn't support the /sse/pnl endpoint yet.
 *
 * Credential resolution flow:
 *   1. Check Supabase user_credentials (primary)
 *   2. Check Clerk privateMetadata (legacy fallback)
 *   3. If keys found → proxy to FastAPI /sse/pnl
 *   4. If no keys → return SSE credentials_error event
 *
 * EventSource cannot send custom headers (like Authorization: Bearer <jwt>)
 * so this BFF route attaches the JWT server-side before proxying.
 * ALL errors are converted to SSE events so the client handles them
 * gracefully instead of reconnecting blindly.
 */

import { getAlpacaCredentialKeys } from "@/lib/alpaca-credentials";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

/** Maximum duration for an SSE proxy connection (10 minutes) */
const SSE_MAX_DURATION_MS = 10 * 60 * 1000;

export const GET = withAuth(async (request, context, authContext) => {
  // ── Step 1: Verify Alpaca credentials exist ─────────────────────────────
  // This check happens BEFORE proxying to FastAPI, so we can give
  // accurate NO_KEYS errors instead of FastAPI's generic 403.
  const keys = await getAlpacaCredentialKeys("paper", request);
  if (!keys?.apiKey || !keys?.secretKey) {
    return sseErrorResponse({
      event: "credentials_error",
      data: {
        code: "NO_KEYS",
        message: "No Alpaca API keys configured. Connect keys in settings.",
      },
    });
  }

  // ── Step 2: Resolve JWT for backend auth ────────────────────────────────
  const authHeaders = await getFastAPIAuthHeaders();

  if (!authHeaders["Authorization"] && !authHeaders["X-API-Key"]) {
    return sseErrorResponse({
      event: "credentials_error",
      data: {
        code: "AUTH_EXPIRED",
        message: "Authentication expired. Please refresh the page.",
      },
    });
  }

  // ── Step 3: Proxy SSE to FastAPI backend ────────────────────────────────
  const sseUrl = `${FASTAPI_BASE}/sse/pnl`;

  try {
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

      // Map HTTP errors to SSE events
      let sseEvent;
      if (upstream.status === 404) {
        // Endpoint not implemented on FastAPI yet — treat as backend unavailable
        // NOT a credentials error (we already verified keys exist above)
        sseEvent = {
          event: "backend_error",
          data: { code: "ENDPOINT_NOT_IMPLEMENTED", message: "P&L streaming not yet available on backend. Using polling fallback." },
        };
      } else if (upstream.status === 403) {
        sseEvent = {
          event: "backend_error",
          data: { code: "UPSTREAM_FORBIDDEN", message: "Backend auth rejected. Retrying..." },
        };
      } else if (upstream.status === 401) {
        sseEvent = {
          event: "credentials_error",
          data: { code: "AUTH_EXPIRED", message: "Authentication expired. Please refresh the page." },
        };
      } else if (upstream.status === 429) {
        sseEvent = {
          event: "backend_error",
          data: { code: "RATE_LIMITED", message: "Too many requests. Retrying shortly..." },
        };
      } else if (upstream.status >= 500) {
        sseEvent = {
          event: "backend_error",
          data: { code: "UPSTREAM_ERROR", message: `Backend returned ${upstream.status}. Retrying...` },
        };
      } else {
        sseEvent = {
          event: "backend_error",
          data: { code: `HTTP_${upstream.status}`, message: `Unexpected error (${upstream.status}).` },
        };
      }

      return sseErrorResponse(sseEvent);
    }

    // ── Stream the upstream SSE response ─────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Connection timeout — close after 10 minutes
    let timeoutId = setTimeout(async () => {
      try { await writer.close(); } catch { /* ignore */ }
      console.log("[SSE PnL Proxy] Connection timeout, closing");
    }, SSE_MAX_DURATION_MS);

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
        try { await writer.close(); } catch { /* ignore */ }
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[SSE PnL Proxy] Connection error:", error.message);

    if (error.name === "TimeoutError") {
      return sseErrorResponse({
        event: "backend_error",
        data: { code: "TIMEOUT", message: "Backend timed out (cold start possible). Retrying..." },
      });
    }

    return sseErrorResponse({
      event: "backend_error",
      data: { code: "CONNECTION_ERROR", message: `SSE proxy failed: ${error.message}` },
    });
  }
}, { minRole: "viewer" });

/**
 * Return an SSE error event as HTTP 200 with Content-Type: text/event-stream.
 *
 * CRITICAL: EventSource cannot read HTTP status codes. Any non-200
 * response triggers onerror → infinite reconnect loop. We MUST return
 * SSE events for ALL error types so the client handles gracefully.
 */
function sseErrorResponse({ event, data }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({
          event,
          data,
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
