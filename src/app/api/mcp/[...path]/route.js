/**
 * BFF Proxy: /api/mcp/[...path]
 *
 * Proxies MCP (Model Context Protocol) requests from browser-based clients
 * to the FastAPI backend's /mcp endpoint, injecting Clerk JWT automatically.
 *
 * This enables:
 *   - Browser MCP clients (Claude.ai web, Cursor web, etc.) to use Clerk session auth
 *   - Same withAuth() middleware on the BFF route
 *   - No API key needed for browser clients — Clerk JWT is injected server-side
 *
 * Direct API key access (no BFF needed):
 *   External MCP clients (Claude Desktop, Cursor, CLI) should connect directly
 *   to the backend /mcp endpoint with X-API-Key: nt_live_... header.
 *
 * Supported MCP methods (JSON-RPC 2.0):
 *   - tools/list     → Discover available MCP tools
 *   - tools/call     → Execute an MCP tool
 *   - initialize     → MCP handshake
 *   - notifications  → MCP notifications
 */

import { withAuth } from "@/lib/withAuth";
import { FASTAPI_BASE } from "@/lib/config";

// MCP uses both JSON and SSE responses depending on the method
const UPSTREAM_MCP = `${FASTAPI_BASE}/mcp`;

/**
 * Get a Clerk JWT token to forward to the backend.
 * The backend's get_authed_user will verify this via Clerk JWKS.
 */
async function getClerkJwt(authContext) {
  // For Clerk-authenticated requests, we need to get a JWT that the
  // FastAPI backend can verify via Clerk JWKS.
  // The frontend's Clerk session provides this through the auth() API.
  // We use the FastAPI token endpoint to exchange the Clerk session for
  // a backend-verified token.
  try {
    const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/auth/fastapi-token`, {
      headers: { cookie: "" }, // Server-side call — no cookies needed
    });
    if (tokenRes.ok) {
      const data = await tokenRes.json();
      return data.token || data.access_token;
    }
  } catch {
    // Fallback: build auth headers from what we have
  }
  return null;
}

/**
 * Core proxy handler — forwards MCP requests to the backend.
 * Injects the user's Clerk JWT into the Authorization header so
 * the backend can verify the user's identity and permissions.
 */
async function mcpProxy(request, context, authContext) {
  const { userId, role, plan, isApiKey, apiKeyId } = authContext;

  // Build the target URL by stripping /api/mcp prefix and adding to backend /mcp
  const url = new URL(request.url);
  const pathSegments = url.pathname.replace("/api/mcp", "");
  const targetUrl = `${UPSTREAM_MCP}${pathSegments}${url.search}`;

  // Build headers to forward to backend
  const headers = {
    "Content-Type": request.headers.get("content-type") || "application/json",
    "Accept": request.headers.get("accept") || "application/json, text/event-stream",
  };

  // Inject auth: either API key or Clerk JWT
  if (isApiKey) {
    // If the BFF request came with an API key, we still forward it
    // (the original X-API-Key header from the client)
    const originalApiKey = request.headers.get("x-api-key");
    if (originalApiKey) {
      headers["X-API-Key"] = originalApiKey;
    }
  } else {
    // Clerk-authenticated request — get a backend-verifiable token
    try {
      // Use the server-side auth to get a FastAPI token
      const { auth } = await import("@clerk/nextjs/server");
      const { getToken } = await auth();
      const token = await getToken({ template: "fastapi" }) || await getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // If Clerk token extraction fails, try without auth
      // The backend will return 401 if auth is required
    }
  }

  // Forward the request body
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(30000), // 30s timeout for MCP calls
    });

    // Stream the response back — could be JSON or SSE
    const contentType = upstream.headers.get("content-type") || "application/json";
    const isSSE = contentType.includes("text/event-stream");

    if (isSSE) {
      // For SSE responses, stream back as-is
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

    // JSON response
    const responseData = await upstream.text();
    return new Response(responseData, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[mcp-proxy] Upstream error:", error.message);
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

// ── HTTP Methods ──────────────────────────────────────────────────────────────

// GET: MCP SSE stream (used by some MCP transports for server-initiated messages)
export const GET = withAuth(mcpProxy, {
  minRole: "viewer",
  rateTier: "data",
});

// POST: MCP JSON-RPC requests (tools/list, tools/call, initialize, etc.)
export const POST = withAuth(mcpProxy, {
  minRole: "viewer",
  rateTier: "data",
});

// DELETE: MCP session cleanup
export const DELETE = withAuth(mcpProxy, {
  minRole: "viewer",
  rateTier: "data",
});
