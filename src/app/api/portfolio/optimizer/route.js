import { optimisePortfolio } from "@/lib/fastapi-client";
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

    const symbols = positions.map((p) => p.symbol);
    const cacheKey = `optimizer:${[...symbols].sort().join(",")}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    // If the client provided a returns_matrix directly, use it
    let returnsMatrix = prices_data?.returns_matrix || null;

    if (!returnsMatrix) {
      // Fetch historical prices for each symbol and convert to log-returns
      const allPrices = await Promise.all(
        symbols.map((sym) =>
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
            hint: "Some symbols may not have enough historical price data for optimization.",
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

    // Call the backend with proper returns_matrix format
    const result = await optimisePortfolio(symbols, returnsMatrix, {
      risk_free_rate: risk_free_rate || 0.04,
    });

    // Map backend response to frontend-expected format
    const optimisation = result.optimisation || result;
    const correlation = result.correlation || null;

    const mapped = {
      // Optimization results
      optimal_weights: {},
      expected_return: optimisation.expected_return || 0,
      optimal_risk: optimisation.expected_vol || 0,
      sharpe_ratio: optimisation.sharpe_ratio || 0,
      expected_max_drawdown: optimisation.expected_max_drawdown || 0,
      dd_constraint_met: optimisation.dd_constraint_met ?? true,
      converged: optimisation.converged ?? true,
      regime_exposure: optimisation.regime_exposure || 1,
      // Weight arrays from backend
      weights: optimisation.weights || [],
      regime_adj_weights: optimisation.regime_adj_weights || [],
      per_asset_bounds: optimisation.per_asset_bounds || [],
      // Correlation results (if full endpoint)
      correlation_regime: correlation?.corr_regime || null,
      correlation_confidence: correlation?.corr_confidence || 0,
      correlation_matrix: correlation?.correlation_matrix || null,
      blended_risk_multiplier: correlation?.blended_risk_multiplier || 1,
      // Include raw response for debugging
      _raw: result,
    };

    // Build optimal_weights object from weights array + symbols
    if (mapped.weights.length > 0 && symbols.length > 0) {
      symbols.forEach((sym, i) => {
        mapped.optimal_weights[sym] = mapped.weights[i] || 0;
      });
    }

    setCache(cacheKey, mapped, 10 * 60 * 1000); // 10 min cache
    return Response.json(mapped);
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
          hint: "This feature requires the /optimise/full endpoint to be deployed on the FastAPI backend. The backend multi_asset router needs to be enabled in main.py.",
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
        error: `Portfolio optimization failed: ${error.message}`,
        code: "OPTIMIZATION_ERROR",
      },
      { status: 500 },
    );
  }
}
