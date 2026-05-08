import YahooFinance from "yahoo-finance2";
import { getCached, setCache } from "@/lib/cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { CACHE_TTL, RATE_LIMIT } from "@/lib/config";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

function getPeriodDates(period) {
  const now = new Date();
  const msDay = 86400000;
  let daysBack;
  switch (period) {
    case "1y":
      daysBack = 365;
      break;
    case "2y":
      daysBack = 730;
      break;
    default:
      daysBack = 180;
  }
  const period1 = new Date(now.getTime() - daysBack * msDay);
  return { period1, period2: now };
}

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
  const symbol = searchParams.get("symbol");
  const period = searchParams.get("period") || "6mo";

  if (!symbol) {
    return Response.json({ error: "symbol parameter required" }, { status: 400 });
  }

  const cacheKey = `prices:${symbol}:${period}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const { period1, period2 } = getPeriodDates(period);
    const result = await yahooFinance.chart(symbol, { period1, period2 });

    const quotes = (result.quotes || []).filter((q) => q.close != null);
    const prices = quotes.map((q) => q.close);
    const dates = quotes.map((q) => new Date(q.date).toISOString().split("T")[0]);

    if (prices.length < 81) {
      return Response.json(
        { error: `Insufficient data: ${prices.length} bars (minimum 81 required)` },
        { status: 400 },
      );
    }

    const data = { symbol, period, prices, dates, count: prices.length };
    setCache(cacheKey, data, CACHE_TTL.PRICE_HISTORICAL);
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch prices for ${symbol}: ${error.message}` },
      { status: 500 },
    );
  }
}
