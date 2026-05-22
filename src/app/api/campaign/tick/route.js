/**
 * API Route: /api/campaign/tick
 *
 * Campaign orchestrator tick — called by pg_cron every 60s during market hours.
 * Also callable manually for testing.
 *
 * Processes all running campaigns:
 *   1. Checks if current trade has closed (SL/TP hit)
 *   2. Updates campaign stats (wins, losses, consecutive losses, P&L)
 *   3. Enforces stop conditions (loss streak, max drawdown)
 *   4. Places next trade if campaign should continue
 *
 * Auth: CRON_SECRET via Authorization header (same as other cron routes)
 */

import { tickCampaigns, feedCampaignResults } from "@/lib/campaign-engine";
import { createApiError, sanitizeError } from "@/lib/error-messages";
import { withAuth } from "@/lib/withAuth";

const CRON_SECRET = process.env.CRON_SECRET;

export const POST = withAuth(async (request, context, authContext) => {
  try {
    // Verify cron auth — supports both Bearer token and x-cron-secret header
    const authHeader = request.headers.get("Authorization");
    const cronHeader = request.headers.get("x-cron-secret");
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get("secret");

    const isCron = CRON_SECRET && (
      (authHeader && authHeader === `Bearer ${CRON_SECRET}`) ||
      cronHeader === CRON_SECRET ||
      querySecret === CRON_SECRET
    );

    // In production with CRON_SECRET set, require authentication
    if (CRON_SECRET && process.env.NODE_ENV === "production" && !isCron) {
      return Response.json({ error: "Unauthorized — invalid or missing cron secret", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const result = await tickCampaigns(isCron ? CRON_SECRET : null);

    // After ticking, check for completed/stopped campaigns and feed results
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      // Find campaigns that just completed/stopped (within last 2 minutes)
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: finishedCampaigns } = await client
        .from("trade_campaign")
        .select("id, status")
        .in("status", ["completed", "stopped_loss_streak", "stopped_max_drawdown"])
        .gte("completed_at", twoMinAgo);

      // Feed results for newly completed campaigns
      if (finishedCampaigns?.length) {
        for (const c of finishedCampaigns) {
          await feedCampaignResults(c.id).catch(err =>
            console.error(`[campaign/tick] Failed to feed results for ${c.id}:`, err.message)
          );
        }
      }
    } catch (err) {
      console.error("[campaign/tick] Error in post-tick results feed:", err.message);
    }

    return Response.json(result);
  } catch (error) {
    console.error("[campaign/tick] Fatal error:", error);
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}, { minRole: "trader" });
