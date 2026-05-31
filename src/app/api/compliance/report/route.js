/**
 * GET /api/compliance/report
 *
 * Generates a compliance report summary from the trade_audit_log.
 * Shows: Total trades, Win/Loss ratio, Average trade size, Risk events,
 * Kill switch activations, Mode changes, Reconciliation pass/fail rate.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 * Requires viewer+ role.
 */

import { withAuth } from "@/lib/withAuth";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const GET = withAuth(async (request, context, authContext) => {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("date_from") || "";
  const dateTo = searchParams.get("date_to") || "";

  const client = getServiceClient();
  if (!client) {
    return Response.json({
      report: null,
      note: "Supabase service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY env var.",
    });
  }

  try {
    // Build base query filters
    const buildQuery = () => {
      let query = client.from("trade_audit_log").select("*");
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");
      return query;
    };

    // Fetch all events for the date range (up to 10000 for report generation)
    let query = buildQuery();
    query = query.order("created_at", { ascending: false }).limit(10000);
    const { data: events, error } = await query;

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return Response.json({
          report: null,
          note: "The trade_audit_log table does not exist yet. Run migration 00000000000014.",
        });
      }
      console.error("[compliance/report] Supabase error:", error.message);
      return Response.json(
        { error: `Report generation failed: ${error.message}` },
        { status: 500 }
      );
    }

    const allEvents = events || [];

    // Compute compliance report stats
    const totalTrades = allEvents.filter((e) =>
      ["ORDER_SUBMITTED", "ORDER_FILLED", "ORDER_REJECTED", "ORDER_CANCELLED", "ORDER_PARTIAL_FILL"].includes(e.event_type)
    ).length;

    const filledOrders = allEvents.filter((e) => e.event_type === "ORDER_FILLED").length;
    const rejectedOrders = allEvents.filter((e) => e.event_type === "ORDER_REJECTED").length;
    const cancelledOrders = allEvents.filter((e) => e.event_type === "ORDER_CANCELLED").length;

    // Win/Loss: based on direction and metadata
    const filledEvents = allEvents.filter((e) => e.event_type === "ORDER_FILLED");
    let wins = 0;
    let losses = 0;
    for (const ev of filledEvents) {
      const meta = ev.metadata || {};
      if (meta.outcome === "win" || meta.pnl > 0) wins++;
      else if (meta.outcome === "loss" || meta.pnl < 0) losses++;
    }
    // If no explicit win/loss data, derive from fill/reject ratio
    if (wins === 0 && losses === 0 && filledOrders > 0) {
      // No explicit win/loss data available
      wins = null;
      losses = null;
    }

    // Average trade size (quantity)
    const tradesWithQty = filledEvents.filter((e) => e.quantity != null);
    const avgTradeSize = tradesWithQty.length > 0
      ? tradesWithQty.reduce((sum, e) => sum + parseFloat(e.quantity || 0), 0) / tradesWithQty.length
      : 0;

    // Risk events
    const riskEvents = allEvents.filter((e) => e.event_type === "RISK_LIMIT_BREACH").length;

    // Kill switch activations
    const killSwitchCancel = allEvents.filter((e) => e.event_type === "KILL_SWITCH_CANCEL_ALL").length;
    const killSwitchClose = allEvents.filter((e) => e.event_type === "KILL_SWITCH_CLOSE_ALL").length;
    const killSwitchActivations = killSwitchCancel + killSwitchClose;

    // Mode changes
    const modeChanges = allEvents.filter((e) => e.event_type === "MODE_CHANGED").length;

    // Reconciliation
    const reconPassed = allEvents.filter((e) => e.event_type === "RECONCILIATION_PASSED").length;
    const reconFailed = allEvents.filter((e) => e.event_type === "RECONCILIATION_FAILED").length;
    const totalRecon = reconPassed + reconFailed;
    const reconPassRate = totalRecon > 0 ? ((reconPassed / totalRecon) * 100).toFixed(1) : null;

    // Fill rate
    const fillRate = totalTrades > 0 ? ((filledOrders / totalTrades) * 100).toFixed(1) : "0.0";
    const rejectionRate = totalTrades > 0 ? ((rejectedOrders / totalTrades) * 100).toFixed(1) : "0.0";

    // Halt events
    const haltActivated = allEvents.filter((e) => e.event_type === "HALT_ACTIVATED").length;
    const haltDeactivated = allEvents.filter((e) => e.event_type === "HALT_DEACTIVATED").length;

    const report = {
      dateRange: {
        from: dateFrom || "all",
        to: dateTo || "now",
      },
      totalEvents: allEvents.length,
      trades: {
        total: totalTrades,
        filled: filledOrders,
        rejected: rejectedOrders,
        cancelled: cancelledOrders,
        fillRate: `${fillRate}%`,
        rejectionRate: `${rejectionRate}%`,
      },
      winLoss: {
        wins,
        losses,
        ratio: wins !== null && losses !== null && losses > 0
          ? (wins / losses).toFixed(2)
          : wins !== null ? "N/A (no losses)" : "N/A (no outcome data)",
      },
      averageTradeSize: avgTradeSize > 0 ? avgTradeSize.toFixed(4) : "0",
      riskEvents,
      killSwitch: {
        activations: killSwitchActivations,
        cancelAll: killSwitchCancel,
        closeAll: killSwitchClose,
      },
      halt: {
        activated: haltActivated,
        deactivated: haltDeactivated,
      },
      modeChanges,
      reconciliation: {
        passed: reconPassed,
        failed: reconFailed,
        total: totalRecon,
        passRate: reconPassRate ? `${reconPassRate}%` : "N/A",
      },
    };

    return Response.json({ report });
  } catch (err) {
    console.error("[compliance/report] Unexpected error:", err.message);
    return Response.json(
      { error: `Report generation failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
