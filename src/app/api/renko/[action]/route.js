/**
 * BFF Route: /api/renko/[action]
 * Proxies requests to the FastAPI backend /renko/* endpoints.
 * Handles auth, Render cold starts, and error recovery.
 *
 * Rate limiting is now handled by withAuth() — auto-detected tier
 * (backtest for /renko/backtest/*, data for other /renko/* routes).
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

// Actions that require POST
const POST_ACTIONS = new Set([
  "tick",
  "tick-batch",
  "regime",
  "equity",
  "config",
  "reset",
  "warmup",
  "backtest-run",
  "backtest-stream",
  "backtest-optimize",
  "statistics-rigor",
  "execution-model",
  "live-toggle",
  "snapshot-restore",
]);

// Map action to backend path
function actionToPath(action) {
  const mapping = {
    state: "/state",
    stats: "/stats",
    bricks: "/bricks",
    classified: "/classified",
    signals: "/signals",
    trades: "/trades",
    "swing-points": "/swing-points",
    "backtest-stats": "/backtest/stats",
    tick: "/tick",
    "tick-batch": "/tick/batch",
    regime: "/regime",
    equity: "/equity",
    config: "/config",
    reset: "/reset",
    warmup: "/warmup",
    "backtest-run": "/backtest/run",
    "backtest-stream": "/backtest/run/stream",
    "backtest-optimize": "/backtest/optimize",
    "statistics-rigor": "/statistics/rigor",
    "execution-model": "/execution/model",
    "live-status": "/live/status",
    "live-toggle": "/live/toggle",
    "snapshot-restore": "/snapshot/restore",
    health: "/health",
    heartbeat: "/heartbeat",
    "heartbeat-all": "/heartbeat/all",
  };
  return mapping[action] || `/${action}`;
}

async function proxyRequest(request, params) {
  const { action } = await params;
  const url = new URL(request.url);
  const backendPath = actionToPath(action);

  // Build backend URL with query params
  const backendUrl = `${RENKO_BASE}${backendPath}?${url.searchParams.toString()}`;

  // Determine method
  const isPost = POST_ACTIONS.has(action);
  const method = isPost ? "POST" : "GET";

  // Get auth headers
  const authHeaders = await getFastAPIAuthHeaders();

  // Warmup needs a longer timeout (Yahoo fetch + pipeline processing can take 60s+)
  const isWarmup = action === "warmup";
  const timeout = isWarmup ? 120000 : 30000;

  const fetchOptions = {
    method,
    headers: {
      ...authHeaders,
      ...(isPost && { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(timeout),
  };

  // Forward body for POST requests
  if (isPost && request.body) {
    try {
      const body = await request.json();
      fetchOptions.body = JSON.stringify(body);
    } catch {
      // No body or invalid JSON — that's OK for some POST endpoints (e.g. reset)
    }
  }

  // Retry logic for Render cold starts
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(backendUrl, fetchOptions);

      // Handle HTML responses from Render spin-up
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        if (i === maxRetries - 1) {
          return Response.json(
            {
              error:
                "Backend service is starting up. Please try again in a moment.",
              code: "COLD_START",
            },
            { status: 503 }
          );
        }
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        return Response.json(data);
      }

      // Forward error from backend
      const errorData = await res.json().catch(() => ({
        detail: res.statusText,
      }));
      return Response.json(
        { error: errorData.detail || `Backend error: HTTP ${res.status}` },
        { status: res.status }
      );
    } catch (e) {
      if (i === maxRetries - 1) {
        return Response.json(
          { error: `Backend unavailable: ${e.message}`, code: "TIMEOUT" },
          { status: 504 }
        );
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

export const GET = withAuth(async (request, { params }) => proxyRequest(request, params), { minRole: "viewer" });
export const POST = withAuth(async (request, { params }) => proxyRequest(request, params), { minRole: "trader" });
