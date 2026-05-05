import { NextResponse } from "next/server";
import { optimisePortfolio } from "@/lib/fastapi-client";

/**
 * POST /api/optimise/full
 * BFF proxy for FastAPI POST /optimise/full
 *
 * Body: { symbols, returns_matrix, current_weights?, kelly_fraction?, target_vol?, max_dd? }
 *
 * returns_matrix: { "GC=F": [0.01, -0.02, ...], "BTC-USD": [...] }
 * current_weights: { "GC=F": 0.3, "BTC-USD": 0.7 } (optional — for comparing vs optimal)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { symbols, returns_matrix, ...options } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return NextResponse.json(
        { error: "At least 2 symbols required for portfolio optimization" },
        { status: 400 },
      );
    }

    if (!returns_matrix || typeof returns_matrix !== "object") {
      return NextResponse.json(
        {
          error:
            "returns_matrix is required (object of symbol → returns array)",
        },
        { status: 400 },
      );
    }

    const result = await optimisePortfolio(symbols, returns_matrix, options);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/optimise/full] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Portfolio optimization failed" },
      { status: 502 },
    );
  }
}
