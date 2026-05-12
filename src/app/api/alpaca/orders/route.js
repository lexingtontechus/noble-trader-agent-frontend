import { getOrders } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

/**
 * GET /api/alpaca/orders
 * Fetches order history using keys stored in Clerk private metadata.
 */
export async function GET(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured. Save your keys in Settings.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "3m";

    const now = new Date();
    const after = new Date();
    if (period === "1m") after.setMonth(now.getMonth() - 1);
    else if (period === "3m") after.setMonth(now.getMonth() - 3);
    else if (period === "6m") after.setMonth(now.getMonth() - 6);
    else after.setFullYear(now.getFullYear() - 1);

    const orders = await getOrders(keys.apiKey, keys.secretKey, {
      status: "all",
      after: after.toISOString(),
    });

    return Response.json(orders);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch orders: ${error.message}` },
      { status: 500 }
    );
  }
}
