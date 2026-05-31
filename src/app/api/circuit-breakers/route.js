/**
 * API Route: /api/circuit-breakers
 *
 * GET  — List user's circuit breaker configs (viewer+)
 * POST — Create/update a circuit breaker config (admin+)
 */

import { withAuth } from "@/lib/withAuth";
import { getBreakerConfig, upsertBreakerConfig, deleteBreakerConfig } from "@/lib/circuit-breaker";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const config = await getBreakerConfig({ userId });

    return Response.json({ breakers: config });
  } catch (error) {
    console.error("[circuit-breakers] GET error:", error.message);
    return Response.json(
      { error: `Failed to fetch circuit breaker config: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const body = await request.json();

    const { breakerType, thresholdValue, thresholdUnit, action, cooldownMinutes, isActive } = body;

    if (!breakerType) {
      return Response.json({ error: "breakerType is required" }, { status: 400 });
    }
    if (thresholdValue === undefined || thresholdValue === null) {
      return Response.json({ error: "thresholdValue is required" }, { status: 400 });
    }
    if (!thresholdUnit || !["percent", "dollars", "count"].includes(thresholdUnit)) {
      return Response.json({ error: "thresholdUnit must be 'percent', 'dollars', or 'count'" }, { status: 400 });
    }

    const validBreakerTypes = [
      "max_position_size", "max_portfolio_heat", "daily_loss_limit",
      "max_drawdown", "consecutive_loss_stop", "max_open_positions",
      "order_rate_limit", "sector_concentration", "single_stock_concentration",
    ];
    if (!validBreakerTypes.includes(breakerType)) {
      return Response.json({ error: `Invalid breakerType. Must be one of: ${validBreakerTypes.join(", ")}` }, { status: 400 });
    }

    const validActions = ["reject_order", "halt", "alert"];
    if (action && !validActions.includes(action)) {
      return Response.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
    }

    const result = await upsertBreakerConfig({
      userId,
      breakerType,
      thresholdValue: parseFloat(thresholdValue),
      thresholdUnit,
      action: action || "halt",
      cooldownMinutes: parseInt(cooldownMinutes) || 30,
      isActive: isActive !== false,
    });

    return Response.json({ breaker: result });
  } catch (error) {
    console.error("[circuit-breakers] POST error:", error.message);
    return Response.json(
      { error: `Failed to save circuit breaker config: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });

export const DELETE = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const breakerType = searchParams.get("breakerType");

    if (!breakerType) {
      return Response.json({ error: "breakerType query param is required" }, { status: 400 });
    }

    await deleteBreakerConfig({ userId, breakerType });
    return Response.json({ success: true });
  } catch (error) {
    console.error("[circuit-breakers] DELETE error:", error.message);
    return Response.json(
      { error: `Failed to delete circuit breaker: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });
