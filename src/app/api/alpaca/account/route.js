import { getAccount } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

/**
 * GET /api/alpaca/account
 * Fetches the Alpaca account info using keys stored in Clerk private metadata.
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

    const account = await getAccount(keys.apiKey, keys.secretKey);
    return Response.json(account);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch account: ${error.message}` },
      { status: 500 }
    );
  }
}
