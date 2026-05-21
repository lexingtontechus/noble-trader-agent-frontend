/**
 * Cron-based health check: Vercel Cron pings this endpoint every 5 minutes.
 * It checks the FastAPI backend health and sends a Discord alert if down.
 * The endpoint is protected by CRON_SECRET to prevent unauthorized calls.
 */

import { FASTAPI_BASE } from "@/lib/config";

// Track consecutive failures to avoid spamming Discord
let consecutiveFailures = 0;
let lastAlertTs = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min between repeated alerts

export async function GET(request) {
  // Verify cron secret to prevent abuse
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  let backendStatus = "unknown";
  let latencyMs = 0;

  try {
    const res = await fetch(`${FASTAPI_BASE}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    latencyMs = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    backendStatus = res.ok ? "ok" : "degraded";

    if (!res.ok || data?.status !== "ok") {
      backendStatus = "degraded";
      consecutiveFailures++;
    } else {
      // Backend is healthy — reset failure counter
      if (consecutiveFailures > 0) {
        // Send recovery notification
        await _sendDiscordAlert(
          "Backend Recovered",
          `FastAPI backend is back online after ${consecutiveFailures} failed checks. Latency: ${latencyMs}ms.`,
          "INFO"
        );
      }
      consecutiveFailures = 0;
    }
  } catch (error) {
    latencyMs = Date.now() - start;
    backendStatus = "offline";
    consecutiveFailures++;
  }

  // Send Discord alert if backend is down (with cooldown)
  if (backendStatus !== "ok" && consecutiveFailures >= 2) {
    const now = Date.now();
    if (now - lastAlertTs > ALERT_COOLDOWN_MS) {
      await _sendDiscordAlert(
        "Backend Health Alert",
        `FastAPI backend is **${backendStatus}** (consecutive failures: ${consecutiveFailures}, latency: ${latencyMs}ms). Immediate attention required.`,
        "ERROR"
      );
      lastAlertTs = now;
    }
  }

  return Response.json({
    status: backendStatus,
    consecutiveFailures,
    latency_ms: latencyMs,
    checked_at: new Date().toISOString(),
  });
}

/**
 * Send a Discord alert via the STATUS webhook.
 * Fire-and-forget — never blocks or crashes.
 */
async function _sendDiscordAlert(title, message, level) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_STATUS;
  if (!webhookUrl) return;

  try {
    const colorMap = { INFO: 5763719, WARNING: 16776960, ERROR: 15548997 };
    const color = colorMap[level] || 15548997;

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description: message,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: "Noble Trader Health Monitor" },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Discord alert failure is non-critical
  }
}
