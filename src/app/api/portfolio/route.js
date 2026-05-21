import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { withAuth } from "@/lib/withAuth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get("symbols") || "";
    const kellyFraction = searchParams.get("kelly_fraction") || "0.5";
    const targetVol = searchParams.get("target_vol") || "0.15";

    const params = new URLSearchParams();
    if (symbols) params.set("symbols", symbols);
    params.set("kelly_fraction", kellyFraction);
    params.set("target_vol", targetVol);

    const authHeaders = await getFastAPIAuthHeaders();

    const res = await fetch(`${FASTAPI_BASE}/portfolio?${params.toString()}`, {
      headers: {
        ...authHeaders,
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ detail: `FastAPI error: ${res.status}` }));
      throw new Error(err.detail || err.error || `FastAPI ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, { minRole: "viewer" });
