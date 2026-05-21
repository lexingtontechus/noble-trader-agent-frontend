/**
 * GET /api/compliance/audit-log
 *
 * Queries the trade_audit_log Supabase table directly (NOT via FastAPI proxy).
 * Supports filtering by event_type, symbol, date_from, date_to, user_id.
 * Returns paginated results with total count.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for compliance reads.
 * If the table doesn't exist (graceful degradation), returns empty array with a note.
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

  // Parse query params
  const eventType = searchParams.get("event_type") || "";
  const symbol = searchParams.get("symbol") || "";
  const dateFrom = searchParams.get("date_from") || "";
  const dateTo = searchParams.get("date_to") || "";
  const userId = searchParams.get("user_id") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 1000);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const client = getServiceClient();
  if (!client) {
    return Response.json({
      events: [],
      total: 0,
      note: "Supabase service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY env var for direct audit log access.",
    });
  }

  try {
    // Build the query with filters
    let query = client
      .from("trade_audit_log")
      .select("*", { count: "exact" });

    if (eventType) {
      query = query.eq("event_type", eventType);
    }
    if (symbol) {
      query = query.eq("symbol", symbol.toUpperCase());
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo + "T23:59:59.999Z");
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    // Order by newest first
    query = query.order("created_at", { ascending: false });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      // Graceful degradation: if the table doesn't exist, return empty with note
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return Response.json({
          events: [],
          total: 0,
          note: "The trade_audit_log table does not exist yet. Run the Supabase migration (00000000000014) to create it.",
        });
      }
      console.error("[compliance/audit-log] Supabase error:", error.message);
      return Response.json(
        { error: `Database query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return Response.json({
      events: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[compliance/audit-log] Unexpected error:", err.message);
    return Response.json(
      { error: `Audit log query failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
