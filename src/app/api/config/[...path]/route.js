/**
 * BFF proxy for FastAPI /config/* endpoints.
 *
 * Proxies all requests to the backend runtime config API:
 *   GET    /api/config/            → GET  /config/
 *   GET    /api/config/categories  → GET  /config/categories
 *   GET    /api/config/schema      → GET  /config/schema
 *   GET    /api/config/audit       → GET  /config/audit
 *   GET    /api/config/reload      → GET  /config/reload
 *   GET    /api/config/{category}  → GET  /config/{category}
 *   GET    /api/config/key/{key}   → GET  /config/key/{key}
 *   PATCH  /api/config/key/{key}   → PATCH /config/key/{key}
 *   POST   /api/config/key/{key}/reset → POST /config/key/{key}/reset
 */

import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_URL ||
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "http://localhost:8000";

export async function GET(request, { params }) {
  const pathSegments = (await params.path) || [];
  const backendPath = pathSegments.join("/");
  const backendUrl = `${FASTAPI_BASE}/config/${backendPath}`;
  const qs = request.nextUrl.search || "";

  try {
    const authHeaders = await getFastAPIAuthHeaders();
    const res = await fetch(`${backendUrl}${qs}`, {
      method: "GET",
      headers: { ...authHeaders },
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/config proxy]", err.message);
    return NextResponse.json(
      { detail: `Config API error: ${err.message}` },
      { status: 502 }
    );
  }
}

export async function PATCH(request, { params }) {
  const pathSegments = (await params.path) || [];
  const backendPath = pathSegments.join("/");
  const backendUrl = `${FASTAPI_BASE}/config/${backendPath}`;

  try {
    const body = await request.json();
    const authHeaders = await getFastAPIAuthHeaders();
    const res = await fetch(backendUrl, {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/config proxy PATCH]", err.message);
    return NextResponse.json(
      { detail: `Config API error: ${err.message}` },
      { status: 502 }
    );
  }
}

export async function POST(request, { params }) {
  const pathSegments = (await params.path) || [];
  const backendPath = pathSegments.join("/");
  const backendUrl = `${FASTAPI_BASE}/config/${backendPath}`;

  try {
    const authHeaders = await getFastAPIAuthHeaders();

    // Try to parse JSON body; some POST endpoints (like /reload) have no body
    let body = null;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        // No body — that's OK (e.g. /reload)
      }
    }

    const fetchOpts = {
      method: "POST",
      headers: {
        ...authHeaders,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(15000),
    };
    if (body) fetchOpts.body = JSON.stringify(body);

    const res = await fetch(backendUrl, fetchOpts);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/config proxy POST]", err.message);
    return NextResponse.json(
      { detail: `Config API error: ${err.message}` },
      { status: 502 }
    );
  }
}
