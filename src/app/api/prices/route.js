import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { getCached } from "@/lib/cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { RATE_LIMIT } from "@/lib/config";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";

export async function GET(request) {
  // Rate limit: 10 requests per minute per IP for historical data
  const ip = getClientIp(request);
  const rateCheck = checkRateLimit(
    `historical:${ip}`,
    RATE_LIMIT.HISTORICAL.max,
    RATE_LIMIT.HISTORICAL.windowMs,
  );
  if (!rateCheck.allowed) {
    return Response.json(
      { error: "Rate limited. Try again in a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
          ),
        },
      },
    );
  }

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
}
