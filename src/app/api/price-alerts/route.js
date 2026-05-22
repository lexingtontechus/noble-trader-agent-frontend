/**
 * BFF Route: /api/price-alerts
 * User-defined price alerts triggered by real-time WebSocket price feed.
 *
 * GET    /api/price-alerts                    — List user's alerts
 * GET    /api/price-alerts?symbol=AAPL        — Filter by symbol
 * GET    /api/price-alerts?enabled=true        — Filter enabled only
 * POST   /api/price-alerts                    — Create new alert
 * PATCH  /api/price-alerts?id=xxx             — Update alert (toggle, edit)
 * DELETE /api/price-alerts?id=xxx             — Delete alert
 * POST   /api/price-alerts?action=check       — Check alerts against current prices
 */

import { db } from "@/lib/supabase/db";
import { withAuth } from "@/lib/withAuth";
import { sendAlert } from "@/lib/alerting";
import { dispatchNotification } from "@/lib/notifications";

// ── Lazy table creation ──────────────────────────────────────────────────────

let _tableVerified = false;

/**
 * Ensure the ta_price_alerts table exists. Runs once on first API call,
 * then short-circuits. Uses the Supabase REST API to probe for the table
 * and provides a helpful error if it doesn't exist yet.
 */
async function ensureTable() {
  if (_tableVerified) return;

  try {
    // Try a lightweight query — if table exists, this succeeds
    await db.priceAlert.findMany({ take: 1 });
    _tableVerified = true;
  } catch (err) {
    if (err.message?.includes("does not exist") || err.message?.includes("not found") || err.message?.includes("42P01")) {
      console.warn("[price-alerts] Table ta_price_alerts does not exist. Run migration 00000000000030_price_alerts.sql");
    }
    // Don't throw — let the route handlers return a graceful error
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function validateAlert(body) {
  const errors = [];

  if (!body.symbol || typeof body.symbol !== "string") {
    errors.push("symbol is required");
  }
  if (body.target_price == null || typeof body.target_price !== "number" || body.target_price <= 0) {
    errors.push("target_price must be a positive number");
  }
  const validDirections = ["above", "below", "crosses"];
  if (body.direction && !validDirections.includes(body.direction)) {
    errors.push(`direction must be one of: ${validDirections.join(", ")}`);
  }
  const validSeverities = ["info", "warning", "error"];
  if (body.severity && !validSeverities.includes(body.severity)) {
    errors.push(`severity must be one of: ${validSeverities.join(", ")}`);
  }
  if (body.cooldown_minutes != null && (typeof body.cooldown_minutes !== "number" || body.cooldown_minutes < 0)) {
    errors.push("cooldown_minutes must be a non-negative number");
  }

  return errors;
}

/**
 * Check if an alert should fire based on current price and direction.
 */
function shouldAlertFire(alert, currentPrice) {
  if (!alert.enabled || alert.triggered) return false;

  // Check cooldown
  if (alert.lastTriggered || alert.last_triggered) {
    const lastTime = new Date(alert.lastTriggered || alert.last_triggered).getTime();
    const cooldownMs = (alert.cooldownMinutes || alert.cooldown_minutes || 15) * 60 * 1000;
    if (Date.now() - lastTime < cooldownMs) return false;
  }

  const direction = alert.direction || alert.Direction || "above";
  const target = alert.targetPrice || alert.target_price;

  switch (direction) {
    case "above":
      return currentPrice >= target;
    case "below":
      return currentPrice <= target;
    case "crosses":
      // Crosses fires if price is within 0.1% of target
      return Math.abs(currentPrice - target) / target < 0.001;
    default:
      return false;
  }
}

// ── GET: List alerts ─────────────────────────────────────────────────────────

export const GET = withAuth(async (request, context, authContext) => {
  try {
    await ensureTable();
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || undefined;
    const enabled = searchParams.get("enabled");
    const includeTriggered = searchParams.get("includeTriggered") === "true";

    const userId = authContext.userId;

    const where = { userId };
    if (symbol) where.symbol = symbol;
    if (enabled === "true") where.enabled = true;
    if (!includeTriggered) where.triggered = false;

    const alerts = await db.priceAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return Response.json({
      alerts,
      total: alerts.length,
    });
  } catch (err) {
    console.error("[price-alerts GET] Error:", err);
    return Response.json(
      { error: `Failed to fetch price alerts: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

// ── POST: Create alert or check alerts ───────────────────────────────────────

export const POST = withAuth(async (request, context, authContext) => {
  try {
    await ensureTable();
    const body = await request.json();
    const userId = authContext.userId;

    // Special action: check alerts against current prices
    if (body.action === "check") {
      return await handleCheckAlerts(body, userId);
    }

    // Validate
    const errors = validateAlert(body);
    if (errors.length > 0) {
      return Response.json(
        { error: `Validation failed: ${errors.join(", ")}` },
        { status: 400 }
      );
    }

    const alert = await db.priceAlert.create({
      data: {
        id: generateId(),
        userId,
        symbol: body.symbol.toUpperCase(),
        targetPrice: body.target_price,
        direction: body.direction || "above",
        severity: body.severity || "info",
        enabled: body.enabled !== false,
        triggered: false,
        cooldownMinutes: body.cooldown_minutes ?? 15,
        label: body.label || null,
        triggerCount: 0,
      },
    });

    return Response.json({
      success: true,
      alert,
    }, { status: 201 });
  } catch (err) {
    console.error("[price-alerts POST] Error:", err);
    return Response.json(
      { error: `Failed to create price alert: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

// ── PATCH: Update alert ──────────────────────────────────────────────────────

export const PATCH = withAuth(async (request, context, authContext) => {
  try {
    await ensureTable();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Alert id is required (?id=xxx)" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const userId = authContext.userId;

    // Build update data from camelCase API → snake_case DB
    const updateData = { updatedAt: new Date().toISOString() };

    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.target_price !== undefined) updateData.targetPrice = body.target_price;
    if (body.direction !== undefined) updateData.direction = body.direction;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.cooldown_minutes !== undefined) updateData.cooldownMinutes = body.cooldown_minutes;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.triggered !== undefined) {
      updateData.triggered = body.triggered;
      if (!body.triggered) {
        // Reset when un-triggering (re-arm the alert)
        updateData.triggeredAt = null;
      }
    }

    const alert = await db.priceAlert.update({
      where: { id },
      data: updateData,
    });

    return Response.json({
      success: true,
      alert,
    });
  } catch (err) {
    console.error("[price-alerts PATCH] Error:", err);
    return Response.json(
      { error: `Failed to update price alert: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

// ── DELETE: Delete alert ─────────────────────────────────────────────────────

export const DELETE = withAuth(async (request, context, authContext) => {
  try {
    await ensureTable();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Alert id is required (?id=xxx)" },
        { status: 400 }
      );
    }

    await db.priceAlert.delete({ where: { id } });

    return Response.json({
      success: true,
      message: "Price alert deleted",
    });
  } catch (err) {
    console.error("[price-alerts DELETE] Error:", err);
    return Response.json(
      { error: `Failed to delete price alert: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

// ── Check alerts against current prices ──────────────────────────────────────

async function handleCheckAlerts(body, userId) {
  const { prices } = body; // { AAPL: 182.52, SPY: 456.78, ... }

  if (!prices || typeof prices !== "object") {
    return Response.json(
      { error: "prices object is required: { SYMBOL: price, ... }" },
      { status: 400 }
    );
  }

  const triggeredAlerts = [];

  try {
    // Get all enabled, non-triggered alerts for this user
    const alerts = await db.priceAlert.findMany({
      where: { userId, enabled: true, triggered: false },
      take: 500,
    });

    for (const alert of alerts) {
      const currentPrice = prices[alert.symbol];
      if (currentPrice == null) continue;

      if (shouldAlertFire(alert, currentPrice)) {
        const direction = alert.direction || "above";
        const directionLabel = direction === "above" ? "rose above" : direction === "below" ? "fell below" : "crossed";
        const message = `${alert.symbol} ${directionLabel} $${alert.targetPrice || alert.target_price} (now $${currentPrice.toFixed(2)})`;

        // Update the alert as triggered
        try {
          await db.priceAlert.update({
            where: { id: alert.id },
            data: {
              triggered: true,
              triggeredAt: new Date().toISOString(),
              lastTriggered: new Date().toISOString(),
              triggerCount: { increment: 1 },
              updatedAt: new Date().toISOString(),
            },
          });
        } catch (updateErr) {
          console.error("[price-alerts] Failed to update triggered alert:", updateErr.message);
        }

        // Send persistent alert through multi-channel system
        try {
          await sendAlert({
            type: "PRICE",
            symbol: alert.symbol,
            message,
            severity: alert.severity || "info",
            data: {
              alertId: alert.id,
              targetPrice: alert.targetPrice || alert.target_price,
              currentPrice,
              direction,
              label: alert.label,
            },
          });
        } catch (alertErr) {
          console.error("[price-alerts] Failed to send alert notification:", alertErr.message);
        }

        // Also dispatch in-app notification (respects preferences/quiet hours)
        try {
          await dispatchNotification("price_alert", {
            title: `Price Alert: ${alert.symbol}`,
            message,
            severity: alert.severity || "info",
            symbol: alert.symbol,
            metadata: {
              alertId: alert.id,
              targetPrice: alert.targetPrice || alert.target_price,
              currentPrice,
              direction,
            },
          });
        } catch (dispatchErr) {
          console.error("[price-alerts] Failed to dispatch notification:", dispatchErr.message);
        }

        triggeredAlerts.push({
          id: alert.id,
          symbol: alert.symbol,
          direction,
          targetPrice: alert.targetPrice || alert.target_price,
          currentPrice,
          message,
        });
      }
    }

    return Response.json({
      triggered: triggeredAlerts,
      count: triggeredAlerts.length,
      checked: alerts.length,
    });
  } catch (err) {
    console.error("[price-alerts check] Error:", err);
    return Response.json(
      { error: `Failed to check alerts: ${err.message}` },
      { status: 500 }
    );
  }
}
