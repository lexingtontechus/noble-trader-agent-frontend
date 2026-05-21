import { createOrder, getAccount, getPositions } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { yahooToAlpacaSymbol, getAssetClass, isAlpacaTradable, getAlpacaTradeabilityReason } from "@/lib/symbol-utils";
import { createApiError } from "@/lib/error-messages";
import { withAuth } from "@/lib/withAuth";
import { checkCircuitBreakers } from "@/lib/circuit-breaker";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";

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

    // ── Circuit Breaker: Pre-flight check ──────────────────────────────────
    const userId = authContext.userId;
    try {
      let account = null;
      let positions = [];
      try {
        [account, positions] = await Promise.all([
          getAccount(keys.apiKey, keys.secretKey, credentialType),
          getPositions(keys.apiKey, keys.secretKey, credentialType),
        ]);
      } catch (fetchErr) {
        console.warn("[orders/create] Failed to fetch account/positions for circuit breaker:", fetchErr.message);
      }

      const cbResult = await checkCircuitBreakers({
        userId,
        account,
        positions: Array.isArray(positions) ? positions : [],
        order: {
          symbol: alpacaSymbol,
          side,
          qty: qty || 100,
          limit_price,
        },
      });

      if (!cbResult.allowed) {
        // Audit: circuit breaker denied the order
        logAuditEvent({
          eventType: AUDIT_EVENTS.CIRCUIT_BREAKER_CHECK,
          userId,
          symbol: alpacaSymbol,
          direction: side,
          quantity: qty || 100,
          price: limit_price,
          metadata: { result: "denied", breakerType: cbResult.breakerType, reason: cbResult.reason, ...cbResult.details },
        });

        return Response.json(
          {
            error: cbResult.reason,
            code: "CIRCUIT_BREAKER",
            details: {
              breakerType: cbResult.breakerType,
              action: cbResult.action,
              ...cbResult.details,
            },
          },
          { status: 403 }
        );
      }

      // Audit: circuit breaker check passed
      logAuditEvent({
        eventType: AUDIT_EVENTS.CIRCUIT_BREAKER_CHECK,
        userId,
        symbol: alpacaSymbol,
        direction: side,
        quantity: qty || 100,
        metadata: { result: "allowed", warning: cbResult.warning || null },
      });
    } catch (cbErr) {
      // If circuit breaker check itself fails, log but allow the trade
      // (fail open — don't block trading if CB engine is broken)
      console.error("[orders/create] Circuit breaker check failed (fail-open):", cbErr.message);
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

    // Audit: order submitted successfully
    logAuditEvent({
      eventType: AUDIT_EVENTS.ORDER_SUBMITTED,
      userId,
      symbol: alpacaSymbol,
      orderId: order.id,
      direction: side,
      quantity: qty || 100,
      price: limit_price,
      orderType,
      metadata: { alpacaOrderId: order.id, timeInForce: tif, credentialType },
    });

    return Response.json(order);
  } catch (error) {
    // Audit: order rejected
    logAuditEvent({
      eventType: AUDIT_EVENTS.ORDER_REJECTED,
      userId: authContext.userId,
      symbol,
      direction: side,
      quantity: qty,
      price: limit_price,
      orderType,
      metadata: { error: error.message },
    });

    return createApiError(error, { context: "orders" });
  }
}, { minRole: "trader" });
