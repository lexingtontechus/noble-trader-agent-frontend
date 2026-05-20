import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";

/**
 * GET /api/alpaca/positions
 * Fetches open positions using encrypted keys from Supabase
 * (with Clerk privateMetadata fallback for migration).
 */
export async function GET(request) {
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured. Save your keys in Settings.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const positions = await getPositions(keys.apiKey, keys.secretKey, credentialType);
    return Response.json(positions);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch positions: ${error.message}` },
      { status: 500 }
    );
  }
}
