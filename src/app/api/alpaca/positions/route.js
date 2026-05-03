import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

export async function GET() {
  try {
    const keys = await getAlpacaKeys();
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
