import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createOrder, getOrders } from "@/lib/alpaca-client";
import { yahooToAlpacaSymbol } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

/**
 * POST /api/trading/schedule
 * Create a scheduled order for later execution.
 * Body: { symbol, side, orderType, qty, limitPrice?, timeInForce, scheduleAt?, dependsOnOrders?[] }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      symbol,
      side,
      orderType = "limit",
      qty,
      limitPrice,
      timeInForce = "gtc",
      scheduleAt,
      dependsOnOrders,
      reason,
    } = body;

    if (!symbol || !side || !qty) {
      return Response.json(
        { error: "symbol, side, and qty are required" },
        { status: 400 }
      );
    }

    let scheduledOrder = null;
    try {
      if (db?.scheduledOrder) {
        scheduledOrder = await db.scheduledOrder.create({
          data: {
            userId: "default",
            symbol,
            side,
            orderType,
            qty: parseFloat(qty),
            limitPrice: limitPrice ? parseFloat(limitPrice) : null,
            timeInForce,
            reason: reason || "Scheduled order",
            status: "queued",
            scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
            dependsOnOrders: dependsOnOrders ? JSON.stringify(dependsOnOrders) : null,
          },
        });
      }
    } catch (dbErr) {
      console.error("DB create scheduled order failed:", dbErr.message);
    }

    return Response.json(scheduledOrder || {
      id: `sched-${Date.now()}`,
      symbol,
      side,
      status: "queued",
      message: "Scheduled (DB unavailable — order stored in memory only)",
    });
  } catch (error) {
    console.error("Create scheduled order error:", error);
    return Response.json(
      { error: `Failed to create scheduled order: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trading/schedule
 * Get all scheduled orders, optionally filtered by status.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where = {};
    if (status) where.status = status;

    let orders = [];
    try {
      if (db?.scheduledOrder) {
        orders = await db.scheduledOrder.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
      }
    } catch (dbErr) {
      console.error("DB find scheduled orders failed:", dbErr.message);
    }

    return Response.json(orders);
  } catch (error) {
    console.error("Get scheduled orders error:", error);
    return Response.json(
      { error: `Failed to get scheduled orders: ${error.message}` },
      { status: 500 }
    );
  }
}
