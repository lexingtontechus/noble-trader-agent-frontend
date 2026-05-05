import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

// In-memory cache: 30-second TTL per symbol to avoid Yahoo rate-limiting
const priceCache = new Map();
const CACHE_TTL = 30_000;

// Auto-cleanup: evict stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of priceCache) {
      if (now - val.ts > CACHE_TTL * 2) {
        priceCache.delete(key);
      }
    }
  }, 5 * 60_000);
}

/**
 * GET /api/stream/latest-price?symbol=SPY
 * Fetches the latest price for a symbol from Yahoo Finance.
 * Cached for 30 seconds to avoid rate-limiting.
 *
 * Returns: { symbol, price, change, changePercent, date, cached }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }

    // Check cache
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return Response.json({
        symbol,
        price: cached.price,
        change: cached.change,
        changePercent: cached.changePercent,
        date: cached.date,
        cached: true,
      });
    }

    // Fetch from Yahoo Finance (last 5 days to ensure we get the latest)
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);
    const result = await yahooFinance.chart(symbol, {
      period1: fiveDaysAgo,
      period2: now,
      interval: "1d",
    });

    const quotes = (result.quotes || []).filter((q) => q.close != null);
    if (quotes.length === 0) {
      return Response.json(
        { error: `No price data for ${symbol}` },
        { status: 404 },
      );
    }

    const latestQuote = quotes[quotes.length - 1];
    const prevQuote = quotes.length > 1 ? quotes[quotes.length - 2] : null;
    const price = latestQuote.close;
    const change = prevQuote ? price - prevQuote.close : null;
    const changePercent =
      prevQuote && prevQuote.close ? (change / prevQuote.close) * 100 : null;

    // Update cache
    priceCache.set(symbol, {
      price,
      change,
      changePercent,
      date: latestQuote.date,
      ts: Date.now(),
    });

    return Response.json({
      symbol,
      price,
      change,
      changePercent,
      date: latestQuote.date,
      cached: false,
    });
  } catch (error) {
    console.error("Latest price error:", error);
    return Response.json(
      { error: `Price fetch failed: ${error.message}` },
      { status: 500 },
    );
  }
}
