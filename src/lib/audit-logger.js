/**
 * Audit Logger — P3-5B: Trade Execution Audit Trail
 *
 * Persists trade lifecycle events to the `trade_audit_log` Supabase table.
 * Fire-and-forget design: never blocks the main execution flow.
 * If logging fails, the error is logged but the trade still proceeds.
 *
 * The `trade_audit_log` table is append-only and immutable
 * (UPDATE/DELETE prevented by triggers — migration 14).
 *
 * Usage:
 *   import { logAuditEvent, AUDIT_EVENTS } from '@/lib/audit-logger';
 *   await logAuditEvent({
 *     eventType: AUDIT_EVENTS.ORDER_SUBMITTED,
 *     userId: 'user_123',
 *     symbol: 'AAPL',
 *     orderId: 'alpaca-order-id',
 *     ...
 *   });
 */

import { createClient } from "@supabase/supabase-js";

// ── Event types that should be logged ─────────────────────────────────────────

export const AUDIT_EVENTS = {
  ORDER_SUBMITTED: "ORDER_SUBMITTED",
  ORDER_FILLED: "ORDER_FILLED",
  ORDER_REJECTED: "ORDER_REJECTED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_PARTIAL_FILL: "ORDER_PARTIAL_FILL",
  TRADE_APPROVED: "TRADE_APPROVED",
  TRADE_REJECTED: "TRADE_REJECTED",
  CIRCUIT_BREAKER_TRIGGERED: "CIRCUIT_BREAKER_TRIGGERED",
  CIRCUIT_BREAKER_CHECK: "CIRCUIT_BREAKER_CHECK",
  HALT_ACTIVATED: "HALT_ACTIVATED",
  HALT_DEACTIVATED: "HALT_DEACTIVATED",
  KILL_SWITCH_ACTIVATED: "KILL_SWITCH_ACTIVATED",
  KILL_SWITCH_DEACTIVATED: "KILL_SWITCH_DEACTIVATED",
  SCHEDULED_ORDER_CREATED: "SCHEDULED_ORDER_CREATED",
  SCHEDULED_ORDER_EXECUTED: "SCHEDULED_ORDER_EXECUTED",
  CAMPAIGN_STARTED: "CAMPAIGN_STARTED",
  CAMPAIGN_PAUSED: "CAMPAIGN_PAUSED",
  CAMPAIGN_STOPPED: "CAMPAIGN_STOPPED",
  CAMPAIGN_TRADE_PLACED: "CAMPAIGN_TRADE_PLACED",
  MODE_CHANGED: "MODE_CHANGED",
  RECONCILIATION_PASSED: "RECONCILIATION_PASSED",
  RECONCILIATION_FAILED: "RECONCILIATION_FAILED",
};

// ── Supabase service client ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // Cannot log to DB without service role — log warning once
    console.warn("[audit-logger] Supabase service role key not configured. Audit events will not be persisted.");
    return null;
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Main log function ────────────────────────────────────────────────────────

/**
 * Log an audit event to the `trade_audit_log` table.
 * Fire-and-forget: wraps in try/catch, never throws.
 *
 * @param {{
 *   eventType: string,
 *   userId: string,
 *   orgId?: string,
 *   symbol?: string,
 *   orderId?: string,
 *   direction?: string,
 *   quantity?: number,
 *   price?: number,
 *   orderType?: string,
 *   regime?: string,
 *   strategy?: string,
 *   signalScore?: number,
 *   riskMetrics?: object,
 *   metadata?: object,
 * }} event
 * @returns {Promise<void>}
 */
export async function logAuditEvent(event) {
  try {
    const client = getServiceClient();
    if (!client) {
      // Graceful: just log to console if DB is not configured
      console.info("[audit-logger] (no DB) Event:", event.eventType, event.symbol || "", event.userId || "");
      return;
    }

    const row = {
      event_type: event.eventType,
      user_id: event.userId || null,
      org_id: event.orgId || null,
      symbol: event.symbol || null,
      order_id: event.orderId || null,
      direction: event.direction || null,
      quantity: event.quantity || null,
      price: event.price || null,
      order_type: event.orderType || null,
      regime: event.regime || null,
      strategy: event.strategy || null,
      signal_score: event.signalScore || null,
      risk_metrics: event.riskMetrics || null,
      metadata: event.metadata || null,
    };

    const { error } = await client
      .from("trade_audit_log")
      .insert(row);

    if (error) {
      // Table might not exist yet (graceful degradation)
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        console.warn("[audit-logger] trade_audit_log table not found. Run migration 14.");
      } else {
        console.error("[audit-logger] Failed to insert audit event:", error.message);
      }
    }
  } catch (err) {
    // Fire-and-forget: NEVER throw, NEVER block the caller
    console.error("[audit-logger] Unexpected error (non-fatal):", err.message);
  }
}

/**
 * Log multiple audit events in a single batch insert.
 * Fire-and-forget: wraps in try/catch, never throws.
 *
 * @param {Array<typeof logAuditEvent.event>} events
 * @returns {Promise<void>}
 */
export async function logAuditEvents(events) {
  try {
    if (!events || events.length === 0) return;

    const client = getServiceClient();
    if (!client) {
      console.info(`[audit-logger] (no DB) ${events.length} event(s) dropped`);
      return;
    }

    const rows = events.map((event) => ({
      event_type: event.eventType,
      user_id: event.userId || null,
      org_id: event.orgId || null,
      symbol: event.symbol || null,
      order_id: event.orderId || null,
      direction: event.direction || null,
      quantity: event.quantity || null,
      price: event.price || null,
      order_type: event.orderType || null,
      regime: event.regime || null,
      strategy: event.strategy || null,
      signal_score: event.signalScore || null,
      risk_metrics: event.riskMetrics || null,
      metadata: event.metadata || null,
    }));

    const { error } = await client
      .from("trade_audit_log")
      .insert(rows);

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        console.warn("[audit-logger] trade_audit_log table not found. Run migration 14.");
      } else {
        console.error("[audit-logger] Failed to batch insert audit events:", error.message);
      }
    }
  } catch (err) {
    console.error("[audit-logger] Batch insert unexpected error (non-fatal):", err.message);
  }
}
