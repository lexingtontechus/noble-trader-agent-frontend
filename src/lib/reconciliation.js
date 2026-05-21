/**
 * Reconciliation Engine — P3-5C
 *
 * Compares expected vs actual trade outcomes to detect:
 * - Missing fills (order submitted but no fill recorded)
 * - Phantom fills (fill recorded but no corresponding order)
 * - Price discrepancies (expected price vs actual fill price)
 * - Quantity mismatches (ordered qty vs filled qty)
 * - Stale orders (submitted but not filled after N minutes)
 *
 * Institutional requirement: daily reconciliation to ensure trade
 * execution integrity and regulatory compliance.
 *
 * Uses Supabase service role for audit log queries.
 * Uses Alpaca API for actual fill verification.
 */

import { createClient } from "@supabase/supabase-js";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";
import { activateHalt } from "@/lib/circuit-breaker";
import { getActivities } from "@/lib/alpaca-client";

// ── Configuration ────────────────────────────────────────────────────────────

/** Price discrepancy threshold as percentage (0.5% = 50 bps) */
const PRICE_TOLERANCE_PCT = parseFloat(process.env.RECONCILIATION_PRICE_TOLERANCE_PCT || "0.5");

/** Stale order threshold in minutes */
const STALE_THRESHOLD_MINUTES = parseInt(process.env.RECONCILIATION_STALE_MINUTES || "30");

/** Auto-halt if discrepancy count exceeds this */
const DISCREPANCY_HALT_THRESHOLD = parseInt(process.env.RECONCILIATION_DISCREPANCY_HALT_THRESHOLD || "3");

// ── Supabase service client ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase not configured for reconciliation engine");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Core reconciliation ──────────────────────────────────────────────────────

/**
 * Run reconciliation for a user within a date range.
 *
 * Algorithm:
 *   1. Fetch ORDER_SUBMITTED events from trade_audit_log (expected trades)
 *   2. Fetch ORDER_FILLED events from trade_audit_log (audit fills)
 *   3. Fetch actual fills from Alpaca activities API
 *   4. Match by order_id across all three sources
 *   5. Classify each order into categories
 *   6. Auto-halt if critical discrepancies found
 *   7. Log result to audit trail and reconciliation_results table
 *
 * @param {{
 *   userId: string,
 *   dateFrom: string,  // ISO date string
 *   dateTo: string,    // ISO date string
 *   alpacaKeys?: { apiKey: string, secretKey: string, mode?: string },
 *   triggeredBy?: string,
 * }} params
 * @returns {Promise<{
 *   matched: Array,
 *   priceDiscrepancy: Array,
 *   quantityMismatch: Array,
 *   missingFills: Array,
 *   phantomFills: Array,
 *   staleOrders: Array,
 *   summary: {
 *     totalExpected: number,
 *     totalFilled: number,
 *     matchRate: number,
 *     discrepancyCount: number,
 *     staleCount: number,
 *     phantomCount: number,
 *   },
 *   status: 'passed' | 'failed' | 'warning',
 *   halted: boolean,
 *   runAt: string,
 * }>}
 */
export async function reconcile({ userId, dateFrom, dateTo, alpacaKeys, triggeredBy = "manual" }) {
  const client = getServiceClient();
  const runAt = new Date().toISOString();

  console.info(`[reconciliation] Starting reconciliation for user ${userId} from ${dateFrom} to ${dateTo}`);

  // ── Step 1: Fetch expected trades (ORDER_SUBMITTED) ───────────────────
  const { data: submittedEvents, error: submitErr } = await client
    .from("trade_audit_log")
    .select("*")
    .eq("user_id", userId)
    .eq("event_type", "ORDER_SUBMITTED")
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo)
    .order("created_at", { ascending: true });

  if (submitErr) {
    console.error("[reconciliation] Failed to fetch submitted events:", submitErr.message);
    throw new Error(`Failed to fetch submitted events: ${submitErr.message}`);
  }

  // ── Step 2: Fetch audit fills (ORDER_FILLED + ORDER_PARTIAL_FILL) ─────
  const { data: filledEvents, error: fillErr } = await client
    .from("trade_audit_log")
    .select("*")
    .in("event_type", ["ORDER_FILLED", "ORDER_PARTIAL_FILL"])
    .eq("user_id", userId)
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo)
    .order("created_at", { ascending: true });

  if (fillErr) {
    console.error("[reconciliation] Failed to fetch filled events:", fillErr.message);
    throw new Error(`Failed to fetch filled events: ${fillErr.message}`);
  }

  // ── Step 3: Fetch actual fills from Alpaca ────────────────────────────
  let alpacaFills = [];
  if (alpacaKeys?.apiKey && alpacaKeys?.secretKey) {
    try {
      alpacaFills = await getActivities(alpacaKeys.apiKey, alpacaKeys.secretKey, {
        activity_types: "FILL",
        after: dateFrom,
        until: dateTo,
        direction: "asc",
        page_size: 500,
        mode: alpacaKeys.mode || "paper",
      });
    } catch (err) {
      console.warn("[reconciliation] Failed to fetch Alpaca fills:", err.message);
      // Continue without Alpaca fills — reconciliation can still use audit log
    }
  } else {
    console.info("[reconciliation] No Alpaca keys provided — skipping Alpaca fill verification");
  }

  // ── Step 4: Build lookup maps ──────────────────────────────────────────

  // Map: order_id → submitted event
  const submittedMap = new Map();
  for (const evt of (submittedEvents || [])) {
    if (evt.order_id) {
      submittedMap.set(evt.order_id, evt);
    }
  }

  // Map: order_id → fill event(s)
  const auditFillMap = new Map();
  for (const evt of (filledEvents || [])) {
    if (evt.order_id) {
      if (!auditFillMap.has(evt.order_id)) {
        auditFillMap.set(evt.order_id, []);
      }
      auditFillMap.get(evt.order_id).push(evt);
    }
  }

  // Map: order_id → Alpaca fill(s)
  const alpacaFillMap = new Map();
  for (const fill of (alpacaFills || [])) {
    const orderId = fill.order_id || fill.order?.id;
    if (orderId) {
      if (!alpacaFillMap.has(orderId)) {
        alpacaFillMap.set(orderId, []);
      }
      alpacaFillMap.get(orderId).push(fill);
    }
  }

  // ── Step 5: Classify each order ────────────────────────────────────────

  const matched = [];
  const priceDiscrepancy = [];
  const quantityMismatch = [];
  const missingFills = [];
  const staleOrders = [];

  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

  for (const [orderId, submittedEvt] of submittedMap) {
    const auditFills = auditFillMap.get(orderId) || [];
    const alpacaFillsForOrder = alpacaFillMap.get(orderId) || [];

    const hasAuditFill = auditFills.length > 0;
    const hasAlpacaFill = alpacaFillsForOrder.length > 0;

    // Determine fill price and qty from best source
    let fillPrice = null;
    let fillQty = null;
    let fillSource = null;

    if (hasAlpacaFill) {
      // Use Alpaca fill as ground truth
      const latestFill = alpacaFillsForOrder[alpacaFillsForOrder.length - 1];
      fillPrice = parseFloat(latestFill.price || latestFill.fill_price?.amount || 0);
      fillQty = parseFloat(latestFill.qty || latestFill.fill_qty || latestFill.cumulative_qty || 0);
      fillSource = "alpaca";
    } else if (hasAuditFill) {
      // Fall back to audit log fill
      const latestAuditFill = auditFills[auditFills.length - 1];
      fillPrice = parseFloat(latestAuditFill.price || 0);
      fillQty = parseFloat(latestAuditFill.quantity || 0);
      fillSource = "audit_log";
    }

    const expectedPrice = parseFloat(submittedEvt.price || 0);
    const expectedQty = parseFloat(submittedEvt.quantity || 0);
    const submittedAt = new Date(submittedEvt.created_at);

    if (!hasAuditFill && !hasAlpacaFill) {
      // No fill recorded anywhere
      const isStale = submittedAt < staleCutoff;

      if (isStale) {
        staleOrders.push({
          orderId,
          symbol: submittedEvt.symbol,
          direction: submittedEvt.direction,
          expectedPrice,
          expectedQty,
          submittedAt: submittedEvt.created_at,
          staleMinutes: Math.round((Date.now() - submittedAt.getTime()) / 60000),
        });
      } else {
        missingFills.push({
          orderId,
          symbol: submittedEvt.symbol,
          direction: submittedEvt.direction,
          expectedPrice,
          expectedQty,
          submittedAt: submittedEvt.created_at,
          minutesSinceSubmit: Math.round((Date.now() - submittedAt.getTime()) / 60000),
          note: "Order submitted but no fill yet (within stale threshold)",
        });
      }
      continue;
    }

    // ── Price check ────────────────────────────────────────────────────
    let priceOk = true;
    let priceDiffPct = 0;
    if (expectedPrice > 0 && fillPrice > 0) {
      priceDiffPct = Math.abs((fillPrice - expectedPrice) / expectedPrice) * 100;
      if (priceDiffPct > PRICE_TOLERANCE_PCT) {
        priceOk = false;
      }
    }

    // ── Quantity check ─────────────────────────────────────────────────
    let qtyOk = true;
    if (expectedQty > 0 && fillQty > 0 && fillQty !== expectedQty) {
      qtyOk = false;
    }

    // ── Classify ───────────────────────────────────────────────────────
    if (priceOk && qtyOk) {
      matched.push({
        orderId,
        symbol: submittedEvt.symbol,
        direction: submittedEvt.direction,
        expectedPrice,
        fillPrice,
        expectedQty,
        fillQty,
        fillSource,
        priceDiffPct: priceDiffPct.toFixed(2),
        submittedAt: submittedEvt.created_at,
        filledAt: hasAuditFill ? auditFills[auditFills.length - 1].created_at : null,
      });
    } else if (!priceOk) {
      priceDiscrepancy.push({
        orderId,
        symbol: submittedEvt.symbol,
        direction: submittedEvt.direction,
        expectedPrice,
        fillPrice,
        priceDiffPct: priceDiffPct.toFixed(2),
        tolerancePct: PRICE_TOLERANCE_PCT,
        expectedQty,
        fillQty,
        fillSource,
        submittedAt: submittedEvt.created_at,
        filledAt: hasAuditFill ? auditFills[auditFills.length - 1].created_at : null,
      });
    }

    if (!qtyOk) {
      quantityMismatch.push({
        orderId,
        symbol: submittedEvt.symbol,
        direction: submittedEvt.direction,
        expectedQty,
        fillQty,
        diff: fillQty - expectedQty,
        expectedPrice,
        fillPrice,
        fillSource,
        submittedAt: submittedEvt.created_at,
        filledAt: hasAuditFill ? auditFills[auditFills.length - 1].created_at : null,
      });
    }
  }

  // ── Step 6: Detect phantom fills ───────────────────────────────────────
  // Fills in Alpaca that have no corresponding ORDER_SUBMITTED in audit log
  const phantomFills = [];

  for (const [orderId, fills] of alpacaFillMap) {
    if (!submittedMap.has(orderId)) {
      const fill = fills[0];
      phantomFills.push({
        orderId,
        symbol: fill.symbol || fill.side?.symbol || "UNKNOWN",
        direction: fill.side || "unknown",
        fillPrice: parseFloat(fill.price || fill.fill_price?.amount || 0),
        fillQty: parseFloat(fill.qty || fill.fill_qty || 0),
        fillSource: "alpaca",
        filledAt: fill.timestamp || fill.transaction_time || fill.created_at,
        note: "Fill in Alpaca but no ORDER_SUBMITTED in audit log",
      });
    }
  }

  // Also check audit fills without submitted orders
  for (const [orderId, fills] of auditFillMap) {
    if (!submittedMap.has(orderId) && !alpacaFillMap.has(orderId)) {
      const fill = fills[0];
      phantomFills.push({
        orderId,
        symbol: fill.symbol || "UNKNOWN",
        direction: fill.direction || "unknown",
        fillPrice: parseFloat(fill.price || 0),
        fillQty: parseFloat(fill.quantity || 0),
        fillSource: "audit_log",
        filledAt: fill.created_at,
        note: "Fill in audit log but no ORDER_SUBMITTED event",
      });
    }
  }

  // ── Step 7: Compute summary ────────────────────────────────────────────

  const totalExpected = submittedMap.size;
  const totalFilled = matched.length + priceDiscrepancy.length + quantityMismatch.length;
  const matchRate = totalExpected > 0 ? (matched.length / totalExpected) * 100 : 100;
  const discrepancyCount = priceDiscrepancy.length + quantityMismatch.length;
  const staleCount = staleOrders.length;
  const phantomCount = phantomFills.length;

  const summary = {
    totalExpected,
    totalFilled,
    matchRate: Math.round(matchRate * 100) / 100,
    discrepancyCount,
    staleCount,
    phantomCount,
  };

  // ── Step 8: Determine status ───────────────────────────────────────────

  let status = "passed";
  if (phantomCount > 0 || discrepancyCount > DISCREPANCY_HALT_THRESHOLD) {
    status = "failed";
  } else if (discrepancyCount > 0 || staleCount > 0) {
    status = "warning";
  }

  // ── Step 9: Auto-halt on critical discrepancies ────────────────────────

  let halted = false;
  if (status === "failed") {
    try {
      await activateHalt({
        level: "user_halt",
        scope: userId,
        reason: "reconciliation_failure",
        triggeredBy: "reconciliation_engine",
        metadata: {
          discrepancyCount,
          phantomCount,
          matchRate: summary.matchRate,
          dateFrom,
          dateTo,
          triggeredBy,
        },
      });
      halted = true;
      console.warn(`[reconciliation] Auto-halt activated for user ${userId}: ${discrepancyCount} discrepancies, ${phantomCount} phantom fills`);
    } catch (haltErr) {
      console.error("[reconciliation] Failed to activate auto-halt:", haltErr.message);
    }
  }

  // ── Step 10: Log to audit trail ────────────────────────────────────────

  const auditEventType = status === "passed"
    ? AUDIT_EVENTS.RECONCILIATION_PASSED
    : AUDIT_EVENTS.RECONCILIATION_FAILED;

  logAuditEvent({
    eventType: auditEventType,
    userId,
    metadata: {
      status,
      summary,
      dateFrom,
      dateTo,
      triggeredBy,
      halted,
      priceDiscrepancyIds: priceDiscrepancy.map(d => d.orderId),
      quantityMismatchIds: quantityMismatch.map(d => d.orderId),
      phantomFillIds: phantomFills.map(d => d.orderId),
      staleOrderIds: staleOrders.map(d => d.orderId),
    },
  });

  // ── Step 11: Persist to reconciliation_results ─────────────────────────

  try {
    await client.from("reconciliation_results").insert({
      user_id: userId,
      run_date: dateFrom.slice(0, 10), // YYYY-MM-DD
      status,
      total_expected: totalExpected,
      total_filled: totalFilled,
      match_rate: summary.matchRate,
      discrepancy_count: discrepancyCount,
      stale_count: staleCount,
      phantom_count: phantomCount,
      details: {
        matched: matched.slice(0, 50),      // Cap detail size
        priceDiscrepancy: priceDiscrepancy.slice(0, 50),
        quantityMismatch: quantityMismatch.slice(0, 50),
        missingFills: missingFills.slice(0, 50),
        phantomFills: phantomFills.slice(0, 50),
        staleOrders: staleOrders.slice(0, 50),
        dateFrom,
        dateTo,
        triggeredBy,
        halted,
      },
    });
  } catch (dbErr) {
    console.warn("[reconciliation] Failed to persist reconciliation result:", dbErr.message);
    // Non-critical — result is still logged to audit trail
  }

  const result = {
    matched,
    priceDiscrepancy,
    quantityMismatch,
    missingFills,
    phantomFills,
    staleOrders,
    summary,
    status,
    halted,
    runAt,
  };

  console.info(`[reconciliation] Complete: ${status} — ${matched.length}/${totalExpected} matched, ${discrepancyCount} discrepancies, ${phantomCount} phantom, ${staleCount} stale`);

  return result;
}

// ── Get reconciliation history ──────────────────────────────────────────────

/**
 * Get past reconciliation results from the reconciliation_results table.
 *
 * @param {{ userId: string, limit?: number }} params
 * @returns {Promise<Array>}
 */
export async function getReconciliationHistory({ userId, limit = 20 }) {
  const client = getServiceClient();

  const { data, error } = await client
    .from("reconciliation_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[reconciliation] Failed to fetch history:", error.message);
    throw new Error(`Failed to fetch reconciliation history: ${error.message}`);
  }

  return data || [];
}

// ── Auto-reconciliation settings ────────────────────────────────────────────

/**
 * Get auto-reconciliation setting for a user.
 *
 * @param {{ userId: string }} params
 * @returns {Promise<{ enabled: boolean, time: string }>}
 */
export async function getAutoReconSetting({ userId }) {
  const client = getServiceClient();

  const { data, error } = await client
    .from("reconciliation_auto_config")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    // Table might not exist yet
    console.warn("[reconciliation] Failed to fetch auto-recon setting:", error.message);
    return { enabled: false, time: "16:05" };
  }

  if (!data || data.length === 0) {
    return { enabled: false, time: "16:05" };
  }

  return {
    enabled: data[0].enabled || false,
    time: data[0].run_time || "16:05",
  };
}

/**
 * Set auto-reconciliation setting for a user.
 *
 * @param {{ userId: string, enabled: boolean, time?: string }} params
 * @returns {Promise<{ enabled: boolean, time: string }>}
 */
export async function setAutoReconSetting({ userId, enabled, time = "16:05" }) {
  const client = getServiceClient();

  // Check if setting exists
  const { data: existing } = await client
    .from("reconciliation_auto_config")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update
    const { error } = await client
      .from("reconciliation_auto_config")
      .update({
        enabled,
        run_time: time,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing[0].id);

    if (error) {
      throw new Error(`Failed to update auto-recon setting: ${error.message}`);
    }
  } else {
    // Insert
    const { error } = await client
      .from("reconciliation_auto_config")
      .insert({
        user_id: userId,
        enabled,
        run_time: time,
      });

    if (error) {
      throw new Error(`Failed to create auto-recon setting: ${error.message}`);
    }
  }

  return { enabled, time };
}
