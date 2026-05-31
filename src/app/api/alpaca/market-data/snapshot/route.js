import { withAuth } from "@/lib/withAuth";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

const ALPACA_DATA_BASE = "https://data.alpaca.markets/v2";

/**
 * GET /api/alpaca/market-data/snapshot?symbols=AAPL,MSFT,SPY
 *
 * Batch snapshot endpoint — returns latest quote + daily bar + prev daily bar
 * for multiple symbols in a single request. Much more efficient than individual
 * quote calls when you need bid/ask for the whole watchlist.
 *
 * Response:
 *   { snapshots: { [symbol]: { quote: {...}, dailyBar: {...}, prevDailyBar: {...} } } }
 */
export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get("symbols");

    if (!symbols) {
      return Response.json({ error: "Symbols parameter required (comma-separated)" }, { status: 400 });
    }

    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json({ error: "Alpaca API keys not configured" }, { status: 401 });
    }

    const symbolList = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);

    if (symbolList.length === 0) {
      return Response.json({ error: "No valid symbols provided" }, { status: 400 });
    }

    // Alpaca snapshot endpoint — batch query
    const res = await fetch(
      `${ALPACA_DATA_BASE}/stocks/snapshots?symbols=${encodeURIComponent(symbolList.join(","))}&feed=iex`,
      {
        headers: {
          "APCA-API-KEY-ID": keys.apiKey,
          "APCA-API-SECRET-KEY": keys.secretKey,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[market-data/snapshot] Alpaca error:", res.status, text);
      return Response.json({ error: "Snapshot unavailable", status: res.status }, { status: res.status });
    }

    const data = await res.json();

    // Normalize the snapshot data into a clean format
    const snapshots = {};
    for (const [sym, snap] of Object.entries(data)) {
      const q = snap.latestQuote || snap.quote || {};
      const dailyBar = snap.dailyBar || snap.daily_bar || {};
      const prevBar = snap.prevDailyBar || snap.prev_daily_bar || {};

      snapshots[sym] = {
        quote: {
          bid: q.bid_price ?? q.bp ?? null,
          ask: q.ask_price ?? q.ap ?? null,
          bidSize: q.bid_size ?? q.bs ?? null,
          askSize: q.ask_size ?? q.as ?? null,
          timestamp: q.timestamp || q.t || null,
        },
        dailyBar: {
          open: dailyBar.open ?? dailyBar.o ?? null,
          high: dailyBar.high ?? dailyBar.h ?? null,
          low: dailyBar.low ?? dailyBar.l ?? null,
          close: dailyBar.close ?? dailyBar.c ?? null,
          volume: dailyBar.volume ?? dailyBar.v ?? null,
          timestamp: dailyBar.timestamp || dailyBar.t || null,
        },
        prevDailyBar: {
          open: prevBar.open ?? prevBar.o ?? null,
          high: prevBar.high ?? prevBar.h ?? null,
          low: prevBar.low ?? prevBar.l ?? null,
          close: prevBar.close ?? prevBar.c ?? null,
          volume: prevBar.volume ?? prevBar.v ?? null,
        },
      };
    }

    return Response.json({ snapshots });
  } catch (error) {
    return createApiError(error, { context: "market-data/snapshot" });
  }
}, { minRole: "viewer" });
