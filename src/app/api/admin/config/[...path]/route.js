/**
 * Catch-all route for per-key config operations and reload.
 *
 * Routes handled:
 *   GET    /api/admin/config/reload            → Force cache refresh (returns count)
 *   PATCH  /api/admin/config/key/{key}         → Update a config value
 *   POST   /api/admin/config/key/{key}/reset   → Reset to default
 *   GET    /api/admin/config/key/{key}         → Get a single config entry
 *
 * Auth:
 *   GET    → viewer+
 *   PATCH/POST → admin+
 *
 * Uses Supabase service role key (bypasses RLS).
 */

import { withAuth } from "@/lib/withAuth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseValue(raw, valueType) {
  if (raw === null || raw === undefined) return raw;
  if (valueType === "float") return typeof raw === "number" ? raw : parseFloat(raw);
  if (valueType === "int") return typeof raw === "number" ? Math.round(raw) : parseInt(raw, 10);
  if (valueType === "bool") return typeof raw === "boolean" ? raw : raw === "true";
  if (valueType === "json") return typeof raw === "string" ? JSON.parse(raw) : raw;
  return String(raw);
}

function validateValue(newValue, entry) {
  const { value_type, min_value, max_value, allowed_values } = entry;
  if (value_type === "float" || value_type === "int") {
    if (typeof newValue !== "number" || isNaN(newValue)) {
      return `Value must be a number, got ${typeof newValue}`;
    }
  } else if (value_type === "bool") {
    if (typeof newValue !== "boolean") {
      return `Value must be boolean, got ${typeof newValue}`;
    }
  }
  if (min_value != null && typeof newValue === "number" && newValue < Number(min_value)) {
    return `Value ${newValue} is below minimum ${min_value}`;
  }
  if (max_value != null && typeof newValue === "number" && newValue > Number(max_value)) {
    return `Value ${newValue} exceeds maximum ${max_value}`;
  }
  if (allowed_values && Array.isArray(allowed_values)) {
    const allowed = allowed_values.map((v) => String(v));
    if (!allowed.includes(String(newValue))) {
      return `Value "${newValue}" not in allowed values: [${allowed.join(", ")}]`;
    }
  }
  return null;
}

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

// ── GET ──────────────────────────────────────────────────────────────────────

export const GET = withAuth(async (request, { params }, _authCtx) => {
  const pathSegments = (await params.path) || [];

  // /api/admin/config/reload
  if (pathSegments.length === 1 && pathSegments[0] === "reload") {
    try {
      const supabase = getServiceRoleClient();
      const { count, error } = await supabase
        .from("system_config")
        .select("*", { count: "exact", head: true });

      if (error) {
        return Response.json({ detail: `Count failed: ${error.message}` }, { status: 500 });
      }

      return Response.json({
        message: "Direct DB mode — no cache to reload",
        total_entries: count || 0,
        source: "direct_db",
      });
    } catch (err) {
      return Response.json({ detail: err.message }, { status: 500 });
    }
  }

  // /api/admin/config/key/{key}
  if (pathSegments.length === 2 && pathSegments[0] === "key") {
    const key = decodeURIComponent(pathSegments[1]);
    try {
      const supabase = getServiceRoleClient();
      const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("key", key)
        .single();

      if (error || !data) {
        return Response.json({ detail: `Config key "${key}" not found` }, { status: 404 });
      }

      return Response.json({ entry: formatEntry(data), source: "direct_db" });
    } catch (err) {
      return Response.json({ detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ detail: "Not found" }, { status: 404 });
}, { minRole: "viewer" });

// ── PATCH ────────────────────────────────────────────────────────────────────

export const PATCH = withAuth(async (request, { params }, authCtx) => {
  const pathSegments = (await params.path) || [];

  // /api/admin/config/key/{key}
  if (pathSegments.length === 2 && pathSegments[0] === "key") {
    const key = decodeURIComponent(pathSegments[1]);

    try {
      const body = await request.json();
      const { value, reason } = body;

      if (value === undefined || value === null) {
        return Response.json({ detail: "Missing 'value' in request body" }, { status: 400 });
      }

      const supabase = getServiceRoleClient();

      // Read existing entry
      const { data: existing, error: fetchErr } = await supabase
        .from("system_config")
        .select("*")
        .eq("key", key)
        .single();

      if (fetchErr || !existing) {
        return Response.json({ detail: `Config key "${key}" not found` }, { status: 404 });
      }

      // Validate
      const validationErr = validateValue(value, existing);
      if (validationErr) {
        return Response.json({ detail: validationErr }, { status: 400 });
      }

      // Update
      const oldValue = existing.value;
      const updatedBy = authCtx.userId || "admin";

      const { data: updated, error: updateErr } = await supabase
        .from("system_config")
        .update({ value, updated_by: updatedBy })
        .eq("key", key)
        .select()
        .single();

      if (updateErr) {
        return Response.json({ detail: `Update failed: ${updateErr.message}` }, { status: 500 });
      }

      // Audit
      await supabase.from("system_config_audit").insert({
        key,
        old_value: oldValue,
        new_value: value,
        changed_by: updatedBy,
        reason: reason || null,
      });

      return Response.json({ entry: formatEntry(updated), source: "direct_db" });
    } catch (err) {
      return Response.json({ detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ detail: "Not found" }, { status: 404 });
}, { minRole: "admin" });

// ── POST ─────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (request, { params }, authCtx) => {
  const pathSegments = (await params.path) || [];

  // /api/admin/config/key/{key}/reset
  if (pathSegments.length === 3 && pathSegments[0] === "key" && pathSegments[2] === "reset") {
    const key = decodeURIComponent(pathSegments[1]);

    try {
      const supabase = getServiceRoleClient();

      // Read existing
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
        .update({ value: existing.default_value, updated_by: updatedBy })
        .eq("key", key)
        .select()
        .single();

      if (updateErr) {
        return Response.json({ detail: `Reset failed: ${updateErr.message}` }, { status: 500 });
      }

      // Audit
      await supabase.from("system_config_audit").insert({
        key,
        old_value: oldValue,
        new_value: existing.default_value,
        changed_by: updatedBy,
        reason: "Reset to default",
      });

      return Response.json({ entry: formatEntry(updated), source: "direct_db" });
    } catch (err) {
      return Response.json({ detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ detail: "Not found" }, { status: 404 });
}, { minRole: "admin" });
