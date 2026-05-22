/**
 * MCP Root Route: /api/mcp
 *
 * Handles MCP requests to the root /api/mcp path (no sub-path).
 * Proxies to the backend's /mcp endpoint with Clerk JWT injection.
 *
 * This is needed because the catch-all [...path] route only matches
 * paths with at least one segment (e.g., /api/mcp/tools/list).
 * The root /api/mcp path is handled here.
 *
 * See /api/mcp/[...path]/route.js for the full proxy implementation.
 */

import { withAuth } from "@/lib/withAuth";
import { FASTAPI_BASE } from "@/lib/config";

const UPSTREAM_MCP = `${FASTAPI_BASE}/mcp`;

async function mcpRootProxy(request, context, authContext) {
  const { userId, role, plan, isApiKey } = authContext;

  // Build headers
  const headers = {
    "Content-Type": request.headers.get("content-type") || "application/json",
    "Accept": request.headers.get("accept") || "application/json, text/event-stream",
  };

  // Inject auth
  if (isApiKey) {
    const originalApiKey = request.headers.get("x-api-key");
    if (originalApiKey) {
      headers["X-API-Key"] = originalApiKey;
    }
  } else {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { getToken } = await auth();
      const token = await getToken({ template: "fastapi" }) || await getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // Proceed without auth — backend will return 401 if needed
    }
  }

  // Forward request body
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  try {
    const upstream = await fetch(UPSTREAM_MCP, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    const isSSE = contentType.includes("text/event-stream");

    if (isSSE) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const responseData = await upstream.text();
    return new Response(responseData, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[mcp-root-proxy] Upstream error:", error.message);
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "MCP proxy error: backend unreachable",
          data: { detail: error.message },
        },
        id: null,
      },
      { status: 502 }
    );
  }
}

export const GET = withAuth(mcpRootProxy, { minRole: "viewer", rateTier: "data" });
export const POST = withAuth(mcpRootProxy, { minRole: "viewer", rateTier: "data" });
export const DELETE = withAuth(mcpRootProxy, { minRole: "viewer", rateTier: "data" });
