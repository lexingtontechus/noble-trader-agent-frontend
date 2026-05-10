import { getAccount } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  // Try Clerk auth first
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {
    // Clerk not available — fall through to env vars
  }
  // Fallback to environment variables
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

export async function GET() {
  try {
    const keys = await resolveAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json({ error: "Alpaca API keys not configured" }, { status: 403 });
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
