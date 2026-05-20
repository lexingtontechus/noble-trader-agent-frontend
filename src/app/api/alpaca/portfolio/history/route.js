import { getPortfolioHistory } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { createApiError } from "@/lib/error-messages";

/**
 * GET /api/alpaca/portfolio/history?period=1M&timeframe=1D
 * Fetches portfolio equity history from Alpaca using encrypted keys from Supabase
 * (with Clerk privateMetadata fallback for migration).
 */
export async function GET(request) {
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "1M";
    const timeframe = searchParams.get("timeframe") || "1D";

    const history = await getPortfolioHistory(keys.apiKey, keys.secretKey, {
      period,
      timeframe,
      mode: credentialType,
    });
    return Response.json(history);
  } catch (error) {
    return createApiError(error, { context: "portfolio" });
  }
}
