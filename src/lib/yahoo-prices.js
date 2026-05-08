import YahooFinance from "yahoo-finance2";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/config";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

/**
 * Get period dates for Yahoo Finance chart query.
 */
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

/**
 * Fetch historical closing prices for a symbol from Yahoo Finance.
 * Uses server-side cache to avoid duplicate API calls.
 *
 * This is the shared implementation used by both the /api/prices route
 * and the BFF routes (/api/portfolio/correlation, /api/portfolio/optimizer)
 * to avoid HTTP round-trips to localhost which break on Vercel.
 *
 * @param {string} symbol - Ticker symbol
 * @param {string} period - Time period ("6mo", "1y", "2y")
 * @returns {Promise<{ symbol: string, period: string, prices: number[], dates: string[], count: number }>}
 */
export async function fetchHistoricalPrices(symbol, period = "1y") {
  // Check cache first
  const cacheKey = `prices:${symbol}:${period}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { period1, period2 } = getPeriodDates(period);
  const result = await yahooFinance.chart(symbol, { period1, period2 });

  const quotes = (result.quotes || []).filter((q) => q.close != null);
  const prices = quotes.map((q) => q.close);
  const dates = quotes.map((q) =>
    new Date(q.date).toISOString().split("T")[0],
  );

  if (prices.length < 20) {
    throw new Error(
      `Insufficient data for ${symbol}: ${prices.length} bars (minimum 20 required)`,
    );
  }

  const data = { symbol, period, prices, dates, count: prices.length };
  setCache(cacheKey, data, CACHE_TTL.PRICE_HISTORICAL);
  return data;
}
