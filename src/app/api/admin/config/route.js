/**
 * Direct Supabase Config API — primary admin configuration endpoint.
 *
 * Routes:
 *   GET    /api/admin/config              → List all config entries grouped by category
 *   GET    /api/admin/config?category=X   → Get entries for one category
 *   PATCH  /api/admin/config              → Update a config value (body: {key, value, reason})
 *   POST   /api/admin/config              → Reset to default or force reload
 *                                       body: {action: "reset", key} or {action: "reload"}
 *
 * Auth:
 *   GET  → viewer+
 *   PATCH/POST → admin+
 *
 * Talks directly to Supabase via service role key (bypasses RLS).
 */

import { withAuth } from "@/lib/withAuth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a JSONB value from Supabase into the correct JS type */
function parseValue(raw, valueType) {
  if (raw === null || raw === undefined) return raw;
  // Supabase JSONB values come back as already-parsed JS values
  // but we want to ensure proper typing
  if (valueType === "float") return typeof raw === "number" ? raw : parseFloat(raw);
  if (valueType === "int") return typeof raw === "number" ? Math.round(raw) : parseInt(raw, 10);
  if (valueType === "bool") return typeof raw === "boolean" ? raw : raw === "true";
  if (valueType === "json") return typeof raw === "string" ? JSON.parse(raw) : raw;
  // str
  return String(raw);
}

/** Validate a new value against an existing entry's constraints */
function validateValue(newValue, entry) {
  const { value_type, min_value, max_value, allowed_values } = entry;

  // Type check
  if (value_type === "float" || value_type === "int") {
    if (typeof newValue !== "number" || isNaN(newValue)) {
      return `Value must be a number, got ${typeof newValue}`;
    }
  } else if (value_type === "bool") {
    if (typeof newValue !== "boolean") {
      return `Value must be boolean, got ${typeof newValue}`;
    }
  }

  // Range check
  if (min_value != null && typeof newValue === "number" && newValue < Number(min_value)) {
    return `Value ${newValue} is below minimum ${min_value}`;
  }
  if (max_value != null && typeof newValue === "number" && newValue > Number(max_value)) {
    return `Value ${newValue} exceeds maximum ${max_value}`;
  }

  // Allowed values check
  if (allowed_values && Array.isArray(allowed_values)) {
    const allowed = allowed_values.map((v) => String(v));
    if (!allowed.includes(String(newValue))) {
      return `Value "${newValue}" not in allowed values: [${allowed.join(", ")}]`;
    }
  }

  return null; // valid
}

/** Format a single config row from Supabase into the expected API shape */
function formatEntry(row) {
  return {
    key: row.key,
    value: parseValue(row.value, row.value_type),
    value_type: row.value_type,
    category: row.category,
    description: row.description,
    default_value: row.default_value != null ? parseValue(row.default_value, row.value_type) : null,
    env_var: row.env_var,
    min_value: row.min_value != null ? parseValue(row.min_value, row.value_type === "int" ? "int" : "float") : null,
    max_value: row.max_value != null ? parseValue(row.max_value, row.value_type === "int" ? "int" : "float") : null,
    allowed_values: row.allowed_values,
    is_sensitive: row.is_sensitive,
    requires_restart: row.requires_restart,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

// ── GET: List config entries ─────────────────────────────────────────────────

export const GET = withAuth(async (request, _context, authCtx) => {
  try {
    const supabase = getServiceRoleClient();
    const url = new URL(request.url);
    const category = url.searchParams.get("category");

    let query = supabase
      .from("system_config")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("[admin/config GET] Supabase error:", error.message);
      return Response.json({ detail: `DB error: ${error.message}` }, { status: 500 });
    }

    // Group by category
    const categories = {};
    let totalEntries = 0;

    for (const row of rows) {
      const cat = row.category || "general";
      if (!categories[cat]) {
        categories[cat] = { category: cat, entries: {}, count: 0 };
      }
      categories[cat].entries[row.key] = formatEntry(row);
      categories[cat].count++;
      totalEntries++;
    }

    return Response.json({ categories, total_entries: totalEntries, source: "direct_db" });
  } catch (err) {
    console.error("[admin/config GET]", err.message);
    return Response.json({ detail: err.message }, { status: 500 });
  }
}, { minRole: "viewer" });

// ── PATCH: Update a config value ─────────────────────────────────────────────

export const PATCH = withAuth(async (request, _context, authCtx) => {
  try {
    const body = await request.json();
    const { key, value, reason } = body;

    if (!key) {
      return Response.json({ detail: "Missing 'key' in request body" }, { status: 400 });
    }
    if (value === undefined || value === null) {
      return Response.json({ detail: "Missing 'value' in request body" }, { status: 400 });
    }

    const supabase = getServiceRoleClient();

    // 1. Read existing entry
    const { data: existing, error: fetchErr } = await supabase
      .from("system_config")
      .select("*")
      .eq("key", key)
      .single();

    if (fetchErr || !existing) {
      return Response.json({ detail: `Config key "${key}" not found` }, { status: 404 });
    }

    // 2. Validate
    const validationErr = validateValue(value, existing);
    if (validationErr) {
      return Response.json({ detail: validationErr }, { status: 400 });
    }

    // 3. Update the value
    const oldValue = existing.value;
    const updatedBy = authCtx.userId || "admin";

    const { data: updated, error: updateErr } = await supabase
      .from("system_config")
      .update({
        value: value,
        updated_by: updatedBy,
      })
      .eq("key", key)
      .select()
      .single();

    if (updateErr) {
      console.error("[admin/config PATCH] Update error:", updateErr.message);
      return Response.json({ detail: `Update failed: ${updateErr.message}` }, { status: 500 });
    }

    // 4. Insert audit entry
    const { error: auditErr } = await supabase
      .from("system_config_audit")
      .insert({
        key,
        old_value: oldValue,
        new_value: value,
        changed_by: updatedBy,
        reason: reason || null,
      });

    if (auditErr) {
      console.error("[admin/config PATCH] Audit write error:", auditErr.message);
      // Non-fatal — the update already succeeded
    }

    return Response.json({ entry: formatEntry(updated), source: "direct_db" });
  } catch (err) {
    console.error("[admin/config PATCH]", err.message);
    return Response.json({ detail: err.message }, { status: 500 });
  }
}, { minRole: "admin" });

// ── POST: Reset to default / Force reload ────────────────────────────────────

export const POST = withAuth(async (request, _context, authCtx) => {
  try {
    const body = await request.json();
    const { action, key } = body;

    const supabase = getServiceRoleClient();

    // ── Reset a key to default ──
    if (action === "reset" || (!action && key)) {
      if (!key) {
        return Response.json({ detail: "Missing 'key' for reset" }, { status: 400 });
      }

      // Read existing entry
      const { data: existing, error: fetchErr } = await supabase
        .from("system_config")
        .select("*")
        .eq("key", key)
        .single();

      if (fetchErr || !existing) {
        return Response.json({ detail: `Config key "${key}" not found` }, { status: 404 });
      }

      if (existing.default_value == null) {
        return Response.json({ detail: `Key "${key}" has no default value` }, { status: 400 });
      }

      const oldValue = existing.value;
      const updatedBy = authCtx.userId || "admin";

      // Reset to default
      const { data: updated, error: updateErr } = await supabase
        .from("system_config")
        .update({
          value: existing.default_value,
          updated_by: updatedBy,
        })
        .eq("key", key)
        .select()
        .single();

      if (updateErr) {
        console.error("[admin/config POST reset] Update error:", updateErr.message);
        return Response.json({ detail: `Reset failed: ${updateErr.message}` }, { status: 500 });
      }

      // Audit entry
      await supabase.from("system_config_audit").insert({
        key,
        old_value: oldValue,
        new_value: existing.default_value,
        changed_by: updatedBy,
        reason: "Reset to default",
      });

      return Response.json({ entry: formatEntry(updated), source: "direct_db" });
    }

    // ── Force reload (no-op for direct DB — just return count) ──
    if (action === "reload") {
      const { count, error: countErr } = await supabase
        .from("system_config")
        .select("*", { count: "exact", head: true });

      if (countErr) {
        return Response.json({ detail: `Count failed: ${countErr.message}` }, { status: 500 });
      }

      return Response.json({
        message: "Direct DB mode — no cache to reload",
        total_entries: count || 0,
        source: "direct_db",
      });
    }

    return Response.json({ detail: "Unknown action. Use 'reset' or 'reload'" }, { status: 400 });
  } catch (err) {
    console.error("[admin/config POST]", err.message);
    return Response.json({ detail: err.message }, { status: 500 });
  }
}, { minRole: "admin" });
