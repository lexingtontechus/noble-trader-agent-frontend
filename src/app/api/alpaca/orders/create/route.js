import { createOrder } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { yahooToAlpacaSymbol, getAssetClass, isAlpacaTradable, getAlpacaTradeabilityReason } from "@/lib/symbol-utils";
import { createApiError } from "@/lib/error-messages";
import { withAuth } from "@/lib/withAuth";

const VALID_TYPES = {
  equity: ["market", "limit", "stop", "stop_limit", "trailing_stop"],
  crypto: ["market", "limit", "stop_limit"],
};

const VALID_TIF = {
  equity: ["day", "gtc", "opg", "cls", "ioc", "fok"],
  crypto: ["gtc", "ioc"],
};

function getCategory(assetClass) {
  if (assetClass === "crypto") return "crypto";
  return "equity";
}

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    let { symbol, qty, side, type, time_in_force, limit_price, stop_price, trail_price, trail_percent } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }
    if (!side || !["buy", "sell"].includes(side)) {
      return Response.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }

    if (!isAlpacaTradable(symbol)) {
      const reason = getAlpacaTradeabilityReason(symbol) || `Symbol "${symbol}" is not tradeable on Alpaca`;
      return Response.json({ error: reason }, { status: 400 });
    }

    const alpacaSymbol = yahooToAlpacaSymbol(symbol);
    if (alpacaSymbol === null) {
      return Response.json({ error: `Symbol "${symbol}" is not tradeable on Alpaca` }, { status: 400 });
    }

    if (alpacaSymbol !== symbol) {
      console.log(`[OrderCreate] Symbol converted: ${symbol} → ${alpacaSymbol}`);
    }

    const assetClass = getAssetClass(symbol);
    const category = getCategory(assetClass);
    const allowedTypes = VALID_TYPES[category];
    const allowedTIF = VALID_TIF[category];

    const orderType = type || "market";
    const tif = time_in_force || (category === "crypto" ? "gtc" : "day");

    if (!allowedTypes.includes(orderType)) {
      return Response.json({ error: `Order type "${orderType}" not supported for ${category}. Allowed: ${allowedTypes.join(", ")}` }, { status: 400 });
    }
    if (!allowedTIF.includes(tif)) {
      return Response.json({ error: `TIF "${tif}" not supported for ${category}. Allowed: ${allowedTIF.join(", ")}` }, { status: 400 });
    }

    if ((orderType === "limit" || orderType === "stop_limit") && !limit_price) {
      return Response.json({ error: `limit_price required for ${orderType} orders` }, { status: 400 });
    }
    if ((orderType === "stop" || orderType === "stop_limit") && !stop_price) {
      return Response.json({ error: `stop_price required for ${orderType} orders` }, { status: 400 });
    }
    if (orderType === "trailing_stop" && !trail_price && !trail_percent) {
      return Response.json({ error: "trail_price or trail_percent required for trailing_stop orders" }, { status: 400 });
    }

    const order = await createOrder(keys.apiKey, keys.secretKey, {
      symbol: alpacaSymbol,
      qty: qty || 100,
      side,
      type: orderType,
      time_in_force: tif,
      limit_price,
      stop_price,
      trail_price,
      trail_percent,
    }, credentialType);

    return Response.json(order);
  } catch (error) {
    return createApiError(error, { context: "orders" });
  }
}, { minRole: "trader" });
