import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createOrder, getOrders } from "@/lib/alpaca-client";
import { yahooToAlpacaSymbol, getAssetClass } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

/**
 * POST /api/trading/execute
 * Execute approved trades via Alpaca.
 * Body: { trades: Array<{ id, symbol, side, order_type, qty, limit_price, time_in_force }> }
 */
export async function POST(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { trades } = body;

    if (!trades || !Array.isArray(trades) || trades.length === 0) {
      return Response.json(
        { error: "No trades provided for execution", code: "NO_TRADES" },
        { status: 400 }
      );
    }

    // Sort trades: sells first (priority < 50), then buys
    const sorted = [...trades].sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const results = [];
    const filledOrders = [];

    for (const trade of sorted) {
      try {
        // Convert symbol if needed
        const alpacaSymbol = yahooToAlpacaSymbol(trade.symbol) || trade.symbol;

        // Build order payload
        const orderPayload = {
          symbol: alpacaSymbol,
          qty: trade.qty || trade.quantity,
          side: trade.side || trade.action,
          type: trade.order_type || trade.type || "market",
          time_in_force: trade.time_in_force || (trade.side === "buy" ? "gtc" : "day"),
        };

        // Add limit price for limit orders
        if (orderPayload.type === "limit" && trade.limit_price) {
          orderPayload.limit_price = trade.limit_price;
        }

        const order = await createOrder(keys.apiKey, keys.secretKey, orderPayload);

        results.push({
          id: trade.id || trade.symbol,
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          status: "filled",
          alpaca_order_id: order.id,
          order,
        });

        filledOrders.push(order);

        // Update DB if trade has a DB id
        if (trade.id && trade.id.includes("-")) {
          try {
            const dbTrade = await db.tradeRecommendation.findFirst({
              where: { analysisId: { contains: "default" } },
              orderBy: { createdAt: "desc" },
            });
            // We match by symbol + side + status
            const matchingTrade = await db.tradeRecommendation.findFirst({
              where: {
                symbol: trade.symbol,
                side: trade.side,
                status: "approved",
              },
              orderBy: { createdAt: "desc" },
            });
            if (matchingTrade) {
              await db.tradeRecommendation.update({
                where: { id: matchingTrade.id },
                data: {
                  status: "executing",
                  alpacaOrderId: order.id,
                },
              });
            }
          } catch (dbErr) {
            console.error("DB update failed for trade:", dbErr.message);
          }
        }
      } catch (err) {
        console.error(`Order failed for ${trade.symbol}:`, err.message);

        const isBuyingPower = err.message?.toLowerCase().includes("buying power") ||
          err.message?.toLowerCase().includes("insufficient");

        results.push({
          id: trade.id || trade.symbol,
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          status: "failed",
          error: err.message,
          insufficient_buying_power: isBuyingPower,
        });

        // Mark as deferred if buying power issue
        if (isBuyingPower) {
          try {
            await db.scheduledOrder.create({
              data: {
                userId: "default",
                symbol: trade.symbol,
                side: trade.side,
                orderType: trade.order_type || "limit",
                qty: trade.qty,
                limitPrice: trade.limit_price,
                timeInForce: trade.time_in_force || "gtc",
                reason: `Deferred from analysis: insufficient buying power`,
                status: "queued",
                dependsOnOrders: JSON.stringify(filledOrders.map((o) => o.id)),
              },
            });
          } catch (dbErr) {
            console.error("Failed to create scheduled order:", dbErr.message);
          }
        }
      }
    }

    const filled = results.filter((r) => r.status === "filled").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const deferred = results.filter((r) => r.insufficient_buying_power).length;

    return Response.json({
      total: results.length,
      filled,
      failed,
      deferred,
      results,
      summary: `${filled} filled, ${failed} failed, ${deferred} deferred`,
    });
  } catch (error) {
    console.error("Trading execute error:", error);
    return Response.json(
      { error: `Execution failed: ${error.message}`, code: "EXECUTION_ERROR" },
      { status: 500 }
    );
  }
}
