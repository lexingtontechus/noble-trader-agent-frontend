/**
 * /api/portfolio/snapshot — Historical Portfolio Snapshots
 *
 * GET  — Retrieve historical snapshots from portfolio_snapshots table
 * POST — Capture a new snapshot from Alpaca and upsert into the table
 *
 * Uses withAuth() for authentication and RBAC.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 */

import { withAuth } from "@/lib/withAuth";
import { createClient } from "@supabase/supabase-js";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { getAccount, getPositions } from "@/lib/alpaca-client";

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
 * Ensure the portfolio_snapshots table exists.
 * Gracefully creates the table if missing (first-time use on existing DB).
 */
async function ensureTable(client) {
  const { error } = await client.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id TEXT NOT NULL,
        snapshot_date DATE NOT NULL,
        equity DECIMAL(15,2),
        cash DECIMAL(15,2),
        positions JSONB DEFAULT '[]',
        day_pnl DECIMAL(12,2),
        unrealized_pnl DECIMAL(12,2),
        realized_pnl DECIMAL(12,2),
        total_value DECIMAL(15,2),
        benchmark_value DECIMAL(15,2),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, snapshot_date)
      );
    `,
  });

  // exec_sql RPC may not exist — that's OK, the migration should have created the table
  if (error) {
    // Check if table already exists by trying to select from it
    const { error: selectError } = await client
      .from("portfolio_snapshots")
      .select("id")
      .limit(1);
    if (selectError && selectError.code === "42P01") {
      // Table truly doesn't exist and we can't create it via RPC
      console.warn(
        "[portfolio-snapshot] Table does not exist and exec_sql RPC unavailable. " +
        "Please run migration 00000000000019_portfolio_snapshot.sql"
      );
      throw new Error(
        "Portfolio snapshots table not found. Please run the database migration."
      );
    }
    // Table exists, continue
  }
}

// ── GET: Retrieve historical snapshots ──────────────────────────────────────

export const GET = withAuth(async (request, _context, authContext) => {
  try {
    const client = getServiceClient();
    await ensureTable(client);

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const limit = parseInt(searchParams.get("limit") || "365", 10);

    // Build query
    let query = client
      .from("portfolio_snapshots")
      .select("*")
      .eq("user_id", authContext.userId)
      .order("snapshot_date", { ascending: true })
      .limit(Math.min(limit, 1000));

    if (dateFrom) {
      query = query.gte("snapshot_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("snapshot_date", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[portfolio-snapshot] GET error:", error.message);
      return Response.json(
        { error: "Failed to fetch snapshots", detail: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      snapshots: data || [],
      count: data?.length || 0,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (err) {
    console.error("[portfolio-snapshot] GET error:", err.message);
    return Response.json(
      { error: err.message },
      { status: err.message.includes("not found") ? 503 : 500 }
    );
  }
}, { minRole: "viewer" });

// ── POST: Capture a new snapshot from Alpaca ────────────────────────────────

export const POST = withAuth(async (request, _context, authContext) => {
  try {
    const client = getServiceClient();
    await ensureTable(client);

    // Resolve Alpaca credentials
    const credentialType = await resolveCredentialType(request, authContext);
    const keys = await getAlpacaCredentialKeys(credentialType, request, authContext);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    // Fetch current account and positions from Alpaca
    const [account, positions] = await Promise.all([
      getAccount(keys.apiKey, keys.secretKey, credentialType),
      getPositions(keys.apiKey, keys.secretKey, credentialType),
    ]);

    const today = new Date().toISOString().split("T")[0];

    // Compute P&L values
    const equity = parseFloat(account.equity) || 0;
    const cash = parseFloat(account.cash) || 0;
    const unrealizedPnl = positions.reduce(
      (sum, p) => sum + (parseFloat(p.unrealized_pl) || 0), 0
    );
    const dayPnl = parseFloat(account.equity) - parseFloat(account.last_equity) || 0;

    // Build snapshot row
    const snapshot = {
      user_id: authContext.userId,
      snapshot_date: today,
      equity,
      cash,
      positions: positions.map((p) => ({
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
      realized_pnl: null, // Not directly available from account endpoint
      total_value: equity,
      benchmark_value: null, // Filled in by /capture route
      metadata: {
        mode: credentialType,
        account_status: account.status,
        buying_power: account.buying_power,
        long_market_value: account.long_market_value,
        short_market_value: account.short_market_value,
      },
    };

    // Upsert (ON CONFLICT user_id, snapshot_date DO UPDATE)
    const { data, error } = await client
      .from("portfolio_snapshots")
      .upsert(snapshot, {
        onConflict: "user_id,snapshot_date",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[portfolio-snapshot] POST upsert error:", error.message);
      return Response.json(
        { error: "Failed to save snapshot", detail: error.message },
        { status: 500 }
      );
    }

    return Response.json({ snapshot: data, captured: true });
  } catch (err) {
    console.error("[portfolio-snapshot] POST error:", err.message);
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
