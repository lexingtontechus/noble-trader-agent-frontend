import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

// Cache latest prices for 15 seconds to reduce Yahoo API calls during polling
const PRICE_CACHE_TTL = 15000;

export async function GET(request) {
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
    setCache(cacheKey, responseData, PRICE_CACHE_TTL);

    return NextResponse.json(responseData);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
