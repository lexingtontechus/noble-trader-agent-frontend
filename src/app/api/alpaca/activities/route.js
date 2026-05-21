import { getActivities } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { createApiError } from "@/lib/error-messages";

/**
 * GET /api/alpaca/activities
 *
 * Fetches trade activity history (fills, dividends, etc.) from Alpaca.
 * Uses encrypted keys from Supabase (with Clerk privateMetadata fallback).
 *
 * Query params:
 *   activity_types — comma-separated types (default: "FILL")
 *                    Options: FILL, DIV, CSD, CWD, INT, ASC, etc.
 *   after          — ISO date string (start of date range)
 *   until          — ISO date string (end of date range)
 *   direction      — "asc" | "desc" (default: "desc")
 *   page_size      — max items (default: 100, max: 1000)
 *   period         — shorthand: "1d", "1w", "1m", "3m", "1y" (default: "3m")
 */
export async function GET(request) {
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const activityTypes = searchParams.get("activity_types") || "FILL";
    const direction = searchParams.get("direction") || "desc";
    const pageSize = Math.min(parseInt(searchParams.get("page_size") || "100"), 1000);

    // Period shorthand → after date
    const period = searchParams.get("period") || "3m";
    const afterParam = searchParams.get("after");
    let after = afterParam;
    if (!afterParam) {
      const now = new Date();
      const afterDate = new Date();
      if (period === "1d") afterDate.setDate(now.getDate() - 1);
      else if (period === "1w") afterDate.setDate(now.getDate() - 7);
      else if (period === "1m") afterDate.setMonth(now.getMonth() - 1);
      else if (period === "3m") afterDate.setMonth(now.getMonth() - 3);
      else if (period === "6m") afterDate.setMonth(now.getMonth() - 6);
      else afterDate.setFullYear(now.getFullYear() - 1);
      after = afterDate.toISOString();
    }

    const until = searchParams.get("until") || null;

    const activities = await getActivities(keys.apiKey, keys.secretKey, {
      activity_types: activityTypes,
      after,
      until,
      direction,
      page_size: pageSize,
      mode: credentialType,
    });

    return Response.json(activities);
  } catch (error) {
    return createApiError(error, { context: "activities" });
  }
}
