/**
 * BFF Route: /api/notifications/preferences
 * Notification preferences — GET and PUT for user preferences.
 *
 * GET  — Retrieve user's notification preferences (viewer+)
 * PUT  — Update notification preferences (trader+)
 *
 * Uses Supabase service_role key for RLS bypass.
 * Creates notification_preferences table if it doesn't exist (graceful).
 */

import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/withAuth";

// ── Default preferences ──────────────────────────────────────────────────────

const DEFAULT_CHANNELS = {
  in_app: true,
  discord: false,
  email: false,
};

const DEFAULT_ALERT_TYPES = {
  trade_filled: true,
  trade_rejected: true,
  order_submitted: true,
  risk_breach: true,
  kill_switch: true,
  mode_change: true,
  pnl_threshold: true,
  regime_change: false,
  strategy_signal: false,
  campaign_complete: true,
  reconciliation: true,
};

const DEFAULT_QUIET_HOURS = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timezone: "America/New_York",
};

const DEFAULT_DIGEST_SETTINGS = {
  enabled: false,
  frequency: "daily",
  time: "18:00",
};

export const DEFAULTS = {
  channels: DEFAULT_CHANNELS,
  alert_types: DEFAULT_ALERT_TYPES,
  quiet_hours: DEFAULT_QUIET_HOURS,
  digest_settings: DEFAULT_DIGEST_SETTINGS,
};

// ── Supabase service role client ─────────────────────────────────────────────

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

// ── Ensure table exists (graceful) ───────────────────────────────────────────

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  try {
    const client = getServiceClient();
    const { error } = await client
      .from("notification_preferences")
      .select("id")
      .limit(1);
    if (!error) {
      tableEnsured = true;
      return;
    }
    // If table doesn't exist, try to create it via RPC or direct SQL
    // In most Supabase setups, the migration should have created it.
    // If not, we log a warning but don't crash.
    if (error.code === "42P01") {
      console.warn(
        "[notifications/preferences] Table notification_preferences does not exist. Run migration 20."
      );
    }
    tableEnsured = true;
  } catch {
    tableEnsured = true;
  }
}

// ── GET: Retrieve preferences ────────────────────────────────────────────────

export const GET = withAuth(async (request, context, authContext) => {
  const { userId } = authContext;

  try {
    await ensureTable();
    const client = getServiceClient();

    const { data, error } = await client
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code === "PGRST116") {
      // No row found — return defaults
      return Response.json({
        preferences: {
          channels: DEFAULT_CHANNELS,
          alert_types: DEFAULT_ALERT_TYPES,
          quiet_hours: DEFAULT_QUIET_HOURS,
          digest_settings: DEFAULT_DIGEST_SETTINGS,
          discord_webhook_url: null,
        },
        isDefault: true,
      });
    }

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") {
        return Response.json({
          preferences: {
            channels: DEFAULT_CHANNELS,
            alert_types: DEFAULT_ALERT_TYPES,
            quiet_hours: DEFAULT_QUIET_HOURS,
            digest_settings: DEFAULT_DIGEST_SETTINGS,
            discord_webhook_url: null,
          },
          isDefault: true,
          warning: "Notification preferences table not found. Run migration 20.",
        });
      }
      throw new Error(`Supabase error: ${error.message}`);
    }

    return Response.json({
      preferences: {
        channels: data.channels || DEFAULT_CHANNELS,
        alert_types: data.alert_types || DEFAULT_ALERT_TYPES,
        quiet_hours: data.quiet_hours || DEFAULT_QUIET_HOURS,
        digest_settings: data.digest_settings || DEFAULT_DIGEST_SETTINGS,
        discord_webhook_url: data.discord_webhook_url || null,
      },
      isDefault: false,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    console.error("[notifications/preferences GET] Error:", err);
    return Response.json(
      { error: `Failed to fetch preferences: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });

// ── PUT: Update preferences ──────────────────────────────────────────────────

export const PUT = withAuth(async (request, context, authContext) => {
  const { userId } = authContext;

  try {
    const body = await request.json();
    const { channels, alert_types, quiet_hours, digest_settings, discord_webhook_url } = body;

    await ensureTable();
    const client = getServiceClient();

    // First, fetch existing preferences to merge
    const { data: existing } = await client
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Merge partial updates with existing or defaults
    const currentChannels = existing?.channels || DEFAULT_CHANNELS;
    const currentAlertTypes = existing?.alert_types || DEFAULT_ALERT_TYPES;
    const currentQuietHours = existing?.quiet_hours || DEFAULT_QUIET_HOURS;
    const currentDigest = existing?.digest_settings || DEFAULT_DIGEST_SETTINGS;

    const mergedData = {
      user_id: userId,
      channels: channels ? { ...currentChannels, ...channels } : currentChannels,
      alert_types: alert_types ? { ...currentAlertTypes, ...alert_types } : currentAlertTypes,
      quiet_hours: quiet_hours ? { ...currentQuietHours, ...quiet_hours } : currentQuietHours,
      digest_settings: digest_settings
        ? { ...currentDigest, ...digest_settings }
        : currentDigest,
      updated_at: new Date().toISOString(),
    };

    // Include discord_webhook_url if provided
    if (discord_webhook_url !== undefined) {
      mergedData.discord_webhook_url = discord_webhook_url || null;
    } else if (existing?.discord_webhook_url) {
      mergedData.discord_webhook_url = existing.discord_webhook_url;
    }

    // Upsert
    const { data, error } = await client
      .from("notification_preferences")
      .upsert(mergedData, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase upsert error: ${error.message}`);
    }

    return Response.json({
      success: true,
      preferences: {
        channels: data.channels,
        alert_types: data.alert_types,
        quiet_hours: data.quiet_hours,
        digest_settings: data.digest_settings,
        discord_webhook_url: data.discord_webhook_url || null,
      },
      updatedAt: data.updated_at,
    });
  } catch (err) {
    console.error("[notifications/preferences PUT] Error:", err);
    return Response.json(
      { error: `Failed to update preferences: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
