import { fetchHistoricalOHLC } from "@/lib/yahoo-prices";
import { buildObservation } from "@/lib/fastapi-client";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/config";
import { normalizeToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol, period = "1y", window, refit_every, n_hmm_states, recommended_f } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }

    // Normalize the symbol to Yahoo Finance format.
    // Bare crypto like "BTC" becomes "BTC-USD" so Yahoo Finance can find it.
    const yahooSymbol = normalizeToYahooSymbol(symbol);

    // Check cache
    const cacheKey = `observation:${yahooSymbol}:${period}`;
    const cached = getCached(cacheKey);
    if (cached) return Response.json(cached);

    // Fetch OHLC data from Yahoo Finance (we need high/low for ATR & HHLL)
    const ohlc = await fetchHistoricalOHLC(yahooSymbol, period);

    // Call FastAPI backend /observation/build
    const observation = await buildObservation(
      ohlc.prices,
      ohlc.high,
      ohlc.low,
      yahooSymbol,
      { window, refit_every, n_hmm_states, recommended_f },
    );

    const data = {
      symbol: yahooSymbol,
      period,
      ...observation,
    };

    setCache(cacheKey, data, CACHE_TTL.ANALYSIS);
    return Response.json(data);
  } catch (error) {
    console.error("Observation build error:", error);

    // Detect Render spin-up HTML response
    const msg = error.message || "";
    if (msg.includes("HTML") || msg.includes("starting up")) {
      return Response.json(
        {
          error: "Backend service is starting up. Please try again in a moment.",
          code: "SERVICE_STARTING",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { error: `Observation build failed: ${msg}` },
      { status: 500 },
    );
  }
}, { minRole: "trader" });
