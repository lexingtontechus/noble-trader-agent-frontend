/**
 * GET /api/prices
 *
 * Fetch historical price data from Yahoo Finance with caching.
 *
 * Rate limiting: auto-detected "data" tier via withAuth (60 req/min × plan multiplier)
 * Previously used RATE_LIMIT.HISTORICAL (10/min) — now uses plan-aware tier system.
 */

import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { getCached } from "@/lib/cache";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get("symbol");
  const period = searchParams.get("period") || "6mo";

  if (!rawSymbol) {
    return Response.json({ error: "symbol parameter required" }, { status: 400 });
  }

  // Normalize the symbol to Yahoo Finance format.
  // Bare crypto like "BTC" becomes "BTC-USD" so Yahoo Finance can find it.
  const symbol = normalizeToYahooSymbol(rawSymbol);

  // Check cache first (shared with BFF routes via yahoo-prices module)
  const cacheKey = `prices:${symbol}:${period}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const data = await fetchHistoricalPrices(symbol, period);
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch prices for ${symbol}: ${error.message}` },
      { status: 500 },
    );
  }
}, { minRole: "viewer" });
