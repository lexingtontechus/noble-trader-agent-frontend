import { withAuth } from "@/lib/withAuth";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

const ALPACA_DATA_BASE = "https://data.alpaca.markets/v2";

/**
 * GET /api/alpaca/market-data/quote?symbol=AAPL
 *
 * Fetches the latest NBBO quote (bid/ask) from Alpaca Market Data API.
 * Uses the free-tier IEX feed which provides real-time quotes for US equities.
 *
 * Response:
 *   { bid: number, ask: number, bidSize: number, askSize: number, timestamp: string, symbol: string }
 */
export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return Response.json({ error: "Symbol is required" }, { status: 400 });
    }

    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured" },
        { status: 401 }
      );
    }

    // Alpaca Market Data API — latest quote
    const res = await fetch(
      `${ALPACA_DATA_BASE}/stocks/${encodeURIComponent(symbol.toUpperCase())}/quotes/latest?feed=iex`,
      {
        headers: {
          "APCA-API-KEY-ID": keys.apiKey,
          "APCA-API-SECRET-KEY": keys.secretKey,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[market-data/quote] Alpaca error:", res.status, text);
      // If Alpaca data API fails (e.g. symbol not found, rate limit), return graceful fallback
      return Response.json(
        { error: "Quote unavailable", status: res.status },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Alpaca returns: { quote: { ... } } or { [symbol]: { ... } }
    const quote = data.quote || data[symbol] || data;

    return Response.json({
      symbol: symbol.toUpperCase(),
      bid: quote.bid_price ?? quote.bp ?? null,
      ask: quote.ask_price ?? quote.ap ?? null,
      bidSize: quote.bid_size ?? quote.bs ?? null,
      askSize: quote.ask_size ?? quote.as ?? null,
      timestamp: quote.timestamp || quote.t || new Date().toISOString(),
      exchange: quote.bid_exchange || quote.bx || null,
      condition: quote.condition || null,
    });
  } catch (error) {
    return createApiError(error, { context: "market-data/quote" });
  }
}, { minRole: "viewer" });
