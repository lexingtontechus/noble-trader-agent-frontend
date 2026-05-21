/**
 * /api/compliance/journal
 *
 * CRUD for trade journal entries (notes/tags on trades).
 * Uses the ta_trade_recommendation table with a journal_notes JSONB column.
 *
 * GET  — List journal entries for user's trades
 * POST — Add/update journal note for a trade recommendation
 *
 * The journal_notes column is added via ALTER TABLE IF NOT EXISTS on first access.
 * Requires trader+ role.
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

/** Ensure the journalNotes column exists on ta_trade_recommendation */
async function ensureJournalColumn(client) {
  try {
    // Check if column exists
    const { data, error } = await client.rpc("exec_sql", {
      query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ta_trade_recommendation' AND column_name = 'journalNotes'`,
    });
    // If the RPC doesn't exist, fall through to the alter approach
    if (error) {
      // Try a direct ALTER TABLE — this is safe due to IF NOT EXISTS equivalent
      // Supabase doesn't support ALTER TABLE ... ADD COLUMN IF NOT EXISTS directly,
      // so we try and catch the "already exists" error
      const { error: alterError } = await client.rpc("exec_sql", {
        query: `ALTER TABLE ta_trade_recommendation ADD COLUMN "journalNotes" JSONB DEFAULT '{}'`,
      });
      // Error code 42701 = duplicate_column, which is fine
      if (alterError && !alterError.message?.includes("already exists") && alterError.code !== "42701") {
        console.warn("[compliance/journal] Could not add journalNotes column:", alterError.message);
      }
    }
  } catch {
    // Column might already exist, that's fine
  }
}

export const GET = withAuth(async (request, context, authContext) => {
  const { userId } = authContext;
  const { searchParams } = new URL(request.url);

  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
  const symbol = searchParams.get("symbol") || "";

  const client = getServiceClient();
  if (!client) {
    return Response.json({
      entries: [],
      total: 0,
      note: "Supabase service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY env var.",
    });
  }

  try {
    // Try to ensure the column exists (best-effort)
    await ensureJournalColumn(client);

    // Build query for trade recommendations that have journal notes
    let query = client
      .from("ta_trade_recommendation")
      .select('id, symbol, side, "orderType", qty, status, regime, "strategySignal", "createdAt", "journalNotes"', { count: "exact" });

    if (symbol) {
      query = query.eq("symbol", symbol.toUpperCase());
    }

    query = query.order('"createdAt"', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      // If column doesn't exist yet, return empty
      if (error.message?.includes("journalNotes") || error.message?.includes("does not exist")) {
        return Response.json({
          entries: [],
          total: 0,
          note: "The journalNotes column has not been added yet. Add a journal entry to create it automatically.",
        });
      }
      console.error("[compliance/journal] Supabase error:", error.message);
      return Response.json(
        { error: `Journal query failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Filter to only those with journal notes
    const entries = (data || []).filter(
      (row) => row.journalNotes && Object.keys(row.journalNotes).length > 0
    );

    return Response.json({
      entries: entries.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        orderType: row.orderType,
        qty: row.qty,
        status: row.status,
        regime: row.regime,
        strategySignal: row.strategySignal,
        createdAt: row.createdAt,
        journalNotes: row.journalNotes || {},
      })),
      total: count || 0,
    });
  } catch (err) {
    console.error("[compliance/journal] Unexpected error:", err.message);
    return Response.json(
      { error: `Journal fetch failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

export const POST = withAuth(async (request, context, authContext) => {
  const { userId } = authContext;

  const client = getServiceClient();
  if (!client) {
    return Response.json(
      { error: "Supabase service role key not configured." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { recommendationId, notes, tags } = body;

    if (!recommendationId) {
      return Response.json(
        { error: "recommendationId is required" },
        { status: 400 }
      );
    }

    // Build journal notes object
    const journalNotes = {
      notes: notes || "",
      tags: Array.isArray(tags) ? tags : [],
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };

    // Try to add the column first (best-effort, may already exist)
    await ensureJournalColumn(client);

    // Update the trade recommendation with journal notes
    const { data, error } = await client
      .from("ta_trade_recommendation")
      .update({ journalNotes })
      .eq("id", recommendationId)
      .select()
      .single();

    if (error) {
      console.error("[compliance/journal] Update error:", error.message);
      return Response.json(
        { error: `Failed to save journal entry: ${error.message}` },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      entry: {
        id: data.id,
        symbol: data.symbol,
        journalNotes: data.journalNotes,
      },
    });
  } catch (err) {
    console.error("[compliance/journal] POST error:", err.message);
    return Response.json(
      { error: `Journal save failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
