import { db } from "@/lib/db";

/**
 * GET /api/tda/alerts
 * Fetch early warning alert history.
 * Query params: acknowledged (bool), limit (int), symbol (string)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const acknowledged = searchParams.get("acknowledged");
    const limit = parseInt(searchParams.get("limit") || "50");
    const symbol = searchParams.get("symbol");

    const where = {};
    if (acknowledged !== null && acknowledged !== "") {
      where.acknowledged = acknowledged === "true";
    }
    if (symbol) {
      where.symbol = symbol;
    }

    const alerts = await db.earlyWarningAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    const unacknowledgedCount = await db.earlyWarningAlert.count({
      where: { acknowledged: false },
    });

    // Also get the latest scan results for dashboard
    const latestScans = await db.tDAScanResult.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return Response.json({
      alerts,
      latest_scans: latestScans,
      unacknowledged_count: unacknowledgedCount,
      total_alerts: alerts.length,
    });
  } catch (error) {
    console.error("Fetch TDA alerts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/tda/alerts
 * Acknowledge an alert.
 * Body: { alertId: string, acknowledged: boolean }
 */
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { alertId, acknowledged } = body;

    if (!alertId) {
      return Response.json({ error: "alertId is required" }, { status: 400 });
    }

    const updated = await db.earlyWarningAlert.update({
      where: { id: alertId },
      data: { acknowledged: acknowledged !== false },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Acknowledge alert error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
