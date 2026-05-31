/**
 * Audit Log Archival & Retention Engine — P4-6C
 *
 * Provides:
 *   - Configurable retention policies per table (auto-cleanup via cron)
 *   - GDPR-style data purging (right to erasure for a specific user)
 *   - Archive-to-cold-storage before deletion
 *   - Retention policy management UI
 *
 * All functions are SERVER-SIDE ONLY.
 */

import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/encryption";

// ── Configuration ────────────────────────────────────────────────────────────

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

// ── Retention Policies ───────────────────────────────────────────────────────

/**
 * Default retention policies (days).
 * Each entry defines how long data is kept before archival/deletion.
 */
export const RETENTION_POLICIES = {
  trade_audit_log: {
    label: "Trade Audit Log",
    hotDays: 90,       // Keep in main table for 90 days
    archiveDays: 365,  // Move to archive after 90, keep archive for 1 year
    gdprPurge: true,   // Support per-user GDPR purge
  },
  rate_limit_violations: {
    label: "Rate Limit Violations",
    hotDays: 30,       // Keep for 30 days
    archiveDays: 90,   // Archive for 90 days total
    gdprPurge: true,
  },
  reconciliation_results: {
    label: "Reconciliation Results",
    hotDays: 90,
    archiveDays: 365,
    gdprPurge: true,
  },
  portfolio_snapshots: {
    label: "Portfolio Snapshots",
    hotDays: 365,       // Keep 1 year in main table (used for equity curve)
    archiveDays: 1825,  // Archive for 5 years total (institutional requirement)
    gdprPurge: true,
  },
};

// ── Archival ─────────────────────────────────────────────────────────────────

/**
 * Archive old records from a table to the corresponding archive table.
 * Archive tables have the same schema + archived_at timestamp.
 *
 * @param {string} tableName - The table to archive from
 * @param {number} [olderThanDays] - Archive records older than this (default: from policy)
 * @param {number} [batchSize=1000] - Records per batch
 * @returns {{ archived: number, errors: number }}
 */
export async function archiveTable(tableName, olderThanDays, batchSize = 1000) {
  const client = getClient();
  if (!client) return { archived: 0, errors: 1, error: "DB not configured" };

  const policy = RETENTION_POLICIES[tableName];
  const days = olderThanDays || policy?.hotDays || 90;
  const archiveTable = `${tableName}_archive`;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let totalArchived = 0;
  let totalErrors = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      // Fetch batch of old records
      const { data: records, error: fetchErr } = await client
        .from(tableName)
        .select("*")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (fetchErr) {
        console.error(`[retention] Fetch error for ${tableName}:`, fetchErr.message);
        totalErrors++;
        break;
      }

      if (!records || records.length === 0) {
        hasMore = false;
        break;
      }

      // Add archived_at timestamp
      const archiveRecords = records.map((r) => ({
        ...r,
        archived_at: new Date().toISOString(),
      }));

      // Insert into archive table
      const { error: insertErr } = await client
        .from(archiveTable)
        .insert(archiveRecords);

      if (insertErr) {
        // Archive table might not exist — create it
        if (insertErr.message?.includes("does not exist") || insertErr.code === "42P01") {
          console.warn(`[retention] Archive table ${archiveTable} doesn't exist. Run migration 25 first.`);
          totalErrors++;
          break;
        }
        console.error(`[retention] Insert error for ${archiveTable}:`, insertErr.message);
        totalErrors++;
        break;
      }

      // Delete archived records from main table
      const ids = records.map((r) => r.id);
      const { error: deleteErr } = await client
        .from(tableName)
        .delete()
        .in("id", ids);

      if (deleteErr) {
        console.error(`[retention] Delete error for ${tableName}:`, deleteErr.message);
        totalErrors++;
        // Don't break — we've already archived, just log the error
      }

      totalArchived += records.length;
      hasMore = records.length === batchSize;

      // Small delay to avoid overwhelming the database
      if (hasMore) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error(`[retention] Unexpected error for ${tableName}:`, err.message);
      totalErrors++;
      break;
    }
  }

  return { archived: totalArchived, errors: totalErrors, table: tableName, cutoff };
}

/**
 * Purge old archive records (delete permanently from archive tables).
 * Called after archive records exceed their retention period.
 *
 * @param {string} tableName - The archive table to purge
 * @param {number} [olderThanDays] - Purge records older than this
 * @returns {{ purged: number, errors: number }}
 */
export async function purgeArchive(tableName, olderThanDays) {
  const client = getClient();
  if (!client) return { purged: 0, errors: 1, error: "DB not configured" };

  const policy = RETENTION_POLICIES[tableName];
  const days = olderThanDays || policy?.archiveDays || 365;
  const archiveTable = `${tableName}_archive`;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error: countErr } = await client
      .from(archiveTable)
      .select("id", { count: "exact", head: true })
      .lt("archived_at", cutoff);

    if (countErr) {
      return { purged: 0, errors: 1, error: countErr.message };
    }

    const { error: deleteErr } = await client
      .from(archiveTable)
      .delete()
      .lt("archived_at", cutoff);

    if (deleteErr) {
      return { purged: 0, errors: 1, error: deleteErr.message };
    }

    return { purged: count || 0, errors: 0, table: archiveTable, cutoff };
  } catch (err) {
    return { purged: 0, errors: 1, error: err.message };
  }
}

// ── GDPR: Right to Erasure ───────────────────────────────────────────────────

/**
 * Permanently delete all data for a specific user across all tables.
 * This implements GDPR Article 17 (Right to Erasure).
 *
 * Before deletion, logs a summary of what will be purged.
 * After deletion, creates an audit record that the erasure occurred.
 *
 * @param {string} userId - The Clerk user ID to purge
 * @param {string} [reason="gdpr_request"] - Reason for the purge
 * @returns {{ purged: Object, auditRecord: Object }}
 */
export async function gdprPurgeUser(userId, reason = "gdpr_request") {
  const client = getClient();
  if (!client) return { purged: {}, error: "DB not configured" };

  // Tables to purge (in order — most sensitive first)
  const tablesToPurge = [
    "user_credentials",
    "notification_preferences",
    "user_onboarding",
    "user_subscriptions",
    "trade_audit_log",
    "trade_audit_log_archive",
    "circuit_breakers",
    "trading_halts",
    "reconciliation_results",
    "reconciliation_results_archive",
    "portfolio_snapshots",
    "portfolio_snapshots_archive",
    "rate_limit_violations",
    "pnl_alert_thresholds",
  ];

  const purged = {};
  let totalRecords = 0;

  for (const table of tablesToPurge) {
    try {
      // Count records before deletion
      const { count, error: countErr } = await client
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .or(`clerk_user_id.eq.${userId}`);

      if (countErr) {
        // Table might not exist or different column names
        purged[table] = { skipped: true, reason: countErr.message };
        continue;
      }

      if (count === 0) {
        purged[table] = { deleted: 0 };
        continue;
      }

      // Delete
      const { error: deleteErr } = await client
        .from(table)
        .delete()
        .eq("user_id", userId)
        .or(`clerk_user_id.eq.${userId}`);

      if (deleteErr) {
        purged[table] = { deleted: 0, error: deleteErr.message };
      } else {
        purged[table] = { deleted: count };
        totalRecords += count;
      }
    } catch (err) {
      purged[table] = { deleted: 0, error: err.message };
    }
  }

  // Create audit record of the erasure itself
  const auditRecord = {
    timestamp: new Date().toISOString(),
    action: "gdpr_purge",
    userId,
    reason,
    totalRecordsPurged: totalRecords,
    tablesAffected: Object.keys(purged).filter((t) => purged[t].deleted > 0),
  };

  // Store the audit record (this is required — you must keep a record of erasure)
  try {
    await client.from("gdpr_erasure_log").insert({
      user_id: userId,
      reason,
      tables_affected: auditRecord.tablesAffected,
      total_records_purged: totalRecords,
      purged_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[retention] Failed to log GDPR erasure:", err.message);
    // Non-fatal — the purge itself succeeded
  }

  return { purged, auditRecord };
}

// ── Run All Retention Jobs ───────────────────────────────────────────────────

/**
 * Run all configured retention jobs (archive + purge).
 * Designed to be called from a cron endpoint.
 *
 * @returns {{ archived: Object, purged: Object }}
 */
export async function runAllRetentionJobs() {
  const results = { archived: {}, purged: {} };

  for (const table of Object.keys(RETENTION_POLICIES)) {
    // Archive old records
    const archiveResult = await archiveTable(table);
    results.archived[table] = archiveResult;

    // Purge expired archive records
    const purgeResult = await purgeArchive(table);
    results.purged[table] = purgeResult;
  }

  return results;
}

// ── Retention Status ─────────────────────────────────────────────────────────

/**
 * Get the current retention status for all audited tables.
 * Returns record counts and retention policy info.
 *
 * @returns {Object} Status per table
 */
export async function getRetentionStatus() {
  const client = getClient();
  if (!client) return { error: "DB not configured" };

  const status = {};

  for (const [table, policy] of Object.entries(RETENTION_POLICIES)) {
    try {
      const [hotResult, archiveResult] = await Promise.all([
        client.from(table).select("id", { count: "exact", head: true }),
        client.from(`${table}_archive`).select("id", { count: "exact", head: true }).catch(() => ({ count: null })),
      ]);

      status[table] = {
        label: policy.label,
        hotRecords: hotResult.count || 0,
        archiveRecords: archiveResult?.count || 0,
        hotRetentionDays: policy.hotDays,
        archiveRetentionDays: policy.archiveDays - policy.hotDays,
        gdprPurgeSupported: policy.gdprPurge,
      };
    } catch (err) {
      status[table] = {
        label: policy.label,
        error: err.message,
      };
    }
  }

  return status;
}
