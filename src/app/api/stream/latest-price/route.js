/**
 * GET /api/stream/latest-price
 *
 * Fetch the latest real-time price for a symbol from Yahoo Finance with caching.
 *
 * Rate limiting: auto-detected "data" tier via withAuth (60 req/min × plan multiplier)
 */

import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    if (!symbol)
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });

    // Check cache first
    const cacheKey = `latest-price:${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(cached);

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) throw new Error(`Yahoo fetch failed: ${res.status}`);
    const data = await res.json();

    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;

    if (!price) throw new Error("No price data available");

    const responseData = { symbol, price, timestamp: Date.now() };
    setCache(cacheKey, responseData, CACHE_TTL.PRICE_LATEST);

    return NextResponse.json(responseData);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, { minRole: "viewer" });
