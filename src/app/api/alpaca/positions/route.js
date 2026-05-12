import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

/**
 * GET /api/alpaca/positions
 * Fetches open positions using keys stored in Clerk private metadata.
 */
export async function GET() {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured. Save your keys in Settings.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const positions = await getPositions(keys.apiKey, keys.secretKey);
    return Response.json(positions);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch positions: ${error.message}` },
      { status: 500 }
    );
  }
}
