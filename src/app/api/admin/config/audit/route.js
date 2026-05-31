/**
 * Audit log endpoint for system_config changes.
 *
 *   GET /api/admin/config/audit?limit=50
 *
 * Returns recent audit entries from system_config_audit ordered by changed_at DESC.
 * Admin-only access.
 */

import { withAuth } from "@/lib/withAuth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const GET = withAuth(async (request, _context, _authCtx) => {
  try {
    const supabase = getServiceRoleClient();
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const key = url.searchParams.get("key"); // optional filter by key

    let query = supabase
      .from("system_config_audit")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (key) {
      query = query.eq("key", key);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("[admin/config/audit GET] Supabase error:", error.message);
      return Response.json({ detail: `DB error: ${error.message}` }, { status: 500 });
    }

    return Response.json(rows || [], { headers: { "X-Source": "direct_db" } });
  } catch (err) {
    console.error("[admin/config/audit GET]", err.message);
    return Response.json({ detail: err.message }, { status: 500 });
  }
}, { minRole: "admin" });
