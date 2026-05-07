import { optimisePortfolio } from "@/lib/fastapi-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getPositions } from "@/lib/alpaca-client";
import { getCached, setCache } from "@/lib/cache";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      positions: inputPositions,
      prices_data,
      target_return,
      risk_free_rate,
    } = body;

    // Get positions from Alpaca if not provided
    let positions = inputPositions;
    if (!positions || positions.length === 0) {
      const keys = await getAlpacaKeys();
      if (!keys?.apiKey || !keys?.secretKey) {
        return Response.json(
          { error: "Alpaca API keys not configured", code: "NO_KEYS" },
          { status: 403 },
        );
      }
      const alpacaPositions = await getPositions(keys.apiKey, keys.secretKey);
      positions = alpacaPositions.map((p) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty) || 0,
        market_value: parseFloat(p.market_value) || 0,
        current_price: parseFloat(p.current_price) || 0,
      }));
    }

    if (positions.length === 0) {
      return Response.json(
        {
          error: "No positions available to optimize",
          code: "NO_POSITIONS",
          hint: "Open some positions first to enable portfolio optimization",
        },
        { status: 400 },
      );
    }

    const symbols = positions.map((p) => p.symbol).sort();
    const cacheKey = `optimizer:${symbols.join(",")}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    const result = await optimisePortfolio(positions, prices_data || {}, {
      target_return,
      risk_free_rate,
    });
    setCache(cacheKey, result, 10 * 60 * 1000); // 10 min cache
    return Response.json(result);
  } catch (error) {
    console.error("Portfolio optimizer error:", error);

    // Check if the endpoint doesn't exist on the backend (404)
    const msg = (error.message || "").toLowerCase();
    if (
      msg.includes("404") ||
      msg.includes("not found") ||
      msg.includes("not_found")
    ) {
      return Response.json(
        {
          error: "Portfolio optimization is not yet available on the server",
          code: "ENDPOINT_NOT_DEPLOYED",
          hint: "This feature requires the /optimise/full endpoint to be deployed on the FastAPI backend. The backend service is being updated — check back soon.",
        },
        { status: 404 },
      );
    }

    // Auth-related errors
    if (
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("403")
    ) {
      return Response.json(
        {
          error: "Authentication required for portfolio optimization",
          code: "AUTH_REQUIRED",
          hint: "Please make sure you are signed in and try again.",
        },
        { status: 401 },
      );
    }

    return Response.json(
      {
        error: `Portfolio optimization failed: ${error.message}`,
        code: "OPTIMIZATION_ERROR",
      },
      { status: 500 },
    );
  }
}
