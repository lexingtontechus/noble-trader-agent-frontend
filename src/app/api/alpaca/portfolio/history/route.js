import { getPortfolioHistory } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

/**
 * GET /api/alpaca/portfolio/history?period=1M&timeframe=1D
 * Fetches portfolio equity history from Alpaca.
 */
export async function GET(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "1M";
    const timeframe = searchParams.get("timeframe") || "1D";

    const history = await getPortfolioHistory(keys.apiKey, keys.secretKey, { period, timeframe });
    return Response.json(history);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch portfolio history: ${error.message}` },
      { status: 500 }
    );
  }
}
