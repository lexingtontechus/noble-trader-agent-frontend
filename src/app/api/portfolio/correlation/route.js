import { detectCorrelation } from "@/lib/fastapi-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getPositions } from "@/lib/alpaca-client";
import { getCached, setCache } from "@/lib/cache";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";

/**
 * Convert an array of closing prices to log-returns.
 * Returns an array of length n-1 (one less than prices).
 */
function toLogReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { symbols: inputSymbols, returns_data } = body;

    // Get symbols from positions if not provided
    let targetSymbols = inputSymbols;
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

    const cacheKey = `correlation:${[...targetSymbols].sort().join(",")}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    // If the client provided a returns_matrix directly, use it
    let returnsMatrix = returns_data?.returns_matrix || null;

    if (!returnsMatrix) {
      // Fetch historical prices for each symbol and convert to log-returns
      const allPrices = await Promise.all(
        targetSymbols.map((sym) =>
          fetchHistoricalPrices(sym).then((d) => d.prices),
        ),
      );

      // Validate we have enough data for all symbols
      const minLen = Math.min(...allPrices.map((p) => p.length));
      if (minLen < 20) {
        return Response.json(
          {
            error: `Insufficient price data (minimum 20 bars needed, got ${minLen})`,
            code: "INSUFFICIENT_DATA",
            hint: "Some symbols may not have enough historical price data for correlation analysis.",
          },
          { status: 400 },
        );
      }

      // Trim all to the same length and convert to log-returns
      const logReturns = allPrices.map((prices) =>
        toLogReturns(prices.slice(-minLen)),
      );

      // Build returns_matrix: n_bars × n_assets (each row = one time bar, each col = one asset)
      const nBars = logReturns[0].length;
      returnsMatrix = [];
      for (let i = 0; i < nBars; i++) {
        const row = logReturns.map((retArr) => retArr[i] || 0);
        returnsMatrix.push(row);
      }
    }

    // Call the backend with the proper returns_matrix format
    const result = await detectCorrelation(targetSymbols, returnsMatrix);

    // Map backend response to frontend-expected format
    const mapped = {
      regime_label: result.corr_regime || null,
      confidence: result.corr_confidence || 0,
      risk_multiplier: result.corr_risk_multiplier || 1,
      blended_risk_multiplier: result.blended_risk_multiplier || 1,
      mean_abs_correlation: result.mean_abs_correlation || 0,
      correlation_matrix: result.correlation_matrix || null,
      corr_probs: result.corr_probs || {},
      n_bars_fitted: result.n_bars_fitted || 0,
      asset_regimes: result.asset_regimes || [],
      symbols: result.symbols || targetSymbols,
      n_assets: result.n_assets || targetSymbols.length,
      // Include raw backend response for debugging
      _raw: result,
    };

    setCache(cacheKey, mapped, 10 * 60 * 1000); // 10 min cache
    return Response.json(mapped);
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
          hint: "This feature requires the /correlation/detect endpoint to be deployed on the FastAPI backend. The backend multi_asset router needs to be enabled in main.py.",
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

    // Backend starting up (Render free-tier spin-up)
    if (
      msg.includes("starting up") ||
      msg.includes("html instead of json")
    ) {
      return Response.json(
        {
          error: "Backend service is starting up",
          code: "SERVICE_STARTING",
          hint: "The FastAPI backend on Render is waking up from sleep. This usually takes 30-60 seconds. Please try again shortly.",
        },
        { status: 503 },
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
