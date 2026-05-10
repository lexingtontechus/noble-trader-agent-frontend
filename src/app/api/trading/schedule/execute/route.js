import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { createOrder, getOrders, getAccount } from "@/lib/alpaca-client";
import { yahooToAlpacaSymbol } from "@/lib/symbol-utils";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Fallback Alpaca keys from env vars (used when Clerk auth is unavailable for cron)
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys() {
  // Try Clerk auth first
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {
    // Clerk not available — fall through to env vars
  }
  // Fallback to environment variables
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.description || `Telegram API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Check if the request has a valid CRON_SECRET.
 * The secret can be passed via `x-cron-secret` header or `?secret=` query param.
 */
function verifyCronSecret(request) {
  if (!CRON_SECRET) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

// GET /api/trading/schedule/execute
// Health check endpoint. If CRON_SECRET is provided, returns queue status.
export async function GET(request) {
  const hasCronHeader = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (hasCronHeader) {
    if (!verifyCronSecret(request)) {
      return Response.json({ error: "Unauthorized — invalid cron secret", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const queuedCount = await db.scheduledOrder.count({ where: { status: "queued" } });
    return Response.json({
      status: "ok",
      cron_endpoint: true,
      queued_orders: queuedCount,
      message: queuedCount > 0 ? `${queuedCount} scheduled order(s) waiting to be processed` : "No scheduled orders pending",
      timestamp: new Date().toISOString(),
    });
  }

  // Default health check (no CRON_SECRET required)
  return Response.json({
    status: "ok",
    endpoint: "/api/trading/schedule/execute",
    description: "Process scheduled orders. POST to execute. Add ?secret=CRON_SECRET for cron auth.",
    timestamp: new Date().toISOString(),
  });
}

// POST /api/trading/schedule/execute
// Process scheduled orders that are due and whose dependencies are met.
export async function POST(request) {
  const isCronRequest = verifyCronSecret(request);

  try {
    const keys = await resolveAlpacaKeys();
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        { error: "Alpaca API keys not configured", code: "NO_KEYS" },
        { status: isCronRequest ? 200 : 403 }
      );
    }

    // Get all queued scheduled orders
    const scheduledOrders = await db.scheduledOrder.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    // Sort: sells first, then buys (frees up buying power)
    const sells = scheduledOrders.filter(o => o.side === "sell");
    const buys = scheduledOrders.filter(o => o.side === "buy");
    const sortedOrders = [...sells, ...buys];

    if (sortedOrders.length === 0) {
      return Response.json({ message: "No scheduled orders to process", results: [], timestamp: new Date().toISOString() });
    }

    // Get current Alpaca orders to check dependencies
    const alpacaOrders = await getOrders(keys.apiKey, keys.secretKey, { status: "all" });
    const orderMap = new Map(alpacaOrders.map((o) => [o.id, o]));

    // Get account for buying power check
    const account = await getAccount(keys.apiKey, keys.secretKey);
    const buyingPower = parseFloat(account?.buying_power) || 0;

    const results = [];
    const executedOrders = [];

    for (const scheduled of sortedOrders) {
      // Check if schedule time has been reached (if set)
      if (scheduled.scheduleAt && new Date() < new Date(scheduled.scheduleAt)) {
        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          side: scheduled.side,
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
              side: scheduled.side,
              status: "skipped",
              reason: "Dependency orders not yet filled",
            });
            continue;
          }
        } catch {
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
            side: scheduled.side,
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

        executedOrders.push({
          symbol: scheduled.symbol,
          side: scheduled.side,
          qty: scheduled.qty,
          orderId: order.id,
        });

        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          side: scheduled.side,
          status: "executing",
          alpaca_order_id: order.id,
        });
      } catch (err) {
        const newAttempts = scheduled.attempts + 1;
        await db.scheduledOrder.update({
          where: { id: scheduled.id },
          data: {
            lastAttemptAt: new Date(),
            attempts: { increment: 1 },
            errorMessage: err.message,
            status: newAttempts >= scheduled.maxAttempts ? "failed" : "queued",
          },
        });

        results.push({
          id: scheduled.id,
          symbol: scheduled.symbol,
          side: scheduled.side,
          status: newAttempts >= scheduled.maxAttempts ? "failed" : "skipped",
          error: err.message,
        });
      }
    }

    const executed = results.filter((r) => r.status === "executing").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    // Send Telegram notification if this was triggered by cron
    let telegramSent = false;
    if (isCronRequest && executedOrders.length > 0 && TELEGRAM_BOT_TOKEN) {
      try {
        const lastNotif = await db.telegramNotification.findFirst({
          where: { success: true },
          orderBy: { createdAt: "desc" },
        });

        if (lastNotif?.chatId) {
          const lines = [
            "⏰ <b>Scheduled Orders Executed</b>",
            "",
            `📊 Results: ${executed} executed, ${skipped} skipped, ${failed} failed`,
            "",
          ];
          for (const o of executedOrders) {
            const icon = o.side === "sell" ? "🔴" : "🟢";
            lines.push(`  ${icon} ${o.side.toUpperCase()} ${o.symbol} × ${o.qty}`);
          }
          lines.push("", `🕐 ${new Date().toISOString()}`);

          await sendTelegramMessage(lastNotif.chatId, lines.join("\n"));

          await db.telegramNotification.create({
            data: {
              chatId: lastNotif.chatId,
              message: `Cron: ${executed} orders executed`,
              messageType: "schedule_reminder",
              success: true,
            },
          });
          telegramSent = true;
        }
      } catch (telErr) {
        console.error("Telegram notification failed:", telErr.message);
      }
    }

    return Response.json({
      total: results.length,
      executed,
      skipped,
      failed,
      results,
      cron_triggered: isCronRequest,
      telegram_sent: telegramSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Execute scheduled orders error:", error);
    return Response.json(
      { error: `Failed to execute scheduled orders: ${error.message}` },
      { status: 500 }
    );
  }
}
