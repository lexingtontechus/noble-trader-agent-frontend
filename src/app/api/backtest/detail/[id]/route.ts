/**
 * GET /api/backtest/detail/[id]
 *
 * BFF proxy: fetches a single backtest result by ID from FastAPI backend.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
  authContext: any
) => {
  try {
    const { id } = await context.params;
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/backtest/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
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
    console.error("[backtest/detail] Error:", error);
    return Response.json(
      { error: `Detail fetch failed: ${(error as Error).message}`, code: "DETAIL_ERROR" },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

/**
 * DELETE /api/backtest/detail/[id]
 *
 * BFF proxy: deletes a backtest result by ID from FastAPI backend.
 */
export const DELETE = withAuth(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
  authContext: any
) => {
  try {
    const { id } = await context.params;
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/backtest/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });

    if (resp.status === 204) {
      return new Response(null, { status: 204 });
    }

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[backtest/detail DELETE] Error:", error);
    return Response.json(
      { error: `Delete failed: ${(error as Error).message}`, code: "DELETE_ERROR" },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
