import { getAccount } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";

/**
 * GET /api/alpaca/account
 * Fetches the Alpaca account info using encrypted keys from Supabase
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

    const account = await getAccount(keys.apiKey, keys.secretKey, credentialType);
    return Response.json(account);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch account: ${error.message}` },
      { status: 500 }
    );
  }
}
