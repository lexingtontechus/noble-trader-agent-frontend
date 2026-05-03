import { createOrder } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

export async function POST(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json({ error: "Alpaca API keys not configured" }, { status: 403 });
    }

    const body = await request.json();
    const { symbol, qty, side, type, time_in_force, limit_price } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }
    if (!side || !["buy", "sell"].includes(side)) {
      return Response.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }

    const order = await createOrder(keys.apiKey, keys.secretKey, {
      symbol,
      qty: qty || 100,
      side,
      type: type || "market",
      time_in_force: time_in_force || "day",
      limit_price,
    });

    return Response.json(order);
  } catch (error) {
    return Response.json(
      { error: `Order failed: ${error.message}` },
      { status: 500 }
    );
  }
}
