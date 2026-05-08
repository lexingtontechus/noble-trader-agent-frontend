import { createOrder } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { yahooToAlpacaSymbol, isAlpacaTradable } from "@/lib/symbol-utils";

export async function POST(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json({ error: "Alpaca API keys not configured" }, { status: 403 });
    }

    const body = await request.json();
    let { symbol, qty, side, type, time_in_force, limit_price } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }
    if (!side || !["buy", "sell"].includes(side)) {
      return Response.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }

    // Safety net: convert Yahoo Finance symbols to Alpaca format
    // e.g. "ETH-USD" → "ETH/USD", "EURUSD=X" → "EURUSD"
    const alpacaSymbol = yahooToAlpacaSymbol(symbol);
    if (alpacaSymbol === null) {
      return Response.json(
        { error: `Symbol "${symbol}" is not tradeable on Alpaca (futures/indices not supported)` },
        { status: 400 }
      );
    }

    // If the symbol was converted, use the Alpaca format
    if (alpacaSymbol !== symbol) {
      console.log(`[OrderCreate] Symbol converted: ${symbol} → ${alpacaSymbol}`);
    }

    const order = await createOrder(keys.apiKey, keys.secretKey, {
      symbol: alpacaSymbol,
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
