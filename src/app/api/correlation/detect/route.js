import { NextResponse } from "next/server";
import { detectCorrelation } from "@/lib/fastapi-client";

/**
 * POST /api/correlation/detect
 * BFF proxy for FastAPI POST /correlation/detect
 *
 * Body: { symbols, returns_matrix, window?, kelly_fraction?, target_vol? }
 *
 * returns_matrix is an object: { "GC=F": [0.01, -0.02, ...], "BTC-USD": [...] }
 * The BFF forwards it as-is to FastAPI which expects `returns_matrix` key.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { symbols, returns_matrix, ...options } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return NextResponse.json(
        { error: "At least 2 symbols required for correlation detection" },
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

    const result = await detectCorrelation(symbols, returns_matrix, options);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/correlation/detect] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Correlation detection failed" },
      { status: 502 },
    );
  }
}
