/**
 * GET /api/pnl/intraday
 *
 * BFF proxy for intraday P&L time-bucketed data from FastAPI /pnl/intraday.
 *
 * Query params:
 *   timeframe: 5Min, 15Min, 1Hour, 1Day
 *   period: 1D, 1W, 1M, 3M, 6M, 1A, all
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

export async function GET(request) {
  // ── Rate limiting: 30 req/min per IP ───────────────────
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`pnl:intraday:${clientIp}`, 30, 60000);
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
  const timeframe = searchParams.get("timeframe") || "15Min";
  const period = searchParams.get("period") || "1D";

  try {
    const res = await fetch(
      `${FASTAPI_BASE}/pnl/intraday?timeframe=${timeframe}&period=${period}`,
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
      { error: `Intraday fetch failed: ${error.message}` },
      { status: 500 }
    );
  }
}
