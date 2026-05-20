/**
 * GET /api/backtest/detail/[id]
 *
 * BFF proxy: fetches a single backtest result by ID from FastAPI backend.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/backtest/${id}`, {
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
}

/**
 * DELETE /api/backtest/detail/[id]
 *
 * BFF proxy: deletes a backtest result by ID from FastAPI backend.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/backtest/${id}`, {
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
}
