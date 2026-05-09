/**
 * GET /api/stream/sse?symbol=SPY
 *
 * BFF SSE Proxy — proxies Server-Sent Events from the FastAPI backend.
 *
 * This solves CORS issues when the browser cannot connect directly to the
 * FastAPI SSE endpoint. The client can use this route instead of connecting
 * directly to the FastAPI server.
 *
 * Flow:
 * 1. Client creates EventSource(`/api/stream/sse?symbol=SPY`)
 * 2. This route fetches from FastAPI `/sse/SPY` and streams the response
 * 3. Events are forwarded to the client in real-time
 *
 * The client's useStreamPrice hook tries direct SSE first; if that fails
 * (CORS), it falls back to tick polling. This route provides a third option:
 * BFF-proxied SSE, which avoids CORS while still providing real-time updates.
 */

import { FASTAPI_BASE } from "@/lib/config";

/** Maximum duration for an SSE proxy connection (10 minutes) */
const SSE_MAX_DURATION_MS = 10 * 60 * 1000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ error: "symbol required" }, { status: 400 });
  }

  const sseUrl = `${FASTAPI_BASE}/sse/${encodeURIComponent(symbol)}`;

  try {
    // Fetch the SSE stream from FastAPI
    const upstream = await fetch(sseUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    if (!upstream.ok) {
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
      console.log(`[SSE Proxy] Connection timeout for ${symbol}, closing`);
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
        console.error(`[SSE Proxy] Stream error for ${symbol}:`, err.message);
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
    console.error(`[SSE Proxy] Connection error for ${symbol}:`, error.message);
    return Response.json(
      { error: `SSE proxy failed: ${error.message}` },
      { status: 500 },
    );
  }
}
