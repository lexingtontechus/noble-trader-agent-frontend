/**
 * GET /api/operational/rate-limit-violations
 *
 * Returns rate limit violation data for the admin dashboard.
 * Supports filtering by tier, identifier type, and time range.
 *
 * Query params:
 *   hours: 1, 6, 24, 72, 168 (default: 24)
 *   tier: filter by tier (trade, data, etc.)
 *   identifierType: filter by 'user' or 'ip'
 */

import { withAuth } from "@/lib/withAuth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

export const GET = withAuth(async (request, context, authContext) => {
  const client = getClient();
  if (!client) {
    return Response.json(
      { error: "Database not configured", violations: [], stats: {} },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const hours = Math.min(parseInt(searchParams.get("hours") || "24"), 168);
  const tier = searchParams.get("tier");
  const identifierType = searchParams.get("identifierType");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    // Build query
    let query = client
      .from("rate_limit_violations")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (tier) query = query.eq("tier", tier);
    if (identifierType) query = query.eq("identifier_type", identifierType);

    const { data: violations, error } = await query;

    if (error) {
      console.error("[rate-limit-violations] Query error:", error.message);
      return Response.json(
        { error: error.message, violations: [], stats: {} },
        { status: 500 }
      );
    }

    // Compute stats
    const totalViolations = violations.length;
    const violationsByTier = {};
    const abuserMap = {};

    for (const v of violations) {
      // Count by tier
      violationsByTier[v.tier] = (violationsByTier[v.tier] || 0) + 1;

      // Count by identifier
      if (!abuserMap[v.identifier]) {
        abuserMap[v.identifier] = {
          identifier: v.identifier,
          identifier_type: v.identifier_type,
          count: 0,
          top_tier: v.tier,
          plan: v.plan,
        };
      }
      abuserMap[v.identifier].count++;
    }

    const topAbusers = Object.values(abuserMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Violations by hour
    const hourMap = {};
    for (const v of violations) {
      const hour = new Date(v.created_at).toISOString().substring(0, 13);
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
    const violationsByHour = Object.entries(hourMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));

    return Response.json({
      violations,
      stats: {
        totalViolations,
        topAbusers,
        violationsByTier,
        violationsByHour,
      },
    });
  } catch (err) {
    console.error("[rate-limit-violations] Error:", err.message);
    return Response.json(
      { error: err.message, violations: [], stats: {} },
      { status: 500 }
    );
  }
}, { minRole: "admin", rateTier: "admin" });
