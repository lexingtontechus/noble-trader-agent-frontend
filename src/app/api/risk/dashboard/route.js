/**
 * GET /api/risk/dashboard
 *
 * BFF proxy for live portfolio risk metrics from FastAPI /risk/dashboard.
 *
 * Rate limiting: auto-detected "data" tier via withAuth (60 req/min × plan multiplier)
 */

import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  const authHeaders = await getFastAPIAuthHeaders();

  if (!authHeaders["Authorization"] && !authHeaders["X-API-Key"]) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "1M";

  try {
    const res = await fetch(
      `${FASTAPI_BASE}/risk/dashboard?period=${period}`,
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
      { error: `Risk dashboard fetch failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
