/**
 * GET /api/stream/latest-price
 *
 * Fetch the latest real-time price for a symbol from Yahoo Finance with caching.
 * Supports both single symbol (?symbol=SPY) and batch (?symbols=SPY,AAPL,MSFT).
 *
 * Rate limiting: auto-detected "data" tier via withAuth (60 req/min × plan multiplier)
 * Batch requests count as a single rate-limited request regardless of symbol count.
 */

import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/config";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const symbolsParam = searchParams.get("symbols");

    // Batch mode: multiple symbols in one request
    if (symbolsParam) {
      const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (symbols.length === 0) {
        return NextResponse.json({ error: "At least one symbol required" }, { status: 400 });
      }
      if (symbols.length > 50) {
        return NextResponse.json({ error: "Maximum 50 symbols per batch" }, { status: 400 });
      }

      const prices = {};
      const fetchPromises = symbols.map(async (sym) => {
        try {
          const result = await fetchSinglePrice(sym);
          if (result) prices[sym] = result;
        } catch {
          // Skip failed symbols silently
        }
      });

      await Promise.allSettled(fetchPromises);

      return NextResponse.json({
        prices,
        count: Object.keys(prices).length,
        timestamp: Date.now(),
      });
    }

    // Single symbol mode (backward compatible)
    if (!symbol) {
      return NextResponse.json({ error: "Symbol required (use ?symbol=X or ?symbols=A,B,C)" }, { status: 400 });
    }

    const result = await fetchSinglePrice(symbol);
    if (!result) {
      return NextResponse.json({ error: "No price data available" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, { minRole: "viewer" });

/**
 * Fetch a single symbol's latest price with caching.
 * Extracted to allow reuse in batch mode.
 */
async function fetchSinglePrice(symbol) {
  // Check cache first
  const cacheKey = `latest-price:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const yahooSymbol = normalizeToYahooSymbol(symbol);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!res.ok) return null;
  const data = await res.json();

  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;

  if (!price) return null;

  const responseData = { symbol, price, timestamp: Date.now() };
  setCache(cacheKey, responseData, CACHE_TTL.PRICE_LATEST);

  return responseData;
}
