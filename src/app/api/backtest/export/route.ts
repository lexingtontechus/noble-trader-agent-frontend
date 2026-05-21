/**
 * POST /api/backtest/export
 *
 * BFF proxy: exports a saved backtest result as CSV or JSON via the FastAPI backend.
 * Streams the response directly to the client.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, format = "json", sections = ["all"] } = body;

    if (!id || typeof id !== "string") {
      return Response.json(
        { error: "id (backtest result UUID) required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_BASE}/backtest/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ id, format, sections }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    // Stream the response (could be CSV or JSON file download)
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const contentDisposition = resp.headers.get("content-disposition") || "";

    return new Response(resp.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (error) {
    console.error("[backtest/export] Error:", error);
    return Response.json(
      { error: `Export failed: ${(error as Error).message}`, code: "EXPORT_ERROR" },
      { status: 500 }
    );
  }
}
