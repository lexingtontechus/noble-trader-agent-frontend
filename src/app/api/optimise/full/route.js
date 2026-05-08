import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      symbols,
      returns_matrix,
      current_weights,
      kelly_fraction,
      target_vol,
      max_dd,
    } = body;

    if (!symbols || !returns_matrix || symbols.length < 2) {
      return NextResponse.json(
        { error: "At least 2 symbols with returns data required" },
        { status: 400 },
      );
    }

    const payload = {
      symbols,
      returns_matrix,
      current_weights: current_weights || {},
      kelly_fraction: kelly_fraction || 0.5,
      target_vol: target_vol || 0.15,
    };
    if (max_dd) payload.max_dd = max_dd;

    const authHeaders = await getFastAPIAuthHeaders();

    const res = await fetch(`${FASTAPI_BASE}/optimise/full`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    // Guard against Render free-tier spin-up: HTML page returned instead of JSON
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("text/html")) {
        throw new Error(
          `Backend returned HTML instead of JSON (HTTP ${res.status}). The service may be starting up.`,
        );
      }
      const err = await res
        .json()
        .catch(() => ({ detail: `FastAPI error: ${res.status}` }));
      throw new Error(err.detail || err.error || `FastAPI ${res.status}`);
    }

    if (contentType.includes("text/html")) {
      throw new Error(
        "Backend returned HTML instead of JSON. The service may be starting up.",
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
