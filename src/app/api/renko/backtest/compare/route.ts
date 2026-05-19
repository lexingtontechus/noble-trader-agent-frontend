/**
 * POST /api/renko/backtest/compare
 *
 * BFF proxy: compare multiple Renko pipeline configs side-by-side
 * via the FastAPI backend.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prices, symbol = "SPY", configs, timestamps, regimes } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 50) {
      return Response.json(
        { error: "prices array with min 50 ticks required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!configs || !Array.isArray(configs) || configs.length < 2) {
      return Response.json(
        { error: "configs array with min 2 configs required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      prices,
      symbol,
      configs,
    };

    if (timestamps) payload.timestamps = timestamps;
    if (regimes) payload.regimes = regimes;

    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/renko/backtest/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000), // 3 min for multi-config comparison
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
    console.error("[renko/backtest/compare] Error:", error);
    return Response.json(
      { error: `Renko backtest compare failed: ${(error as Error).message}`, code: "RENKO_COMPARE_ERROR" },
      { status: 500 }
    );
  }
}
