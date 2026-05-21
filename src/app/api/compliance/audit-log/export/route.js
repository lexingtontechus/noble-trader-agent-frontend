/**
 * GET /api/compliance/audit-log/export
 *
 * Exports audit log as CSV with proper Content-Disposition header.
 * Same filters as the main audit-log route.
 * Requires trader+ role (stricter than the main route).
 *
 * CSV Headers: Event Type, Symbol, Direction, Quantity, Price, Order ID,
 *              Regime, Strategy, Signal Score, Risk Metrics, Timestamp
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

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const GET = withAuth(async (request, context, authContext) => {
  const { searchParams } = new URL(request.url);

  const eventType = searchParams.get("event_type") || "";
  const symbol = searchParams.get("symbol") || "";
  const dateFrom = searchParams.get("date_from") || "";
  const dateTo = searchParams.get("date_to") || "";
  const userId = searchParams.get("user_id") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "5000", 10), 10000);

  const client = getServiceClient();
  if (!client) {
    // Return a minimal CSV with an error note
    const csv = "Event Type,Symbol,Direction,Quantity,Price,Order ID,Regime,Strategy,Signal Score,Risk Metrics,Timestamp\n" +
      '"SERVICE_ROLE_KEY_NOT_CONFIGURED","","","","","","","","","",""\n';
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=audit_log_export.csv",
      },
    });
  }

  try {
    let query = client.from("trade_audit_log").select("*");

    if (eventType) query = query.eq("event_type", eventType);
    if (symbol) query = query.eq("symbol", symbol.toUpperCase());
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");
    if (userId) query = query.eq("user_id", userId);

    query = query.order("created_at", { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("[compliance/audit-log/export] Supabase error:", error.message);
      const csv = "Event Type,Symbol,Direction,Quantity,Price,Order ID,Regime,Strategy,Signal Score,Risk Metrics,Timestamp\n" +
        `"QUERY_ERROR: ${escapeCsv(error.message)}","","","","","","","","","",""\n`;
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=audit_log_export.csv",
        },
      });
    }

    const rows = data || [];

    // Build CSV
    const headers = [
      "Event Type",
      "Symbol",
      "Direction",
      "Quantity",
      "Price",
      "Order ID",
      "Regime",
      "Strategy",
      "Signal Score",
      "Risk Metrics",
      "Timestamp",
    ];

    const csvLines = [headers.join(",")];

    for (const row of rows) {
      csvLines.push([
        escapeCsv(row.event_type),
        escapeCsv(row.symbol),
        escapeCsv(row.direction),
        escapeCsv(row.quantity),
        escapeCsv(row.price),
        escapeCsv(row.order_id),
        escapeCsv(row.regime),
        escapeCsv(row.strategy),
        escapeCsv(row.signal_score),
        escapeCsv(row.risk_metrics ? JSON.stringify(row.risk_metrics) : ""),
        escapeCsv(row.created_at),
      ].join(","));
    }

    const csv = csvLines.join("\n");
    const filename = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[compliance/audit-log/export] Unexpected error:", err.message);
    return Response.json(
      { error: `Audit log export failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
