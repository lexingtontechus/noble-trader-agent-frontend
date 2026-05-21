import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { CACHE_TTL, RATE_LIMIT } from "@/lib/config";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  // Rate limit: 30 requests per minute per IP
  const ip = getClientIp(request);
  const rateCheck = checkRateLimit(
    `price:${ip}`,
    RATE_LIMIT.PRICE.max,
    RATE_LIMIT.PRICE.windowMs,
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limited. Try again in a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

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
