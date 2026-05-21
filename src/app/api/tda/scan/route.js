import { extractTDAFeatures } from "@/lib/fastapi-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol } from "@/lib/symbol-utils";
import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/withAuth";

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Configurable thresholds (env vars with sensible defaults)
const ANOMALY_THRESHOLD = parseFloat(process.env.TDA_ANOMALY_THRESHOLD || "1.5");
const REGIME_CHANGE_THRESHOLD = parseFloat(process.env.TDA_REGIME_CHANGE_THRESHOLD || "0.6");
const BETTI_SHIFT_THRESHOLD = parseInt(process.env.TDA_BETTI_SHIFT_THRESHOLD || "2");
const ENTROPY_SURGE_THRESHOLD = parseFloat(process.env.TDA_ENTROPY_SURGE_THRESHOLD || "0.8");

// Fallback Alpaca keys
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_API_SECRET;

async function resolveAlpacaKeys() {
  try {
    const keys = await getAlpacaKeys();
    if (keys?.apiKey && keys?.secretKey) return keys;
  } catch {}
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }
  return null;
}

/**
 * Resolve Telegram chat ID for sending notifications.
 * Priority: TELEGRAM_CHAT_ID env var → last successful notification in DB.
 */
async function resolveChatId() {
  // 1. Environment variable takes priority
  if (TELEGRAM_CHAT_ID) return TELEGRAM_CHAT_ID;

  // 2. Fall back to last successful notification in DB
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
 * Check if the request has a valid CRON_SECRET.
 * The secret can be passed via `x-cron-secret` header or `?secret=` query param.
 * Returns false if CRON_SECRET is configured but doesn't match (strict).
 */
function verifyCronSecret(request) {
  if (!CRON_SECRET) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
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
 * Format a TDA early warning alert as a Telegram message.
 */
function formatTDAAlert(alerts, scanResults) {
  const lines = [];
  const criticalCount = alerts.filter(a => a.alertLevel === "critical").length;
  const highCount = alerts.filter(a => a.alertLevel === "high").length;

  if (criticalCount > 0) {
    lines.push("🚨 <b>TDA EARLY WARNING — CRITICAL</b> 🚨");
  } else if (highCount > 0) {
    lines.push("⚠️ <b>TDA Early Warning — High Alert</b>");
  } else {
    lines.push("🔍 <b>TDA Early Warning — Alert</b>");
  }
  lines.push("");

  for (const alert of alerts) {
    const icon = alert.alertLevel === "critical" ? "🔴" : alert.alertLevel === "high" ? "🟠" : alert.alertLevel === "medium" ? "🟡" : "🟢";
    lines.push(`${icon} <b>${alert.symbol}</b> — ${alert.alertType.replace(/_/g, " ").toUpperCase()}`);
    if (alert.anomalyScore != null) lines.push(`  Anomaly: ${alert.anomalyScore.toFixed(2)}`);
    if (alert.regimeChangeProb != null) lines.push(`  Regime Change: ${(alert.regimeChangeProb * 100).toFixed(1)}%`);
    if (alert.betti0Before != null && alert.betti0After != null) {
      lines.push(`  Betti-0: ${alert.betti0Before} → ${alert.betti0After}`);
    }
    if (alert.betti1Before != null && alert.betti1After != null) {
      lines.push(`  Betti-1: ${alert.betti1Before} → ${alert.betti1After}`);
    }
    lines.push("");
  }

  lines.push(`📊 Scanned ${scanResults.length} symbol(s) | ${alerts.length} alert(s) triggered`);
  lines.push(`⏰ ${new Date().toISOString()}`);
  return lines.join("\n");
}

/**
 * Local fallback TDA scan when FastAPI is unavailable.
 * Uses simplified statistical anomaly detection based on returns.
 */
function localTDAScan(prices, symbol) {
  if (prices.length < 50) return null;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const recent = returns.slice(-20);
  const longer = returns.slice(-60);
  const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const longerMean = longer.reduce((a, b) => a + b, 0) / longer.length;
  const recentVol = Math.sqrt(recent.reduce((a, r) => a + (r - recentMean) ** 2, 0) / recent.length) * Math.sqrt(252);
  const longerVol = Math.sqrt(longer.reduce((a, r) => a + (r - longerMean) ** 2, 0) / longer.length) * Math.sqrt(252);

  // Anomaly: vol regime shift
  const volRatio = recentVol / (longerVol || 0.01);
  const anomalyScore = Math.abs(volRatio - 1) * 2;

  // Regime change probability: based on mean shift + vol shift
  const meanShift = Math.abs(recentMean - longerMean) / (longerVol / Math.sqrt(252) || 0.01);
  const regimeChangeProbability = Math.min((meanShift * 0.3 + Math.abs(volRatio - 1) * 0.5), 1.0);

  // Simplified Betti numbers
  const betti0 = volRatio > 1.3 ? 2 : 1;
  const betti1 = volRatio > 1.5 ? 1 : 0;

  const totalEntropy = Math.min(anomalyScore * 0.5, 1.0);

  return {
    symbol,
    anomaly_score: anomalyScore,
    regime_change_probability: regimeChangeProbability,
    betti_0: betti0,
    betti_1: betti1,
    total_entropy: totalEntropy,
    feature_vector: [anomalyScore, regimeChangeProbability, volRatio, recentVol, longerVol, meanShift, betti0, betti1, totalEntropy, 0],
    source: "local",
  };
}

// GET /api/tda/scan — Health check + last scan info
export const GET = withAuth(async (request, context, authContext) => {
  const hasCronHeader = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (hasCronHeader && !verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized — invalid cron secret", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const lastScan = await db.tDAScanResult.findFirst({ orderBy: { createdAt: "desc" } });
    const alertCount = await db.earlyWarningAlert.count({ where: { acknowledged: false } });
    const totalScans = await db.tDAScanResult.count();

    return Response.json({ status: "ok",
      endpoint: "/api/tda/scan",
      description: "TDA Early Warning Scanner. POST to scan symbols. Add ?secret=CRON_SECRET for cron auth.",
      thresholds: {
        anomaly: ANOMALY_THRESHOLD,
        regime_change: REGIME_CHANGE_THRESHOLD,
        betti_shift: BETTI_SHIFT_THRESHOLD,
        entropy_surge: ENTROPY_SURGE_THRESHOLD,
      },
      stats: {
        total_scans: totalScans,
        unacknowledged_alerts: alertCount,
        last_scan: lastScan ? {
          symbol: lastScan.symbol,
          anomaly_score: lastScan.anomalyScore,
          regime_change_prob: lastScan.regimeChangeProbability,
          alert_triggered: lastScan.alertTriggered,
          time: lastScan.createdAt,
        } : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "trader" });

/**
 * POST /api/tda/scan
 * Run TDA scan on symbols. Can be triggered manually or by Supabase pg_cron.
 *
 * Body: { symbols?: string[], sendTelegram?: boolean }
 * If no symbols provided, scans all current portfolio positions.
 *
 * Cron trigger: POST with x-cron-secret header or ?secret= param
 */
export const POST = withAuth(async (request, context, authContext) => {
  const isCronRequest = verifyCronSecret(request);

  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const requestedSymbols = body.symbols || [];
    const sendTelegram = body.sendTelegram !== false; // Default true

    // Resolve symbols to scan
    let symbols = requestedSymbols;
    if (symbols.length === 0) {
      // Auto-detect from portfolio positions
      const keys = await resolveAlpacaKeys();
      if (keys?.apiKey && keys?.secretKey) {
        try {
          const positions = await getPositions(keys.apiKey, keys.secretKey);
          symbols = (positions || []).map(p => p.symbol).filter(Boolean);
        } catch {
          // Can't fetch positions
        }
      }
    }

    if (symbols.length === 0) {
      return Response.json({
        error: "No symbols to scan. Provide symbols in request body or ensure portfolio has positions.",
        code: "NO_SYMBOLS",
      }, { status: 400 });
    }

    const scanResults = [];
    const alerts = [];

    // Scan each symbol
    for (const sym of symbols) {
      let prices;
      try {
        const yahooSymbol = alpacaToYahooSymbol(sym);
        const data = await fetchHistoricalPrices(yahooSymbol);
        prices = data?.prices || [];
      } catch {
        scanResults.push({ symbol: sym, status: "error", error: "Failed to fetch prices" });
        continue;
      }

      if (!prices || prices.length < 81) {
        scanResults.push({ symbol: sym, status: "skipped", reason: `Insufficient data (${prices?.length || 0} bars, need 81)` });
        continue;
      }

      // Run TDA feature extraction
      let tdaResult;
      let source = "fastapi";
      try {
        tdaResult = await Promise.race([
          extractTDAFeatures(prices, sym, {
            embedding_dim: 3,
            embedding_delay: 1,
            max_filtration: 2.0,
            n_filtration_steps: 20,
            anomaly_threshold: ANOMALY_THRESHOLD,
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("TDA timeout")), 60000)),
        ]);
      } catch {
        // Local fallback
        source = "local";
        tdaResult = localTDAScan(prices, sym);
      }

      if (!tdaResult) {
        scanResults.push({ symbol: sym, status: "error", error: "TDA scan produced no results" });
        continue;
      }

      // Evaluate thresholds and determine alert level
      const anomalyScore = tdaResult.anomaly_score ?? 0;
      const regimeChangeProb = tdaResult.regime_change_probability ?? 0;
      const betti0 = tdaResult.betti_0 ?? 0;
      const betti1 = tdaResult.betti_1 ?? 0;
      const totalEntropy = tdaResult.total_entropy ?? 0;

      let alertLevel = "none";
      let alertType = null;
      const triggeredReasons = [];

      // Check anomaly threshold
      if (anomalyScore >= ANOMALY_THRESHOLD * 1.5) {
        alertLevel = "critical";
        alertType = "anomaly_spike";
        triggeredReasons.push(`anomaly=${anomalyScore.toFixed(2)} >= ${(ANOMALY_THRESHOLD * 1.5).toFixed(2)}`);
      } else if (anomalyScore >= ANOMALY_THRESHOLD) {
        if (alertLevel === "none") { alertLevel = "high"; alertType = "anomaly_spike"; }
        triggeredReasons.push(`anomaly=${anomalyScore.toFixed(2)} >= ${ANOMALY_THRESHOLD.toFixed(2)}`);
      }

      // Check regime change probability
      if (regimeChangeProb >= REGIME_CHANGE_THRESHOLD * 1.3) {
        alertLevel = "critical";
        alertType = alertType || "regime_change";
        triggeredReasons.push(`regime_change=${(regimeChangeProb * 100).toFixed(1)}% >= ${(REGIME_CHANGE_THRESHOLD * 1.3 * 100).toFixed(0)}%`);
      } else if (regimeChangeProb >= REGIME_CHANGE_THRESHOLD) {
        if (alertLevel === "none" || alertLevel === "medium") { alertLevel = "high"; alertType = alertType || "regime_change"; }
        triggeredReasons.push(`regime_change=${(regimeChangeProb * 100).toFixed(1)}% >= ${(REGIME_CHANGE_THRESHOLD * 100).toFixed(0)}%`);
      }

      // Check Betti number shifts (compare with last scan)
      let betti0Before = null, betti1Before = null;
      try {
        const lastScan = await db.tDAScanResult.findFirst({
          where: { symbol: sym },
          orderBy: { createdAt: "desc" },
        });
        if (lastScan) {
          betti0Before = lastScan.betti0;
          betti1Before = lastScan.betti1;
          const betti0Shift = Math.abs((betti0 || 0) - (betti0Before || 0));
          const betti1Shift = Math.abs((betti1 || 0) - (betti1Before || 0));
          if (betti0Shift >= BETTI_SHIFT_THRESHOLD || betti1Shift >= BETTI_SHIFT_THRESHOLD) {
            if (alertLevel === "none") { alertLevel = "medium"; alertType = "betti_shift"; }
            triggeredReasons.push(`betti_shift: 0d=${betti0Before}→${betti0}, 1d=${betti1Before}→${betti1}`);
          }
        }
      } catch {}

      // Check entropy surge
      if (totalEntropy >= ENTROPY_SURGE_THRESHOLD) {
        if (alertLevel === "none") { alertLevel = "medium"; alertType = alertType || "entropy_surge"; }
        triggeredReasons.push(`entropy=${totalEntropy.toFixed(2)} >= ${ENTROPY_SURGE_THRESHOLD.toFixed(2)}`);
      }

      const alertTriggered = alertLevel !== "none";

      // Save scan result to DB
      let scanResultId = null;
      try {
        const scanRecord = await db.tDAScanResult.create({
          data: {
            symbol: sym,
            anomalyScore: anomalyScore,
            regimeChangeProbability: regimeChangeProb,
            betti0: betti0,
            betti1: betti1,
            totalEntropy: totalEntropy,
            featureVector: JSON.stringify(tdaResult.feature_vector || []),
            alertTriggered: alertTriggered,
            alertLevel: alertLevel !== "none" ? alertLevel : null,
            source: source,
            scanResults: JSON.stringify(tdaResult),
          },
        });
        scanResultId = scanRecord.id;
      } catch (dbErr) {
        console.error(`Failed to save TDA scan for ${sym}:`, dbErr.message);
      }

      // Create alert if triggered
      if (alertTriggered) {
        const alertMessage = triggeredReasons.length > 0
          ? `TDA ${alertLevel.toUpperCase()} alert for ${sym}: ${triggeredReasons.join(", ")}`
          : `TDA ${alertLevel.toUpperCase()} alert for ${sym}`;

        let alertRecord = null;
        try {
          alertRecord = await db.earlyWarningAlert.create({
            data: {
              symbol: sym,
              alertType: alertType || "regime_change",
              alertLevel: alertLevel,
              anomalyScore: anomalyScore,
              regimeChangeProb: regimeChangeProb,
              betti0Before: betti0Before,
              betti0After: betti0,
              betti1Before: betti1Before,
              betti1After: betti1,
              message: alertMessage,
              telegramSent: false,
              scanResultId: scanResultId,
            },
          });
        } catch (dbErr) {
          console.error(`Failed to save alert for ${sym}:`, dbErr.message);
        }

        alerts.push({
          symbol: sym,
          alertType,
          alertLevel,
          anomalyScore,
          regimeChangeProb,
          betti0Before,
          betti0After: betti0,
          betti1Before,
          betti1After: betti1,
          message: alertMessage,
          alertId: alertRecord?.id,
        });
      }

      scanResults.push({
        symbol: sym,
        status: "scanned",
        anomaly_score: anomalyScore,
        regime_change_probability: regimeChangeProb,
        betti_0: betti0,
        betti_1: betti1,
        total_entropy: totalEntropy,
        alert_triggered: alertTriggered,
        alert_level: alertLevel,
        source,
      });
    }

    // Send Telegram alerts if any were triggered
    let telegramSent = false;
    if (alerts.length > 0 && sendTelegram) {
      const chatId = await resolveChatId();
      if (chatId && TELEGRAM_BOT_TOKEN) {
        try {
          const message = formatTDAAlert(alerts, scanResults);
          const result = await sendTelegramMessage(chatId, message);
          if (result) {
            telegramSent = true;
            // Update alert records
            for (const alert of alerts) {
              if (alert.alertId) {
                try {
                  await db.earlyWarningAlert.update({
                    where: { id: alert.alertId },
                    data: { telegramSent: true, telegramChatId: String(chatId) },
                  });
                } catch {}
              }
            }
            // Log notification
            try {
              await db.telegramNotification.create({
                data: {
                  chatId: String(chatId),
                  message: `TDA Alert: ${alerts.length} warning(s) triggered`,
                  messageType: "tda_alert",
                  success: true,
                },
              });
            } catch {}
          }
        } catch (telErr) {
          console.error("Telegram notification failed:", telErr.message);
        }
      }
    }

    return Response.json({
      scanned: scanResults.length,
      alerts_triggered: alerts.length,
      telegram_sent: telegramSent,
      scan_results: scanResults,
      alerts,
      thresholds: {
        anomaly: ANOMALY_THRESHOLD,
        regime_change: REGIME_CHANGE_THRESHOLD,
        betti_shift: BETTI_SHIFT_THRESHOLD,
        entropy_surge: ENTROPY_SURGE_THRESHOLD,
      },
      cron_triggered: isCronRequest,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("TDA scan error:", error);
    return Response.json({ error: `TDA scan failed: ${error.message}` }, { status: 500 });
  }
}, { minRole: "trader" });
