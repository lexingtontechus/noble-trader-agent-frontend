/**
 * GET /api/pnl/export
 *
 * BFF proxy for P&L CSV export from FastAPI /pnl/export.
 * Streams the CSV response directly to the client.
 *
 * Rate limiting: "write" tier (10 req/min × plan multiplier) — exports are heavier
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
  const sections = searchParams.get("sections") || "all";

  try {
    const res = await fetch(
      `${FASTAPI_BASE}/pnl/export?period=${period}&sections=${sections}`,
      {
        headers: { ...authHeaders },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json(
        { error: `Backend returned ${res.status}`, detail: errorText },
        { status: res.status }
      );
    }

    // Stream the CSV response
    const filename = res.headers.get("Content-Disposition")?.match(/filename="?(.+?)"?$/)?.[1] || `pnl_export_${period}.csv`;

    return new Response(res.body, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: `Export failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer", rateTier: "write" });
