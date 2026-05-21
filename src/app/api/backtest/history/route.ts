/**
 * GET /api/backtest/history
 *
 * BFF proxy: fetches paginated backtest history from FastAPI backend.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request: Request, context: any, authContext: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const offset = searchParams.get("offset") || "0";
    const limit = searchParams.get("limit") || "20";

    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(
      `${FASTAPI_BASE}/backtest/history?offset=${offset}&limit=${limit}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (error) {
    console.error("[backtest/history] Error:", error);
    return Response.json(
      { error: `History fetch failed: ${(error as Error).message}`, code: "HISTORY_ERROR" },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
