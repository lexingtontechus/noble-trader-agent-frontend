/**
 * BFF Route: /api/renko/orders
 * Renko-specific order management — lists & creates Alpaca orders for the Renko pipeline.
 *
 * GET  — List recent Alpaca orders (with optional symbol/status filtering)
 * POST — Submit a Renko signal for execution as a bracket order
 */

import { getOrders, createOrder, alpacaFetch } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

// ── GET: List recent orders ────────────────────────────────────────────────────

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
    const symbol = searchParams.get("symbol") || null;
    const status = searchParams.get("status") || "all"; // open, filled, all
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    // Fetch orders from Alpaca
    const alpacaStatus = status === "open" ? "open" : "all";
    let orders = await getOrders(keys.apiKey, keys.secretKey, { status: alpacaStatus });

    // Filter by symbol if specified
    if (symbol) {
      orders = orders.filter((o) => o.symbol === symbol);
    }

    // Limit results
    orders = orders.slice(0, limit);

    // Enrich with Renko trade linkage
    const enriched = orders.map((order) => ({
      ...order,
      _renko: {
        isRenkoOrder: (order.client_order_id || "").startsWith("renko_"),
        signalType: extractRenkoMeta(order, "signal"),
        brickSize: extractRenkoMeta(order, "brick_size"),
      },
    }));

    return Response.json(enriched);
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch orders: ${error.message}` },
      { status: 500 }
    );
  }
}

// ── POST: Submit a Renko signal for execution ─────────────────────────────────

export async function POST(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured. Save your keys in Settings.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { symbol, signal, action, quantity, brick_size, entry_price } = body;

    // Validate required fields
    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }
    if (!action || !["buy", "sell"].includes(action.toLowerCase())) {
      return Response.json({ error: "action must be 'buy' or 'sell'" }, { status: 400 });
    }
    if (!quantity || quantity <= 0) {
      return Response.json({ error: "quantity must be > 0" }, { status: 400 });
    }

    const side = action.toLowerCase();
    const qty = String(quantity);
    const brickSize = brick_size || 0.5;
    const entryPrice = entry_price;

    // Build client_order_id for Renko identification
    const clientId = `renko_${signal || "manual"}_${Date.now()}`;

    // Determine order type: use limit if we have an entry price, else market
    if (entryPrice) {
      // Bracket order: entry (limit) + SL + TP
      const slDistance = 3 * brickSize;
      const tpDistance = 5 * brickSize;

      const slPrice = side === "buy"
        ? (entryPrice - slDistance).toFixed(2)
        : (entryPrice + slDistance).toFixed(2);
      const tpPrice = side === "buy"
        ? (entryPrice + tpDistance).toFixed(2)
        : (entryPrice - tpDistance).toFixed(2);

      // Submit bracket order via Alpaca API
      const bracketBody = {
        symbol,
        qty,
        side,
        type: "limit",
        time_in_force: "day",
        limit_price: String(entryPrice.toFixed(2)),
        order_class: "bracket",
        take_profit: {
          limit_price: tpPrice,
        },
        stop_loss: {
          stop_price: slPrice,
        },
        client_order_id: clientId,
      };

      const result = await alpacaFetch("/orders", {
        apiKey: keys.apiKey,
        secretKey: keys.secretKey,
        method: "POST",
        body: bracketBody,
      });

      return Response.json({
        success: true,
        order: result,
        renko: {
          signal,
          brick_size: brickSize,
          sl_bricks: 3,
          tp_bricks: 5,
          sl_price: slPrice,
          tp_price: tpPrice,
        },
      });
    } else {
      // Market order (no bracket — just entry)
      const result = await createOrder(keys.apiKey, keys.secretKey, {
        symbol,
        qty: quantity,
        side,
        type: "market",
        time_in_force: "day",
      });

      return Response.json({
        success: true,
        order: result,
        renko: {
          signal,
          brick_size: brickSize,
          note: "Market order — no SL/TP bracket (no entry_price provided)",
        },
      });
    }
  } catch (error) {
    return Response.json(
      { error: `Order execution failed: ${error.message}` },
      { status: 500 }
    );
  }
}

// ── DELETE: Cancel all open orders ─────────────────────────────────────────────

export async function DELETE(request) {
  try {
    const keys = await getAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured. Save your keys in Settings.", code: "NO_KEYS" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || null;

    // Alpaca: DELETE /orders cancels all open orders
    // With ?symbol=XYZ it cancels only that symbol's orders
    let path = "/orders";
    if (symbol) path += `?symbol=${encodeURIComponent(symbol)}`;

    await alpacaFetch(path, {
      apiKey: keys.apiKey,
      secretKey: keys.secretKey,
      method: "DELETE",
    });

    return Response.json({
      success: true,
      message: symbol ? `All open orders for ${symbol} cancelled` : "All open orders cancelled",
    });
  } catch (error) {
    return Response.json(
      { error: `Cancel orders failed: ${error.message}` },
      { status: 500 }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract Renko metadata from a client_order_id.
 * Format: renko_{signal}_{timestamp}[_brick:{size}]
 */
function extractRenkoMeta(order, field) {
  const coid = order.client_order_id || "";
  if (!coid.startsWith("renko_")) return null;

  const parts = coid.split("_");
  if (field === "signal") return parts[1] || null;

  // Check for brick_size in the last part
  if (field === "brick_size") {
    const last = parts[parts.length - 1];
    if (last.startsWith("brick:")) {
      return parseFloat(last.replace("brick:", "")) || null;
    }
  }
  return null;
}
