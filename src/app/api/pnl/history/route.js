/**
 * GET /api/pnl/history
 *
 * BFF proxy for historical daily P&L with equity curve, cumulative P&L,
 * and drawdown derivation from FastAPI /pnl/history.
 *
 * Query params:
 *   period: 1W, 1M, 3M, 6M, 1A, all (default: 1M)
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  // ── Rate limiting: 30 req/min per IP ───────────────────
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`pnl:history:${clientIp}`, 30, 60000);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } }
    );
  }

  const authHeaders = await getFastAPIAuthHeaders();

  if (!authHeaders["Authorization"] && !authHeaders["X-API-Key"]) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "1M";

  try {
    const res = await fetch(
      `${FASTAPI_BASE}/pnl/history?period=${period}`,
      {
        headers: { ...authHeaders },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json(
        { error: `Backend returned ${res.status}`, detail: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Historical P&L fetch failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
