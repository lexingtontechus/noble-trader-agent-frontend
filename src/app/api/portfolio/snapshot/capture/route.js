/**
 * /api/portfolio/snapshot/capture — Batch Capture Portfolio Snapshot
 *
 * POST — Fetches Alpaca data + SPY benchmark and creates/updates today's snapshot.
 * Supports CRON bypass (allowCron: true) for automated daily captures.
 *
 * This is the endpoint called by pg_cron at market close (8 PM UTC / 4 PM ET).
 * It can also be triggered manually from the HistoricalEquityCurve component.
 */

import { withAuth } from "@/lib/withAuth";
import { createClient } from "@supabase/supabase-js";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { getAccount, getPositions } from "@/lib/alpaca-client";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";

// ── Supabase service client (bypasses RLS) ──────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role credentials not configured");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get SPY closing price for today as benchmark.
 * Falls back to null if Yahoo Finance is unavailable.
 */
async function getSpyBenchmark() {
  try {
    const data = await fetchHistoricalPrices("SPY", "6mo");
    if (data.prices && data.prices.length > 0 && data.dates && data.dates.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      // Find today's or most recent price
      let lastPrice = data.prices[data.prices.length - 1];
      let lastDate = data.dates[data.dates.length - 1];

      // If the most recent date is today, use it
      // Otherwise use the most recent available date
      return {
        price: lastPrice,
        date: lastDate,
      };
    }
  } catch (err) {
    console.warn("[portfolio-snapshot-capture] SPY benchmark fetch failed:", err.message);
  }
  return null;
}

/**
 * Ensure the portfolio_snapshots table exists.
 */
async function ensureTable(client) {
  const { error: selectError } = await client
    .from("portfolio_snapshots")
    .select("id")
    .limit(1);
  if (selectError && selectError.code === "42P01") {
    console.warn(
      "[portfolio-snapshot-capture] Table does not exist. " +
      "Please run migration 00000000000019_portfolio_snapshot.sql"
    );
    throw new Error(
      "Portfolio snapshots table not found. Please run the database migration."
    );
  }
}

/**
 * Capture snapshot for a specific user.
 * Shared logic for both authenticated and cron requests.
 */
async function captureForUser(client, userId, mode = "paper") {
  // Resolve credentials — for cron, we need to fetch from Supabase directly
  let keys;
  if (mode === "cron") {
    // Cron: find all users with credentials and capture for each
    // But for a single-user capture, use the standard flow
    keys = null;
  } else {
    keys = await getAlpacaCredentialKeys(mode);
  }

  if (!keys?.apiKey || !keys?.secretKey) {
    return { success: false, error: "NO_KEYS" };
  }

  try {
    // Fetch Alpaca data
    const [account, positions, benchmark] = await Promise.all([
      getAccount(keys.apiKey, keys.secretKey, mode).catch((e) => {
        console.warn(`[snapshot-capture] Account fetch failed for ${userId}:`, e.message);
        return null;
      }),
      getPositions(keys.apiKey, keys.secretKey, mode).catch((e) => {
        console.warn(`[snapshot-capture] Positions fetch failed for ${userId}:`, e.message);
        return [];
      }),
      getSpyBenchmark(),
    ]);

    if (!account) {
      return { success: false, error: "ALPACA_FETCH_FAILED" };
    }

    const today = new Date().toISOString().split("T")[0];
    const equity = parseFloat(account.equity) || 0;
    const cash = parseFloat(account.cash) || 0;
    const unrealizedPnl = (Array.isArray(positions) ? positions : []).reduce(
      (sum, p) => sum + (parseFloat(p.unrealized_pl) || 0), 0
    );
    const dayPnl = (parseFloat(account.equity) - parseFloat(account.last_equity)) || 0;

    const snapshot = {
      user_id: userId,
      snapshot_date: today,
      equity,
      cash,
      positions: (Array.isArray(positions) ? positions : []).map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        side: p.side,
        avg_entry_price: p.avg_entry_price,
        current_price: p.current_price,
        market_value: p.market_value,
        unrealized_pl: p.unrealized_pl,
        unrealized_plpc: p.unrealized_plpc,
      })),
      day_pnl: dayPnl,
      unrealized_pnl: unrealizedPnl,
      realized_pnl: null,
      total_value: equity,
      benchmark_value: benchmark?.price || null,
      metadata: {
        mode,
        account_status: account.status,
        buying_power: account.buying_power,
        long_market_value: account.long_market_value,
        short_market_value: account.short_market_value,
        benchmark_date: benchmark?.date || null,
        benchmark_symbol: benchmark ? "SPY" : null,
      },
    };

    // Upsert snapshot
    const { data, error } = await client
      .from("portfolio_snapshots")
      .upsert(snapshot, {
        onConflict: "user_id,snapshot_date",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error(`[snapshot-capture] Upsert failed for ${userId}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true, snapshot: data };
  } catch (err) {
    console.error(`[snapshot-capture] Capture failed for ${userId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── POST: Capture snapshot ──────────────────────────────────────────────────

export const POST = withAuth(async (request, _context, { userId, isCron }) => {
  try {
    const client = getServiceClient();
    await ensureTable(client);

    if (isCron) {
      // ── CRON mode: capture for all users with configured credentials ──
      // Find all distinct users who have snapshots or credentials
      const { data: existingUsers, error: usersError } = await client
        .from("portfolio_snapshots")
        .select("user_id")
        .limit(500);

      if (usersError) {
        console.error("[snapshot-capture] Cron: failed to find users:", usersError.message);
        return Response.json(
          { error: "Failed to enumerate users", detail: usersError.message },
          { status: 500 }
        );
      }

      // Deduplicate user IDs
      const userIds = [...new Set((existingUsers || []).map((r) => r.user_id))];

      if (userIds.length === 0) {
        return Response.json({
          message: "No users with portfolio snapshots found. Nothing to capture.",
          results: [],
          total: 0,
          succeeded: 0,
          failed: 0,
        });
      }

      // Capture for each user
      const results = [];
      for (const uid of userIds) {
        // For cron, default to paper mode
        const result = await captureForUser(client, uid, "paper");
        results.push({ user_id: uid, ...result });
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return Response.json({
        message: `Cron capture complete: ${succeeded} succeeded, ${failed} failed`,
        results,
        total: results.length,
        succeeded,
        failed,
      });
    }

    // ── Authenticated user mode: capture for current user ──
    const credentialType = await resolveCredentialType(request);
    const result = await captureForUser(client, userId, credentialType);

    if (!result.success) {
      if (result.error === "NO_KEYS") {
        return Response.json(
          {
            error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
            code: "NO_KEYS",
          },
          { status: 403 }
        );
      }
      return Response.json(
        { error: "Capture failed", detail: result.error },
        { status: 500 }
      );
    }

    return Response.json({ snapshot: result.snapshot, captured: true });
  } catch (err) {
    console.error("[snapshot-capture] POST error:", err.message);
    return Response.json(
      { error: err.message },
      { status: err.message.includes("not found") ? 503 : 500 }
    );
  }
}, { minRole: "trader", allowCron: true });
