/**
 * Supabase database helper — replaces Prisma Client for Vercel serverless.
 *
 * The tables use camelCase column names (matching Prisma's convention),
 * so we wrap Supabase queries to provide a Prisma-like API surface.
 * This allows incremental migration without rewriting every route.
 *
 * Key design decisions:
 *  - Uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (publishable key)
 *  - RLS policies on the tables allow full access, so the publishable key works
 *  - Returns data in the same shape as Prisma where possible
 *  - Supports the subset of Prisma operations used in the codebase:
 *    findFirst, findUnique, findMany, create, update, updateMany, count
 *  - Handles Prisma-specific data ops like { increment: N }
 *
 * ENV VARS REQUIRED:
 *  NEXT_PUBLIC_SUPABASE_URL — e.g. https://xxx.supabase.co
 *  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY — publishable/anon key
 */

import { createClient } from "@supabase/supabase-js";

// ── Singleton Supabase client (using publishable key, RLS policies allow access) ──
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

let _supabaseClient = null;

function getAdminClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL env var. " +
      "Add it in Vercel project settings → Environment Variables."
    );
  }
  if (!SUPABASE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY env var. " +
      "Add it in Vercel project settings → Environment Variables."
    );
  }
  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabaseClient;
}

// ── Table name mapping (Prisma model → Supabase table) ────────────────────────
const TABLE_MAP = {
  analysisRun: "ta_analysis_run",
  tradeRecommendation: "ta_trade_recommendation",
  scheduledOrder: "ta_scheduled_order",
  telegramNotification: "ta_telegram_notification",
  tdaScanResult: "ta_tda_scan_result",
  earlyWarningAlert: "ta_early_warning_alert",
  // Phase 5: Strategy Evolution tables
  strategyVariant: "ta_strategy_variant",
  strategyPerformance: "ta_strategy_performance",
  abTest: "ta_ab_test",
  evolutionLog: "ta_evolution_log",
  // Phase 6: Renko HFT Pipeline
  renkoSnapshot: "ta_renko_snapshot",
};

function tableName(model) {
  const name = TABLE_MAP[model];
  if (!name) throw new Error(`Unknown Prisma model: ${model}`);
  return name;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert Prisma-style orderBy to Supabase order string/direction */
function parseOrderBy(orderBy) {
  if (!orderBy) return { column: "createdAt", ascending: false };
  if (typeof orderBy === "string") return { column: orderBy, ascending: true };
  // e.g. { createdAt: "desc" } or { priority: "asc" }
  const entries = Object.entries(orderBy);
  if (entries.length === 0) return { column: "createdAt", ascending: false };
  const [column, dir] = entries[0];
  return { column, ascending: dir === "asc" };
}

/** Build Supabase filter chain from Prisma-style `where` object */
function applyFilters(query, where) {
  if (!where) return query;
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query = query.eq(key, value);
    } else if (typeof value === "object" && value !== null) {
      // Handle Prisma operators — skip here (handled in update)
      if (value.increment !== undefined) continue;
    }
  }
  return query;
}

/**
 * Resolve Prisma data operations into plain values for Supabase.
 * Handles: { increment: N } → read current value + N
 * Other Prisma ops can be added as needed.
 */
async function resolveDataOps(client, table, where, data) {
  const resolved = {};
  const incrementOps = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && value.increment !== undefined) {
      incrementOps.push({ key, amount: value.increment });
    } else {
      resolved[key] = value;
    }
  }

  // If there are increment operations, read the current row first
  if (incrementOps.length > 0) {
    let query = client.from(table).select("*");
    if (where.id) {
      query = query.eq("id", where.id);
    } else {
      query = applyFilters(query, where);
    }
    query = query.limit(1);
    const { data: rows, error } = await query;
    if (error) throw new Error(`Supabase resolveDataOps(${table}): ${error.message}`);
    const current = rows?.[0];
    for (const { key, amount } of incrementOps) {
      resolved[key] = (current?.[key] || 0) + amount;
    }
  }

  return resolved;
}

// ── Model proxy — mimics Prisma model API ──────────────────────────────────────

function createModelProxy(model) {
  const table = tableName(model);

  return {
    /** Find first matching record, ordered by orderBy */
    async findFirst({ where, orderBy } = {}) {
      const client = getAdminClient();
      const order = parseOrderBy(orderBy);
      let query = client
        .from(table)
        .select("*")
        .order(order.column, { ascending: order.ascending })
        .limit(1);
      query = applyFilters(query, where);
      const { data, error } = await query;
      if (error) throw new Error(`Supabase findFirst(${table}): ${error.message}`);
      return data?.[0] || null;
    },

    /** Find a single record by its primary key */
    async findUnique({ where } = {}) {
      if (!where || !where.id) throw new Error("findUnique requires where: { id }");
      const client = getAdminClient();
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("id", where.id)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null; // not found
        throw new Error(`Supabase findUnique(${table}): ${error.message}`);
      }
      return data;
    },

    /** Find multiple records. Supports both Prisma `take` and Supabase `limit`. */
    async findMany({ where, orderBy, take, limit, offset } = {}) {
      const effectiveLimit = take || limit;
      const client = getAdminClient();
      const order = parseOrderBy(orderBy);
      let query = client
        .from(table)
        .select("*")
        .order(order.column, { ascending: order.ascending });
      query = applyFilters(query, where);
      if (effectiveLimit) query = query.limit(effectiveLimit);
      if (offset) query = query.range(offset, offset + (effectiveLimit || 1000) - 1);
      const { data, error } = await query;
      if (error) throw new Error(`Supabase findMany(${table}): ${error.message}`);
      return data || [];
    },

    /** Create a single record */
    async create({ data } = {}) {
      if (!data) throw new Error("create requires data");
      const client = getAdminClient();
      const { data: row, error } = await client
        .from(table)
        .insert(data)
        .select()
        .single();
      if (error) throw new Error(`Supabase create(${table}): ${error.message}`);
      return row;
    },

    /** Update a single record by id (supports Prisma increment) */
    async update({ where, data } = {}) {
      if (!where) throw new Error("update requires where");
      if (!data) throw new Error("update requires data");
      const client = getAdminClient();

      // Resolve Prisma data operations like { increment: N }
      const resolvedData = await resolveDataOps(client, table, where, data);

      let query = client.from(table).update(resolvedData);
      if (where.id) {
        query = query.eq("id", where.id);
      } else {
        query = applyFilters(query, where);
      }

      const { data: row, error } = await query.select().single();
      if (error) throw new Error(`Supabase update(${table}): ${error.message}`);
      return row;
    },

    /** Update multiple records */
    async updateMany({ where, data } = {}) {
      if (!where || !data) throw new Error("updateMany requires where and data");
      const client = getAdminClient();

      // Resolve Prisma data ops for each matching row
      const resolvedData = await resolveDataOps(client, table, where, data);

      let query = client.from(table).update(resolvedData);
      query = applyFilters(query, where);
      const { count, error } = await query;
      if (error) throw new Error(`Supabase updateMany(${table}): ${error.message}`);
      return { count: count || 0 };
    },

    /** Count records */
    async count({ where } = {}) {
      const client = getAdminClient();
      let query = client.from(table).select("*", { count: "exact", head: true });
      query = applyFilters(query, where);
      const { count, error } = await query;
      if (error) throw new Error(`Supabase count(${table}): ${error.message}`);
      return count || 0;
    },

    /** Delete a record by id */
    async delete({ where } = {}) {
      if (!where || !where.id) throw new Error("delete requires where: { id }");
      const client = getAdminClient();
      const { error } = await client.from(table).delete().eq("id", where.id);
      if (error) throw new Error(`Supabase delete(${table}): ${error.message}`);
      return true;
    },

    /**
     * Upsert a record — insert or update on conflict.
     * @param {Object} data - Row data to insert/update
     * @param {Object} options
     * @param {string|string[]} options.onConflict - Column(s) that define the conflict target
     * @returns {Object} The upserted row
     */
    async upsert({ data, onConflict } = {}) {
      if (!data) throw new Error("upsert requires data");
      if (!onConflict) throw new Error("upsert requires onConflict (column name(s) for conflict target)");
      const client = getAdminClient();
      const { data: row, error } = await client
        .from(table)
        .upsert(data, { onConflict, ignoreDuplicates: false })
        .select()
        .single();
      if (error) throw new Error(`Supabase upsert(${table}): ${error.message}`);
      return row;
    },
  };
}

// ── Export db object with same interface as Prisma ─────────────────────────────
export const db = {
  analysisRun: createModelProxy("analysisRun"),
  tradeRecommendation: createModelProxy("tradeRecommendation"),
  scheduledOrder: createModelProxy("scheduledOrder"),
  telegramNotification: createModelProxy("telegramNotification"),
  tdaScanResult: createModelProxy("tdaScanResult"),
  tDAScanResult: createModelProxy("tdaScanResult"), // Alias: Prisma generates tDAScanResult
  earlyWarningAlert: createModelProxy("earlyWarningAlert"),
  // Phase 5: Strategy Evolution
  strategyVariant: createModelProxy("strategyVariant"),
  strategyPerformance: createModelProxy("strategyPerformance"),
  abTest: createModelProxy("abTest"),
  evolutionLog: createModelProxy("evolutionLog"),
  // Phase 6: Renko HFT Pipeline
  renkoSnapshot: createModelProxy("renkoSnapshot"),
};

export default db;
