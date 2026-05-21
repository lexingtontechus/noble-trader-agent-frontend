/**
 * BFF Route: /api/alerts
 * Alert management — load and create in-app notifications.
 *
 * GET  /api/alerts?symbol=SPY&limit=50&type=SIGNAL
 * POST /api/alerts  { type, symbol, message, severity, data }
 */

import { sendAlert, getRecentAlerts, formatAlertMessage } from "@/lib/alerting";
import { withAuth } from "@/lib/withAuth";

// ── GET: Load recent alerts ────────────────────────────────────────────────

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const type = searchParams.get("type") || undefined;

    const alerts = await getRecentAlerts({ symbol, limit, type });

    return Response.json({
      alerts,
      total: alerts.length,
    });
  } catch (err) {
    console.error("[alerts GET] Error:", err);
    return Response.json(
      { error: `Failed to fetch alerts: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

// ── POST: Create and send an alert ─────────────────────────────────────────

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { type, symbol, message, severity, data } = body;

    if (!type) {
      return Response.json(
        { error: "Alert type is required (SIGNAL | TRADE | RISK | REGIME | SYSTEM)" },
        { status: 400 }
      );
    }

    if (!message) {
      return Response.json(
        { error: "Alert message is required" },
        { status: 400 }
      );
    }

    const validTypes = ["SIGNAL", "TRADE", "RISK", "REGIME", "SYSTEM"];
    if (!validTypes.includes(type)) {
      return Response.json(
        { error: `Invalid alert type: ${type}. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const record = await sendAlert({
      type,
      symbol: symbol || "system",
      message,
      severity: severity || "info",
      data: data || {},
    });

    const formatted = formatAlertMessage(record);

    return Response.json({
      success: true,
      alert: formatted,
    });
  } catch (err) {
    console.error("[alerts POST] Error:", err);
    return Response.json(
      { error: `Failed to create alert: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

// ── DELETE: Clear all alerts ───────────────────────────────────────────────

export const DELETE = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    // We don't actually delete from the DB (audit trail), but we could
    // mark them as read/dismissed. For now, this is a no-op that returns success.
    // The client handles clearing its local state.

    return Response.json({
      success: true,
      message: symbol
        ? `Alerts for ${symbol} cleared`
        : "All alerts cleared",
    });
  } catch (err) {
    console.error("[alerts DELETE] Error:", err);
    return Response.json(
      { error: `Failed to clear alerts: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
