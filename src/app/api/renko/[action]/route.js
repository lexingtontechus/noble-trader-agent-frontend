/**
 * BFF Route: /api/renko/[action]
 * Proxies requests to the FastAPI backend /renko/* endpoints.
 * Handles auth, Render cold starts, and error recovery.
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

const RENKO_BASE = `${FASTAPI_BASE}/renko`;

// Actions that require POST
const POST_ACTIONS = new Set([
  "tick",
  "tick-batch",
  "regime",
  "equity",
  "config",
  "reset",
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
    "backtest-run": "/backtest/run",
    "backtest-stream": "/backtest/run/stream",
    "backtest-optimize": "/backtest/optimize",
    "statistics-rigor": "/statistics/rigor",
    "execution-model": "/execution/model",
    "live-status": "/live/status",
    "live-toggle": "/live/toggle",
    "snapshot-restore": "/snapshot/restore",
  };
  return mapping[action] || `/${action}`;
}

// Rate limit config per action type
// Write operations are more restricted than reads
const RATE_LIMITS = {
  // Heavy write ops: 10 req/min per IP
  heavy: { max: 10, windowMs: 60000 },
  // Standard write ops: 30 req/min per IP
  write: { max: 30, windowMs: 60000 },
  // Read ops: 60 req/min per IP
  read: { max: 60, windowMs: 60000 },
};

// Map actions to rate limit tiers
const ACTION_TIERS = {
  tick: "heavy",
  "tick-batch": "heavy",
  "backtest-run": "heavy",
  "backtest-stream": "heavy",
  "backtest-optimize": "heavy",
  warmup: "heavy",
  reset: "heavy",
  "live-toggle": "heavy",
  config: "write",
  regime: "write",
  equity: "write",
  "snapshot-restore": "write",
  "signal-alert": "write",
  // All other actions default to "read"
};

async function proxyRequest(request, params) {
  const { action } = await params;

  // ── Rate limiting ────────────────────────────────────────
  const clientIp = getClientIp(request);
  const tier = ACTION_TIERS[action] || "read";
  const limit = RATE_LIMITS[tier];
  const rateLimitKey = `renko:${action}:${clientIp}`;
  const rateCheck = checkRateLimit(rateLimitKey, limit.max, limit.windowMs);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateCheck.resetAt),
        },
      }
    );
  }

  const url = new URL(request.url);
  const backendPath = actionToPath(action);

  // Build backend URL with query params
  const backendUrl = `${RENKO_BASE}${backendPath}?${url.searchParams.toString()}`;

  // Determine method
  const isPost = POST_ACTIONS.has(action);
  const method = isPost ? "POST" : "GET";

  // Get auth headers
  const authHeaders = await getFastAPIAuthHeaders();

  const fetchOptions = {
    method,
    headers: {
      ...authHeaders,
      ...(isPost && { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(30000),
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

export async function GET(request, { params }) {
  return proxyRequest(request, params);
}

export async function POST(request, { params }) {
  return proxyRequest(request, params);
}
