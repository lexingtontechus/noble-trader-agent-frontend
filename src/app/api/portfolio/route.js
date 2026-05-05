import { NextResponse } from "next/server";
import { getPortfolio } from "@/lib/fastapi-client";

/**
 * GET /api/portfolio
 * BFF proxy for FastAPI GET /portfolio
 *
 * Query params: symbols?, kelly_fraction?, target_vol?
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const options = {};

    if (searchParams.get("symbols"))
      options.symbols = searchParams.get("symbols");
    if (searchParams.get("kelly_fraction"))
      options.kelly_fraction = parseFloat(searchParams.get("kelly_fraction"));
    if (searchParams.get("target_vol"))
      options.target_vol = parseFloat(searchParams.get("target_vol"));

    const result = await getPortfolio(options);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/portfolio] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Portfolio fetch failed" },
      { status: 502 },
    );
  }
}
