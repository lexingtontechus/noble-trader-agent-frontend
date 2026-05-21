/**
 * POST /api/backtest/compare
 *
 * BFF proxy: compares two or more saved backtest results via FastAPI backend.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request: Request, context: any, authContext: any) => {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return Response.json(
        { error: "ids array with min 2 backtest IDs required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/backtest/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ ids }),
    });

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
    console.error("[backtest/compare] Error:", error);
    return Response.json(
      { error: `Compare failed: ${(error as Error).message}`, code: "COMPARE_ERROR" },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
