import { detectCorrelation } from "@/lib/fastapi-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getPositions } from "@/lib/alpaca-client";
import { getCached, setCache } from "@/lib/cache";

export async function POST(request) {
  try {
    const body = await request.json();
    const { symbols, returns_data } = body;

    // Get symbols from positions if not provided
    let targetSymbols = symbols;
    if (!targetSymbols || targetSymbols.length === 0) {
      const keys = await getAlpacaKeys();
      if (!keys?.apiKey || !keys?.secretKey) {
        return Response.json(
          { error: "Alpaca API keys not configured", code: "NO_KEYS" },
          { status: 403 },
        );
      }
      const positions = await getPositions(keys.apiKey, keys.secretKey);
      targetSymbols = positions.map((p) => p.symbol).filter(Boolean);
    }

    if (targetSymbols.length < 2) {
      return Response.json(
        {
          error: "At least 2 symbols are required for correlation analysis",
          code: "INSUFFICIENT_SYMBOLS",
          hint: "Add more positions to your portfolio to enable correlation detection",
        },
        { status: 400 },
      );
    }

    const cacheKey = `correlation:${targetSymbols.sort().join(",")}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    const result = await detectCorrelation(targetSymbols, returns_data || {});
    setCache(cacheKey, result, 10 * 60 * 1000); // 10 min cache
    return Response.json(result);
  } catch (error) {
    console.error("Correlation detection error:", error);

    // Check if the endpoint doesn't exist on the backend (404)
    const msg = (error.message || "").toLowerCase();
    if (
      msg.includes("404") ||
      msg.includes("not found") ||
      msg.includes("not_found")
    ) {
      return Response.json(
        {
          error: "Correlation detection is not yet available on the server",
          code: "ENDPOINT_NOT_DEPLOYED",
          hint: "This feature requires the /correlation/detect endpoint to be deployed on the FastAPI backend. The backend service is being updated — check back soon.",
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
          error: "Authentication required for correlation detection",
          code: "AUTH_REQUIRED",
          hint: "Please make sure you are signed in and try again.",
        },
        { status: 401 },
      );
    }

    return Response.json(
      {
        error: `Correlation detection failed: ${error.message}`,
        code: "DETECTION_ERROR",
      },
      { status: 500 },
    );
  }
}
