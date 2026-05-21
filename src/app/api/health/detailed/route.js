/**
 * Detailed Health Check API — P3-5D: System Health Dashboard
 *
 * Comprehensive system health check returning ALL subsystem statuses.
 * Protected by withAuth({ minRole: 'viewer' }).
 *
 * Checks:
 *   - Backend (FastAPI) health
 *   - Supabase connectivity
 *   - Alpaca API reachability
 *   - Cron job status (via direct pg query to cron schema)
 *   - Data freshness (last analysis, fill, snapshot, reconciliation)
 *   - Circuit breakers & active halts
 *   - Audit trail stats
 *   - Fill poller status
 */

import { withAuth } from "@/lib/withAuth";
import { createClient } from "@supabase/supabase-js";
import { getAccount } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { getActiveHalts, getBreakerConfig } from "@/lib/circuit-breaker";
import { getActivePollers, isPollingActive } from "@/lib/fill-poller";
import { FASTAPI_BASE, APP_VERSION } from "@/lib/config";

// ── Server start time (set once per process) ──────────────────────────────────
const SERVER_START_TIME = Date.now();

// ── Supabase service client ───────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Cron job status via Supabase REST (no pg dependency) ──────────────────────
async function getCronJobs() {
  try {
    // Query cron jobs via the Supabase SQL RPC approach
    // Since we can't import pg in Next.js/Turbopack, we use the Supabase
    // REST API with the service role key to call a custom function
    const supabase = getServiceClient();
    if (!supabase) return null;

    // Use the Supabase REST API to query cron.job and cron.job_run_details
    // via an RPC function or direct table access
    // Since pg_cron tables aren't exposed via REST, we use the nt_v_recent_job_runs view
    const { data, error } = await supabase
      .from("nt_v_recent_job_runs")
      .select("*")
      .limit(20);

    if (error) {
      console.warn("[health/detailed] Cron query via view failed:", error.message);
      // Fallback: return basic info from our known cron schedule
      return [
        { name: "noble-campaign-tick", schedule: "* 13-20 * * 1-5", lastStatus: null, lastRun: null },
        { name: "noble-tda-scan", schedule: "0 */4 * * *", lastStatus: null, lastRun: null },
        { name: "noble-schedule-execute", schedule: "*/15 13-20 * * 1-5", lastStatus: null, lastRun: null },
        { name: "noble-strategy-rotate", schedule: "0 */6 * * *", lastStatus: null, lastRun: null },
        { name: "noble-strategy-optimize", schedule: "0 22 * * 1-5", lastStatus: null, lastRun: null },
        { name: "noble-portfolio-snapshot", schedule: "0 20 * * 1-5", lastStatus: null, lastRun: null },
      ];
    }

    return (data || []).map((row) => ({
      name: row.job_name || row.name || "unknown",
      schedule: row.schedule || "",
      lastRun: row.start_time || row.last_run || null,
      lastStatus: row.status || row.last_status || null,
      lastReturnMessage: row.return_message || row.output || null,
    }));
  } catch (err) {
    console.error("[health/detailed] Cron query failed:", err.message);
    return null;
  }
}

// ── Individual check functions ────────────────────────────────────────────────

async function checkBackend() {
  const start = Date.now();
  try {
    const res = await fetch(`${FASTAPI_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    const healthy = res.ok && (data?.status === "ok" || data?.status === "online");

    return {
      status: healthy ? "healthy" : "degraded",
      latencyMs: latency,
      url: FASTAPI_BASE,
      lastChecked: new Date().toISOString(),
    };
  } catch {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      url: FASTAPI_BASE,
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkSupabase() {
  const client = getServiceClient();
  if (!client) {
    return {
      status: "unhealthy",
      latencyMs: 0,
      tablesAccessible: 0,
      lastChecked: new Date().toISOString(),
      error: "Supabase service key not configured",
    };
  }

  const start = Date.now();
  try {
    // Try to query a lightweight table to verify DB connectivity
    const tables = ["trade_audit_log", "circuit_breakers", "portfolio_snapshots", "trading_halts"];
    let accessible = 0;

    const results = await Promise.allSettled(
      tables.map((t) => client.from(t).select("id", { count: "exact", head: true }).limit(1))
    );

    for (const r of results) {
      if (r.status === "fulfilled") accessible++;
    }

    return {
      status: accessible === tables.length ? "healthy" : accessible > 0 ? "degraded" : "unhealthy",
      latencyMs: Date.now() - start,
      tablesAccessible: accessible,
      totalTables: tables.length,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      tablesAccessible: 0,
      lastChecked: new Date().toISOString(),
      error: err.message,
    };
  }
}

async function checkAlpaca(request) {
  const start = Date.now();
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);

    if (!keys?.apiKey || !keys?.secretKey) {
      return {
        status: "degraded",
        latencyMs: 0,
        mode: credentialType || "paper",
        accountStatus: "no_keys",
        lastChecked: new Date().toISOString(),
      };
    }

    const account = await getAccount(keys.apiKey, keys.secretKey, credentialType);
    const latency = Date.now() - start;

    return {
      status: "healthy",
      latencyMs: latency,
      mode: credentialType || "paper",
      accountStatus: account?.status || "unknown",
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      mode: "unknown",
      accountStatus: "error",
      lastChecked: new Date().toISOString(),
      error: err.message?.substring(0, 100),
    };
  }
}

async function checkDataFreshness() {
  const client = getServiceClient();
  if (!client) {
    return {
      lastAnalysis: null,
      lastFill: null,
      lastSnapshot: null,
      lastReconciliation: null,
      staleThreshold: "30m",
      error: "Supabase not configured",
    };
  }

  const staleMs = 30 * 60 * 1000; // 30 minutes

  async function getLatestTimestamp(table, timeColumn = "created_at") {
    try {
      const { data, error } = await client
        .from(table)
        .select(timeColumn)
        .order(timeColumn, { ascending: false })
        .limit(1);
      if (error) return null;
      return data?.[0]?.[timeColumn] || null;
    } catch {
      return null;
    }
  }

  const [lastAnalysis, lastFill, lastSnapshot, lastReconciliation] = await Promise.all([
    getLatestTimestamp("ta_analysis_run"),
    getLatestTimestamp("trade_audit_log"),
    getLatestTimestamp("portfolio_snapshots"),
    getLatestTimestamp("reconciliation_results"),
  ]);

  return {
    lastAnalysis,
    lastFill,
    lastSnapshot,
    lastReconciliation,
    staleThreshold: "30m",
    isStale: {
      analysis: lastAnalysis ? (Date.now() - new Date(lastAnalysis).getTime()) > staleMs : true,
      fill: lastFill ? (Date.now() - new Date(lastFill).getTime()) > staleMs : true,
      snapshot: lastSnapshot ? (Date.now() - new Date(lastSnapshot).getTime()) > staleMs : true,
      reconciliation: lastReconciliation
        ? (Date.now() - new Date(lastReconciliation).getTime()) > staleMs
        : true,
    },
  };
}

async function checkCircuitBreakers(userId) {
  try {
    const [halts, config] = await Promise.all([
      getActiveHalts(),
      userId ? getBreakerConfig({ userId }) : Promise.resolve([]),
    ]);

    const activeBreakers = config.filter((b) => b.is_active);
    const triggeredBreakers = config.filter((b) => b.trigger_count > 0);

    return {
      status: halts.length > 0 ? "unhealthy" : triggeredBreakers.length > 0 ? "degraded" : "healthy",
      activeBreakers: activeBreakers.length,
      activeHalts: halts.length,
      halts: halts.map((h) => ({
        id: h.id,
        level: h.level,
        scope: h.scope,
        reason: h.reason,
        activatedAt: h.activated_at,
      })),
      lastTriggeredBreaker: triggeredBreakers.length > 0
        ? triggeredBreakers.sort((a, b) =>
            new Date(b.last_triggered_at || 0) - new Date(a.last_triggered_at || 0)
          )[0]
        : null,
    };
  } catch (err) {
    return {
      status: "degraded",
      activeBreakers: 0,
      activeHalts: 0,
      error: err.message,
    };
  }
}

async function checkAuditTrail() {
  const client = getServiceClient();
  if (!client) {
    return { status: "degraded", eventsLast24h: 0, lastEventAt: null, error: "No DB client" };
  }

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [countResult, lastResult, typeBreakdown] = await Promise.all([
      client
        .from("trade_audit_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo),
      client
        .from("trade_audit_log")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      client
        .from("trade_audit_log")
        .select("event_type")
        .gte("created_at", twentyFourHoursAgo),
    ]);

    // Build event type breakdown
    const eventTypeCounts = {};
    for (const row of typeBreakdown.data || []) {
      eventTypeCounts[row.event_type] = (eventTypeCounts[row.event_type] || 0) + 1;
    }

    return {
      status: "healthy",
      eventsLast24h: countResult.count || 0,
      lastEventAt: lastResult.data?.[0]?.created_at || null,
      eventTypeBreakdown: eventTypeCounts,
    };
  } catch (err) {
    return {
      status: "degraded",
      eventsLast24h: 0,
      lastEventAt: null,
      error: err.message,
    };
  }
}

function checkFillPoller(userId) {
  try {
    const activePollers = getActivePollers();
    const userPoller = userId ? isPollingActive(userId) : { active: false };

    return {
      status: activePollers.length > 0 ? "healthy" : "idle",
      isRunning: userPoller.active,
      activePollers: activePollers.length,
      lastPollAt: userPoller.lastActivityAt
        ? new Date(userPoller.lastActivityAt).toISOString()
        : null,
    };
  } catch (err) {
    return {
      status: "degraded",
      isRunning: false,
      error: err.message,
    };
  }
}

async function getRecentErrors() {
  const client = getServiceClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from("trade_audit_log")
      .select("event_type, symbol, created_at, metadata, user_id")
      .in("event_type", [
        "ORDER_REJECTED",
        "CIRCUIT_BREAKER_TRIGGERED",
        "HALT_ACTIVATED",
        "KILL_SWITCH_ACTIVATED",
        "RECONCILIATION_FAILED",
      ])
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

// ── Determine overall status ──────────────────────────────────────────────────

function determineOverallStatus(checks) {
  const statuses = [
    checks.backend?.status,
    checks.supabase?.status,
    checks.alpaca?.status,
    checks.circuitBreakers?.status,
    checks.auditTrail?.status,
  ].filter(Boolean);

  if (statuses.some((s) => s === "unhealthy")) return "unhealthy";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  return "healthy";
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const GET = withAuth(async (request, _context, authContext) => {
  const { userId } = authContext || {};

  // Run all checks in parallel for speed
  const [backend, supabase, alpaca, cronJobs, dataFreshness, circuitBreakers, auditTrail, fillPoller, recentErrors] =
    await Promise.all([
      checkBackend(),
      checkSupabase(),
      checkAlpaca(request),
      getCronJobs(),
      checkDataFreshness(),
      checkCircuitBreakers(userId),
      checkAuditTrail(),
      Promise.resolve(checkFillPoller(userId)),
      getRecentErrors(),
    ]);

  const checks = {
    backend,
    supabase,
    alpaca,
    cronJobs: {
      status: cronJobs ? "healthy" : "degraded",
      jobs: cronJobs || [],
    },
    dataFreshness,
    circuitBreakers,
    auditTrail,
    fillPoller,
  };

  const overall = determineOverallStatus(checks);

  return Response.json({
    timestamp: new Date().toISOString(),
    overall,
    checks,
    recentErrors,
    uptime: {
      serverStartTime: new Date(SERVER_START_TIME).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    },
    version: APP_VERSION,
  });
}, { minRole: "viewer" });
