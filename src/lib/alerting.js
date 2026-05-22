/**
 * Alerting Service — sends notifications via multiple channels.
 *
 * Channels:
 *   1. In-app (Supabase ta_telegram_notification table — reused as general notification store)
 *   2. Discord Webhook API (when DISCORD_WEBHOOK_* URLs are configured)
 *   3. Telegram Bot API (when TELEGRAM_BOT_TOKEN is configured — legacy)
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

// ── Environment variables ────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Discord webhooks — one per channel for granular control
const DISCORD_WEBHOOK_SIGNALS = process.env.DISCORD_WEBHOOK_SIGNALS;
const DISCORD_WEBHOOK_EXECUTIONS = process.env.DISCORD_WEBHOOK_EXECUTIONS;
const DISCORD_WEBHOOK_STATUS = process.env.DISCORD_WEBHOOK_STATUS;

// ── Alert type definitions ──────────────────────────────────────────────

export const ALERT_TYPES = {
  SIGNAL: "SIGNAL",
  TRADE: "TRADE",
  RISK: "RISK",
  REGIME: "REGIME",
  SYSTEM: "SYSTEM",
  PRICE: "PRICE",
};

export const SEVERITY_LEVELS = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
};

// ── Discord embed colors ────────────────────────────────────────────────

const DISCORD_COLORS = {
  info: 0x3498db,     // Blue
  success: 0x2ecc71,  // Green
  warning: 0xf39c12,  // Amber
  error: 0xe74c3c,    // Red
};

const DIRECTION_COLORS = {
  LONG: 0x2ecc71,     // Green
  BUY: 0x2ecc71,
  SHORT: 0xe74c3c,    // Red
  SELL: 0xe74c3c,
};

const TYPE_EMOJI = {
  SIGNAL: "📊",
  TRADE: "💰",
  RISK: "⚠️",
  REGIME: "🔄",
  SYSTEM: "🔧",
  PRICE: "🔔",
};

const SEVERITY_EMOJI = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "🚨",
};

// ── Discord Webhook API ─────────────────────────────────────────────────

/**
 * Get the appropriate Discord webhook URL for an alert type.
 *
 * @param {string} alertType - ALERT_TYPES value
 * @returns {string|null} Webhook URL or null if not configured
 */
function getDiscordWebhookUrl(alertType) {
  switch (alertType) {
    case ALERT_TYPES.SIGNAL:
      return DISCORD_WEBHOOK_SIGNALS;
    case ALERT_TYPES.TRADE:
      return DISCORD_WEBHOOK_EXECUTIONS;
    case ALERT_TYPES.RISK:
      return DISCORD_WEBHOOK_STATUS; // Risk alerts go to status channel
    case ALERT_TYPES.REGIME:
      return DISCORD_WEBHOOK_STATUS;
    case ALERT_TYPES.SYSTEM:
      return DISCORD_WEBHOOK_STATUS;
    case ALERT_TYPES.PRICE:
      return DISCORD_WEBHOOK_SIGNALS;
    default:
      return DISCORD_WEBHOOK_STATUS;
  }
}

/**
 * Build a Discord rich embed payload.
 *
 * @param {object} alert - Alert object
 * @returns {object} Discord embed object
 */
function buildDiscordEmbed(alert) {
  const emoji = TYPE_EMOJI[alert.type] || "🔔";
  const sevEmoji = SEVERITY_EMOJI[alert.severity] || "";
  const symbol = alert.symbol || "SYSTEM";

  // Determine embed color
  let color = DISCORD_COLORS[alert.severity] || DISCORD_COLORS.info;

  // Override color for signal/trade based on direction
  if (alert.type === ALERT_TYPES.SIGNAL && alert.data?.direction) {
    color = DIRECTION_COLORS[alert.data.direction.toUpperCase()] || color;
  }
  if (alert.type === ALERT_TYPES.TRADE && alert.data?.direction) {
    color = DIRECTION_COLORS[alert.data.direction.toUpperCase()] || color;
  }

  // Build fields from alert data
  const fields = [];
  if (alert.symbol && alert.symbol !== "system") {
    fields.push({ name: "Symbol", value: alert.symbol, inline: true });
  }
  fields.push({ name: "Severity", value: `${sevEmoji} ${alert.severity}`, inline: true });

  if (alert.data && typeof alert.data === "object") {
    const skipKeys = new Set(["timestamp", "createdAt"]);
    for (const [key, value] of Object.entries(alert.data)) {
      if (skipKeys.has(key) || value === undefined || value === null) continue;
      if (fields.length >= 8) break; // Discord max 25 fields, but 8 is readable
      const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      fields.push({ name: label, value: String(value), inline: true });
    }
  }

  const embed = {
    title: `${emoji} [${alert.type}] ${symbol}`,
    description: alert.message,
    color,
    fields,
    footer: { text: "Noble Trader Agent" },
    timestamp: new Date().toISOString(),
  };

  return embed;
}

/**
 * Send a rich embed notification to Discord via webhook.
 * Silently fails if Discord webhooks are not configured.
 *
 * @param {object} alert - Alert object
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendDiscordMessage(alert) {
  const webhookUrl = getDiscordWebhookUrl(alert.type);
  if (!webhookUrl) return false;

  try {
    const embed = buildDiscordEmbed(alert);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 204 || res.status === 200) {
      return true;
    }

    if (res.status === 429) {
      // Rate limited — extract retry-after
      const retryAfter = res.headers.get("Retry-After") || "2";
      console.warn(`[alerting] Discord rate limited, retry after ${retryAfter}s`);
      return false;
    }

    const err = await res.text().catch(() => "");
    console.error(`[alerting] Discord webhook error: ${res.status}`, err.substring(0, 200));
    return false;
  } catch (err) {
    console.error("[alerting] Discord send failed:", err.message);
    return false;
  }
}

// ── Telegram Bot API ────────────────────────────────────────────────────

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

// ── Format helpers ──────────────────────────────────────────────────────

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

// ── Main alert function ─────────────────────────────────────────────────

/**
 * Send an alert through all configured channels.
 * Always persists to Supabase; sends Discord + Telegram if configured.
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

  // Step 2: Send via Discord (non-blocking, failures don't break anything)
  try {
    await sendDiscordMessage({ type, symbol, message, severity, data });
  } catch (discordErr) {
    console.error("[alerting] Discord send failed (non-critical):", discordErr.message);
  }

  // Step 3: Send via Telegram (non-blocking, failures don't break anything)
  try {
    const telegramMessage = formatAlertTelegram({ type, symbol, message, severity, data });
    await sendTelegramMessage(telegramMessage);
  } catch (telErr) {
    console.error("[alerting] Telegram send failed (non-critical):", telErr.message);
  }

  return record;
}

// ── Query helpers ───────────────────────────────────────────────────────

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

// ── Discord channel check ───────────────────────────────────────────────

/**
 * Check which Discord channels are configured.
 * Useful for UI display to show notification status.
 *
 * @returns {object} { signals, executions, status } — true if webhook URL is set
 */
export function getDiscordChannelStatus() {
  return {
    signals: !!DISCORD_WEBHOOK_SIGNALS,
    executions: !!DISCORD_WEBHOOK_EXECUTIONS,
    status: !!DISCORD_WEBHOOK_STATUS,
  };
}
