import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createOrder, getOrders, getAccount } from "@/lib/alpaca-client";
import { yahooToAlpacaSymbol } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

/**
 * POST /api/trading/schedule/execute
 * Process scheduled orders that are due and whose dependencies are met.
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

    // Get all queued scheduled orders
    const scheduledOrders = await db.scheduledOrder.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (scheduledOrders.length === 0) {
      return Response.json({ message: "No scheduled orders to process", results: [] });
    }

    // Get current Alpaca orders to check dependencies
    const alpacaOrders = await getOrders(keys.apiKey, keys.secretKey, { status: "all" });
    const orderMap = new Map(alpacaOrders.map((o) => [o.id, o]));

    // Get account for buying power check
    const account = await getAccount(keys.apiKey, keys.secretKey);
    const buyingPower = parseFloat(account?.buying_power) || 0;

    const results = [];

    for (const scheduled of scheduledOrders) {
      // Check if schedule time has been reached (if set)
      if (scheduled.scheduleAt && new Date() < new Date(scheduled.scheduleAt)) {
        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          status: "skipped",
          reason: "Scheduled time not yet reached",
        });
        continue;
      }

      // Check dependency orders (must all be filled)
      if (scheduled.dependsOnOrders) {
        try {
          const depIds = JSON.parse(scheduled.dependsOnOrders);
          const allFilled = depIds.every((id) => {
            const order = orderMap.get(id);
            return order?.status === "filled";
          });

          if (!allFilled) {
            results.push({
              id: scheduled.id,
              symbol: scheduled.symbol,
              status: "skipped",
              reason: "Dependency orders not yet filled",
            });
            continue;
          }
        } catch (e) {
          // Invalid JSON, skip dependency check
        }
      }

      // Check buying power for buy orders
      if (scheduled.side === "buy") {
        const estCost = scheduled.qty * (scheduled.limitPrice || 0);
        if (estCost > buyingPower) {
          results.push({
            id: scheduled.id,
            symbol: scheduled.symbol,
            status: "skipped",
            reason: `Insufficient buying power ($${estCost.toFixed(2)} needed, $${buyingPower.toFixed(2)} available)`,
          });
          continue;
        }
      }

      // Execute the order
      try {
        const alpacaSymbol = yahooToAlpacaSymbol(scheduled.symbol) || scheduled.symbol;

        const orderPayload = {
          symbol: alpacaSymbol,
          qty: scheduled.qty,
          side: scheduled.side,
          type: scheduled.orderType || "limit",
          time_in_force: scheduled.timeInForce || "gtc",
        };

        if (orderPayload.type === "limit" && scheduled.limitPrice) {
          orderPayload.limit_price = scheduled.limitPrice;
        }

        const order = await createOrder(keys.apiKey, keys.secretKey, orderPayload);

        // Update scheduled order status
        await db.scheduledOrder.update({
          where: { id: scheduled.id },
          data: {
            status: "executing",
            alpacaOrderId: order.id,
            lastAttemptAt: new Date(),
            attempts: { increment: 1 },
          },
        });

        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          status: "executing",
          alpaca_order_id: order.id,
        });
      } catch (err) {
        // Update attempt count
        await db.scheduledOrder.update({
          where: { id: scheduled.id },
          data: {
            lastAttemptAt: new Date(),
            attempts: { increment: 1 },
            errorMessage: err.message,
            status: scheduled.attempts + 1 >= scheduled.maxAttempts ? "failed" : "queued",
          },
        });

        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          status: "failed",
          error: err.message,
        });
      }
    }

    const executed = results.filter((r) => r.status === "executing").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return Response.json({
      total: results.length,
      executed,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("Execute scheduled orders error:", error);
    return Response.json(
      { error: `Failed to execute scheduled orders: ${error.message}` },
      { status: 500 }
    );
  }
}
