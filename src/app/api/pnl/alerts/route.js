/**
 * P&L Alert Thresholds BFF proxy
 *
 * GET  /api/pnl/alerts       — List all P&L alert thresholds
 * POST /api/pnl/alerts       — Create a P&L alert threshold
 * DELETE /api/pnl/alerts/:id — Delete a P&L alert threshold
 *
 * Proxies to FastAPI /pnl/alerts
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  // ── Rate limiting: 30 req/min per IP ───────────────────
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`pnl:alerts:${clientIp}`, 30, 60000);
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

  try {
    const res = await fetch(`${FASTAPI_BASE}/pnl/alerts`, {
      headers: { ...authHeaders },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Alerts fetch failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

export const POST = withAuth(async (request, context, authContext) => {
  // ── Rate limiting: 10 req/min per IP (writes are heavier) ──
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`pnl:alerts:write:${clientIp}`, 10, 60000);
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

  try {
    const body = await request.json();
    const res = await fetch(`${FASTAPI_BASE}/pnl/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return Response.json(
        { error: `Backend returned ${res.status}`, detail: errorData.detail },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Alert creation failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

export const DELETE = withAuth(async (request, context, authContext) => {
  // ── Rate limiting: 10 req/min per IP (writes are heavier) ──
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`pnl:alerts:write:${clientIp}`, 10, 60000);
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
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing alert ID" }, { status: 400 });
  }

  try {
    const res = await fetch(`${FASTAPI_BASE}/pnl/alerts/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Alert deletion failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
