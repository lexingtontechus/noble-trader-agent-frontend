/**
 * Alerting Service — sends notifications via multiple channels.
 *
 * Channels:
 *   1. In-app (Supabase ta_telegram_notification table — reused as general notification store)
 *   2. Telegram Bot API (when TELEGRAM_BOT_TOKEN is configured)
 *
 * Alert types:
 *   - SIGNAL: New trading signal detected
 *   - TRADE: Trade executed (entry/exit)
 *   - RISK: Risk limit breach (daily loss, consecutive losses, cooldown)
 *   - REGIME: Regime change detected
 *   - SYSTEM: System alerts (warmup complete, pipeline reset, etc.)
 *
 * The ta_telegram_notification table is reused as a general notification store:
 *   - chatId   → symbol or "system" for system-wide alerts
 *   - message  → human-readable alert message
 *   - messageType → alert type (SIGNAL | TRADE | RISK | REGIME | SYSTEM)
 *   - success  → true for persisted alerts
 *   - error    → JSON stringified metadata: { severity, data }
 */

import { db } from "@/lib/supabase/db";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Alert type definitions ──────────────────────────────────────────────────

export const ALERT_TYPES = {
  SIGNAL: "SIGNAL",
  TRADE: "TRADE",
  RISK: "RISK",
  REGIME: "REGIME",
  SYSTEM: "SYSTEM",
};

export const SEVERITY_LEVELS = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
};

// ── Telegram Bot API ────────────────────────────────────────────────────────

/**
 * Send a message via Telegram Bot API.
 * Silently fails if TELEGRAM_BOT_TOKEN is not configured.
 *
 * @param {string} message - HTML-formatted message to send
 * @returns {Promise<object|null>} Telegram API response or null on failure
 */
export async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[alerting] Telegram API error:", err.description || res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("[alerting] Telegram send failed:", err.message);
    return null;
  }
}

// ── Format helpers ──────────────────────────────────────────────────────────

const TYPE_EMOJI = {
  SIGNAL: "📊",
  TRADE: "💰",
  RISK: "⚠️",
  REGIME: "🔄",
  SYSTEM: "🔧",
};

const SEVERITY_EMOJI = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "🚨",
};

/**
 * Format an alert for Telegram display (HTML).
 *
 * @param {object} alert - Alert object
 * @returns {string} HTML-formatted message
 */
export function formatAlertTelegram(alert) {
  const emoji = TYPE_EMOJI[alert.type] || "🔔";
  const sevEmoji = SEVERITY_EMOJI[alert.severity] || "";
  const symbol = alert.symbol || "SYSTEM";

  const lines = [
    `${emoji} <b>[${alert.type}]</b> ${sevEmoji} <i>${alert.severity}</i>`,
    `<b>Symbol:</b> ${symbol}`,
    alert.message,
  ];

  if (alert.data && Object.keys(alert.data).length > 0) {
    lines.push(`<pre>${JSON.stringify(alert.data, null, 2)}</pre>`);
  }

  lines.push(`⏰ ${new Date().toISOString()}`);

  return lines.join("\n");
}

/**
 * Format an alert for in-app display.
 *
 * @param {object} alert - Alert record from Supabase
 * @returns {object} Formatted alert with parsed metadata
 */
export function formatAlertMessage(alert) {
  if (!alert) return null;

  // Parse metadata from the error field (JSON stringified)
  let metadata = {};
  try {
    if (alert.error) {
      metadata = JSON.parse(alert.error);
    }
  } catch {
    metadata = {};
  }

  return {
    id: alert.id,
    type: alert.messageType || "SYSTEM",
    symbol: alert.chatId === "system" ? null : alert.chatId,
    message: alert.message || "",
    severity: metadata.severity || "info",
    data: metadata.data || {},
    success: alert.success,
    createdAt: alert.createdAt,
  };
}

// ── Main alert function ─────────────────────────────────────────────────────

/**
 * Send an alert through all configured channels.
 * Always persists to Supabase; sends Telegram if configured.
 *
 * @param {object} params
 * @param {string} params.type - Alert type (SIGNAL | TRADE | RISK | REGIME | SYSTEM)
 * @param {string} [params.symbol] - Symbol associated with the alert (e.g., "SPY")
 * @param {string} params.message - Human-readable alert message
 * @param {string} [params.severity="info"] - Severity level (info | success | warning | error)
 * @param {object} [params.data={}] - Additional structured data
 * @returns {Promise<object>} The saved notification record
 */
export async function sendAlert({ type, symbol, message, severity = "info", data = {} }) {
  const chatId = symbol || "system";

  // Step 1: Persist to Supabase
  let record;
  try {
    record = await db.telegramNotification.create({
      data: {
        chatId,
        message: message.substring(0, 4000), // Safety limit
        messageType: type || "SYSTEM",
        success: true,
        error: JSON.stringify({ severity, data }),
      },
    });
  } catch (dbErr) {
    console.error("[alerting] Failed to persist alert:", dbErr.message);
    // Create a minimal fallback record
    record = {
      id: `fallback-${Date.now()}`,
      chatId,
      message,
      messageType: type || "SYSTEM",
      success: false,
      error: JSON.stringify({ severity, data }),
      createdAt: new Date().toISOString(),
    };
  }

  // Step 2: Send via Telegram (non-blocking, failures don't break anything)
  try {
    const telegramMessage = formatAlertTelegram({ type, symbol, message, severity, data });
    await sendTelegramMessage(telegramMessage);
  } catch (telErr) {
    console.error("[alerting] Telegram send failed (non-critical):", telErr.message);
  }

  return record;
}

// ── Query helpers ───────────────────────────────────────────────────────────

/**
 * Fetch recent alerts from Supabase.
 *
 * @param {object} params
 * @param {string} [params.symbol] - Filter by symbol
 * @param {number} [params.limit=50] - Max number of alerts to return
 * @param {string} [params.type] - Filter by alert type
 * @returns {Promise<Array>} Array of formatted alert objects
 */
export async function getRecentAlerts({ symbol, limit = 50, type } = {}) {
  try {
    const where = {};
    if (symbol) {
      where.chatId = symbol;
    }
    if (type) {
      where.messageType = type;
    }

    // Only fetch alert-type notifications (not legacy trade_reports)
    if (!type) {
      // Fetch all alert types
      // We'll filter client-side if needed since Supabase doesn't support OR easily
    }

    const alerts = await db.telegramNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });

    // Filter to only alert-type messages (SIGNAL, TRADE, RISK, REGIME, SYSTEM)
    const alertTypes = new Set(Object.values(ALERT_TYPES));
    const filtered = alerts.filter(
      (a) => alertTypes.has(a.messageType)
    );

    return filtered.map(formatAlertMessage);
  } catch (err) {
    console.error("[alerting] Failed to fetch alerts:", err.message);
    return [];
  }
}
