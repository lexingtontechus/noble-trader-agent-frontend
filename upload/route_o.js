import { NextResponse } from "next/server";
import { simulateRegime } from "@/lib/fastapi-client";

/**
 * POST /api/simulate
 * BFF proxy for FastAPI POST /simulate/{symbol}
 *
 * Body: { symbol, prices, horizon?, n_paths?, seed?, current_price? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { symbol, prices, ...options } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(prices) || prices.length < 81) {
      return NextResponse.json(
        {
          error: `Need at least 81 price bars, got ${Array.isArray(prices) ? prices.length : 0}`,
        },
        { status: 400 },
      );
    }

    const result = await simulateRegime(symbol, prices, options);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/simulate] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Simulation failed" },
      { status: 502 },
    );
  }
}
