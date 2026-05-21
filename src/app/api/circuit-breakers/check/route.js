/**
 * API Route: /api/circuit-breakers/check
 *
 * POST — Pre-flight check: will this order be allowed?
 * Accepts order details, runs checkCircuitBreakers, returns result.
 * Does NOT execute the trade — just checks.
 * Used by frontend to show warnings before submission.
 */

import { withAuth } from "@/lib/withAuth";
import { checkCircuitBreakers } from "@/lib/circuit-breaker";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getAccount, getPositions } from "@/lib/alpaca-client";

const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {
    // Clerk not available
  }
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const body = await request.json();

    const { symbol, side, qty, limit_price, type } = body;

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }
    if (!side || !["buy", "sell"].includes(side)) {
      return Response.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }

    // Fetch current account and positions for context
    let account = null;
    let positions = [];
    const keys = await resolveAlpacaKeys();
    if (keys) {
      try {
        [account, positions] = await Promise.all([
          getAccount(keys.apiKey, keys.secretKey),
          getPositions(keys.apiKey, keys.secretKey),
        ]);
      } catch (err) {
        console.warn("[circuit-breakers/check] Failed to fetch account/positions:", err.message);
      }
    }

    const order = {
      symbol,
      side,
      qty: qty || 1,
      limit_price: limit_price || null,
      type: type || "market",
      // Estimate order value for concentration checks
      price: limit_price || 0,
    };

    const result = await checkCircuitBreakers({
      userId,
      account,
      positions: Array.isArray(positions) ? positions : [],
      order,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[circuit-breakers/check] POST error:", error.message);
    return Response.json(
      { error: `Pre-flight check failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
