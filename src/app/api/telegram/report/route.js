import { db } from "@/lib/db";
import { withAuth } from "@/lib/withAuth";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message via Telegram Bot API.
 */
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Telegram API error:", err.description || res.status);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error("Telegram send failed:", err.message);
    return null;
  }
}

/**
 * Resolve Telegram chat ID for sending notifications.
 * Priority: TELEGRAM_CHAT_ID env var → request body → last successful notification in DB.
 */
async function resolveChatId(bodyChatId) {
  // 1. Environment variable takes priority
  if (TELEGRAM_CHAT_ID) return TELEGRAM_CHAT_ID;

  // 2. Request body
  if (bodyChatId) return bodyChatId;

  // 3. Fall back to last successful notification in DB
  try {
    const lastNotif = await db.telegramNotification.findFirst({
      where: { success: true },
      orderBy: { createdAt: "desc" },
    });
    if (lastNotif?.chatId) return lastNotif.chatId;
  } catch {}

  return null;
}

/**
 * Format trade recommendations as a Telegram message.
 */
function formatTradeReport(analysis, execution) {
  const lines = [];

  lines.push("📊 <b>Noble Trader — Portfolio Analysis Report</b>");
  lines.push("");

  // Portfolio allocation
  const allocation = analysis?.portfolio_allocation || analysis?.allocation || {};
  if (Object.keys(allocation).length > 0) {
    lines.push("🏦 <b>Current Allocation</b>");
    for (const [sym, weight] of Object.entries(allocation)) {
      const pct = (typeof weight === "number" ? weight * 100 : parseFloat(weight) * 100).toFixed(1);
      lines.push(`  ${sym}: ${pct}%`);
    }
    lines.push("");
  }

  // Regime summary
  const regimes = analysis?.regime_summary || analysis?.regimes || [];
  if (regimes.length > 0) {
    lines.push("🛡️ <b>Regime Summary</b>");
    for (const r of regimes) {
      const sym = r.symbol || r.asset || "?";
      const regime = r.regime || r.regime_label || "unknown";
      lines.push(`  ${sym}: ${regime}`);
    }
    lines.push("");
  }

  // Correlation regime
  const corrRegime = analysis?.correlation_regime;
  if (corrRegime) {
    const regime = typeof corrRegime === "string" ? corrRegime : corrRegime.regime || "unknown";
    const confidence = typeof corrRegime === "object" ? corrRegime.confidence : 0;
    lines.push(`🔗 <b>Correlation Regime:</b> ${regime} (${((confidence || 0) * 100).toFixed(0)}% confidence)`);
    lines.push("");
  }

  // Optimization metrics
  const metrics = analysis?.optimization_metrics || analysis?.metrics || {};
  if (metrics.expected_return != null || metrics.sharpe != null) {
    lines.push("⚡ <b>Optimization Metrics</b>");
    if (metrics.expected_return != null) {
      lines.push(`  Expected Return: ${(metrics.expected_return * 100).toFixed(2)}%`);
    }
    if (metrics.sharpe != null) {
      lines.push(`  Sharpe Ratio: ${typeof metrics.sharpe === "number" ? metrics.sharpe.toFixed(3) : metrics.sharpe}`);
    }
    if (metrics.max_dd_before != null) {
      lines.push(`  Max DD Before: ${(metrics.max_dd_before * 100).toFixed(1)}%`);
    }
    if (metrics.max_dd_after != null) {
      lines.push(`  Max DD After: ${(metrics.max_dd_after * 100).toFixed(1)}%`);
    }
    lines.push("");
  }

  // Trade recommendations
  const recs = analysis?.recommendations || analysis?.trades || [];
  if (recs.length > 0) {
    lines.push("🎯 <b>Trade Recommendations</b>");
    const sells = recs.filter((r) => (r.side || "").toLowerCase() === "sell");
    const buys = recs.filter((r) => (r.side || "").toLowerCase() === "buy");

    if (sells.length > 0) {
      lines.push("  🔴 <b>SELL:</b>");
      for (const s of sells) {
        lines.push(`    ${s.symbol} × ${s.qty} (${s.order_type || "market"})`);
      }
    }

    if (buys.length > 0) {
      lines.push("  🟢 <b>BUY:</b>");
      for (const b of buys) {
        const price = b.limit_price ? `@ $${b.limit_price}` : "(market)";
        lines.push(`    ${b.symbol} × ${b.qty} ${price}`);
      }
    }
    lines.push("");
  }

  // Execution results
  if (execution) {
    lines.push("📈 <b>Execution Results</b>");
    lines.push(`  Total: ${execution.total || 0} | Filled: ${execution.filled || 0} | Failed: ${execution.failed || 0} | Deferred: ${execution.deferred || 0}`);
    lines.push("");
  }

  lines.push(`⏰ Generated: ${new Date().toISOString()}`);

  return lines.join("\n");
}

/**
 * POST /api/telegram/report
 * Send a formatted trade summary report to Telegram.
 * Body: { chat_id?, analysis, execution, analysisId? }
 */
export const POST = withAuth(async (request, context, authContext) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return Response.json(
      { error: "Telegram bot token not configured", code: "NO_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const chatId = await resolveChatId(body.chat_id || body.chatId);

    if (!chatId) {
      return Response.json(
        { error: "Telegram chat ID required. Set TELEGRAM_CHAT_ID env var or message the bot first to get your chat ID.", code: "NO_CHAT_ID" },
        { status: 400 }
      );
    }

    const analysis = body.analysis || {};
    const execution = body.execution || null;

    // Format the message
    const message = formatTradeReport(analysis, execution);

    // Send via Telegram API
    const result = await sendTelegramMessage(chatId, message);

    if (!result) {
      return Response.json(
        { error: "Telegram send failed", code: "SEND_FAILED" },
        { status: 500 }
      );
    }

    // Log to database
    try {
      await db.telegramNotification.create({
        data: {
          chatId: String(chatId),
          message: message.substring(0, 4000), // SQLite text limit safety
          messageType: "trade_report",
          success: true,
        },
      });
    } catch (dbErr) {
      console.error("Failed to log Telegram notification:", dbErr.message);
    }

    return Response.json({
      success: true,
      message_id: result?.result?.message_id,
      chat_id: chatId,
    });
  } catch (error) {
    console.error("Telegram report error:", error);

    // Log failure
    try {
      await db.telegramNotification.create({
        data: {
          chatId: "unknown",
          message: "Failed to send",
          messageType: "trade_report",
          success: false,
          error: error.message,
        },
      });
    } catch (dbErr) {
      // Ignore DB errors here
    }

    return Response.json(
      { error: `Telegram send failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
