/**
 * GET /api/prices/ohlc
 *
 * Fetch historical OHLCV (candlestick) data from Yahoo Finance with caching.
 * Used by the live candlestick chart component.
 *
 * Query params:
 *   - symbol (required): Ticker symbol (e.g., "SPY", "BTC-USD")
 *   - period (optional): "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y" (default: "6mo")
 *   - interval (optional): "1m", "5m", "15m", "1h", "1d" (default: "1d")
 *
 * Returns:
 *   { symbol, period, interval, candles: [{ time, open, high, low, close, volume }], count }
 *
 * Rate limiting: auto-detected "data" tier via withAuth
 */

import YahooFinance from "yahoo-finance2";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/config";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

function getPeriodDates(period) {
  const now = new Date();
  const msDay = 86400000;
  const daysMap = { "1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730 };
  const daysBack = daysMap[period] || 180;
  return { period1: new Date(now.getTime() - daysBack * msDay), period2: now };
}

export const GET = withAuth(async (request, context, authContext) => {
  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get("symbol");
  const period = searchParams.get("period") || "6mo";
  const interval = searchParams.get("interval") || "1d";

  if (!rawSymbol) {
    return Response.json({ error: "symbol parameter required" }, { status: 400 });
  }

  const symbol = normalizeToYahooSymbol(rawSymbol);

  // Check cache
  const cacheKey = `ohlcv:${symbol}:${period}:${interval}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const { period1, period2 } = getPeriodDates(period);

    // Race yahooFinance.chart() against a 9s timeout for Vercel hobby safety
    const result = await Promise.race([
      yahooFinance.chart(symbol, { period1, period2, interval }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Yahoo Finance chart request timed out")), 9000)
      ),
    ]);

    const quotes = (result.quotes || []).filter(
      (q) => q.open != null && q.high != null && q.low != null && q.close != null,
    );

    const candles = quotes.map((q) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000), // Unix timestamp (seconds)
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume || 0,
    }));

    const data = { symbol, period, interval, candles, count: candles.length };
    setCache(cacheKey, data, CACHE_TTL.PRICE_HISTORICAL);
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch OHLCV for ${symbol}: ${error.message}` },
      { status: 500 },
    );
  }
}, { minRole: "viewer", rateTier: "data" });
