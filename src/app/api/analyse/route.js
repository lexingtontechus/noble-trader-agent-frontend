import YahooFinance from "yahoo-finance2";
import { analyseFull } from "@/lib/fastapi-client";
import { getCached, setCache } from "@/lib/cache";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

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

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol, period = "6mo", kelly_fraction, target_vol, base_risk_limit } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }

    // Normalize the symbol to Yahoo Finance format.
    // Bare crypto like "BTC" becomes "BTC-USD" so Yahoo Finance can find it.
    const yahooSymbol = normalizeToYahooSymbol(symbol);

    const cacheKey = `analyse:${yahooSymbol}:${period}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    // Fetch prices
    const { period1, period2 } = getPeriodDates(period);
    const result = await yahooFinance.chart(yahooSymbol, { period1, period2 });

    const quotes = (result.quotes || []).filter((q) => q.close != null);
    const prices = quotes.map((q) => q.close);
    const dates = quotes.map((q) => new Date(q.date).toISOString().split("T")[0]);

    if (prices.length < 81) {
      return Response.json(
        { error: `Insufficient price data: ${prices.length} bars (minimum 81 required)` },
        { status: 400 }
      );
    }

    // Call FastAPI
    const analysis = await analyseFull(prices, symbol, {
      kelly_fraction,
      target_vol,
      base_risk_limit,
    });

    const data = { symbol: yahooSymbol, period, prices, dates, count: prices.length, analysis };
    setCache(cacheKey, data);
    return Response.json(data);
  } catch (error) {
    console.error("Analyse error:", error);
    return Response.json(
      { error: `Analysis failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
