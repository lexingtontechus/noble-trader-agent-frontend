import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch { /* Clerk not available */ }
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
    const positions = await getPositions(keys.apiKey, keys.secretKey);
    return Response.json(positions);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch positions: ${error.message}` },
      { status: 500 }
    );
  }
}
