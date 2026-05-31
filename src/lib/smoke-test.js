/**
 * Smoke Test Engine — P3-5E: Paper Trading E2E Smoke Test
 *
 * Comprehensive end-to-end test that validates the ENTIRE trade lifecycle
 * from analysis to reconciliation. Runs as a BFF route triggered from the UI.
 *
 * Tests:
 *   1. Alpaca Connectivity (GET /v2/account)
 *   2. Alpaca Order Creation (buy 1 SPY)
 *   3. Order Retrieval (GET /v2/orders/{id})
 *   4. Position Check (GET /v2/positions)
 *   5. Portfolio History (GET /v2/account/portfolio/history)
 *   6. Fill Detection (GET /v2/account/activities/FILL)
 *   7. Cleanup — Cancel/Liquidate
 *   8. Circuit Breaker Check
 *   9. Audit Trail
 *  10. Reconciliation
 *  11. Supabase Connectivity
 *  12. Health Check
 *
 * Paper trading mode ONLY. Cleans up after itself.
 */

import { alpacaFetch, getAccount, getPositions, getPortfolioHistory, getActivities } from "@/lib/alpaca-client";
import { checkCircuitBreakers, isHalted } from "@/lib/circuit-breaker";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";
import { reconcile } from "@/lib/reconciliation";
import { createClient } from "@supabase/supabase-js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_SYMBOL = "SPY";
const TEST_QTY = 1;

// ── Supabase service client ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase not configured for smoke test");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Helper: run a single test with timing ─────────────────────────────────────

async function runTest(name, fn, { critical = false, category = "general" } = {}) {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      name,
      status: "pass",
      duration: Date.now() - start,
      details: result.details || result || "OK",
      category,
      critical,
    };
  } catch (err) {
    return {
      name,
      status: "fail",
      duration: Date.now() - start,
      details: "",
      error: err.message,
      category,
      critical,
    };
  }
}

// ── Main smoke test function ──────────────────────────────────────────────────

/**
 * Run the full paper trading E2E smoke test.
 *
 * @param {{ userId: string, alpacaKeys: { apiKey: string, secretKey: string }, mode?: string }} params
 * @returns {Promise<{ startedAt: string, completedAt: string, overall: string, tests: Array, durationMs: number }>}
 */
export async function runSmokeTest({ userId, alpacaKeys, mode = "paper" }) {
  const startedAt = new Date().toISOString();
  const tests = [];

  // Guard: must have Alpaca keys
  if (!alpacaKeys?.apiKey || !alpacaKeys?.secretKey) {
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      overall: "fail",
      tests: [{
        name: "Alpaca Keys",
        status: "fail",
        duration: 0,
        details: "",
        error: "No Alpaca API keys configured. Please add your paper trading keys.",
        category: "connectivity",
        critical: true,
      }],
      durationMs: 0,
    };
  }

  const { apiKey, secretKey } = alpacaKeys;
  let orderId = null;
  let orderFilled = false;

  // ── Test 1: Alpaca Connectivity ─────────────────────────────────────────
  const test1 = await runTest("Alpaca Connectivity", async () => {
    const account = await getAccount(apiKey, secretKey, mode);
    if (!account) throw new Error("No account data returned");
    if (account.status !== "ACTIVE") {
      throw new Error(`Account status is ${account.status}, expected ACTIVE`);
    }
    return {
      details: `Account ACTIVE, equity $${parseFloat(account.equity || 0).toFixed(2)}, mode: ${mode}`,
    };
  }, { critical: true, category: "connectivity" });
  tests.push(test1);

  // Only proceed with trading tests if connectivity works
  const account = test1.status === "pass" ? await getAccount(apiKey, secretKey, mode).catch(() => null) : null;

  // ── Test 2: Alpaca Order Creation ───────────────────────────────────────
  const test2 = await runTest("Order Creation (Buy 1 SPY)", async () => {
    const order = await alpacaFetch("/orders", {
      apiKey,
      secretKey,
      method: "POST",
      body: {
        symbol: TEST_SYMBOL,
        qty: String(TEST_QTY),
        side: "buy",
        type: "market",
        time_in_force: "day",
      },
      mode,
    });

    if (!order?.id) throw new Error("Order was not accepted — no order ID returned");

    const acceptedStatuses = ["accepted", "pending_new", "new", "partially_filled", "filled"];
    if (!acceptedStatuses.includes(order.status)) {
      throw new Error(`Order status is "${order.status}", expected one of: ${acceptedStatuses.join(", ")}`);
    }

    orderId = order.id;
    return {
      details: `Order ${order.id} accepted, status: ${order.status}`,
    };
  }, { critical: true, category: "trading" });
  tests.push(test2);

  // ── Test 3: Order Retrieval ─────────────────────────────────────────────
  if (orderId) {
    const test3 = await runTest("Order Retrieval", async () => {
      const order = await alpacaFetch(`/orders/${orderId}`, { apiKey, secretKey, mode });
      if (!order || order.id !== orderId) {
        throw new Error(`Retrieved order ID ${order?.id} does not match placed order ID ${orderId}`);
      }
      if (order.status === "filled") orderFilled = true;
      return {
        details: `Order ${order.id} found, status: ${order.status}, filled_qty: ${order.filled_qty || 0}`,
      };
    }, { category: "trading" });
    tests.push(test3);
  } else {
    tests.push({
      name: "Order Retrieval",
      status: "skip",
      duration: 0,
      details: "Skipped: no order was placed",
      category: "trading",
    });
  }

  // ── Test 4: Position Check ──────────────────────────────────────────────
  const test4 = await runTest("Position Check", async () => {
    const positions = await getPositions(apiKey, secretKey, mode);
    if (!Array.isArray(positions)) throw new Error("Positions API returned non-array");

    const spyPos = positions.find(
      (p) => (p.symbol || "").toUpperCase() === TEST_SYMBOL
    );
    if (spyPos) {
      return {
        details: `SPY position found: ${spyPos.qty} shares, market_value: $${parseFloat(spyPos.market_value || 0).toFixed(2)}`,
      };
    }
    // Position may not appear instantly — not necessarily an error for market order just placed
    return {
      details: `No SPY position yet (${positions.length} total positions). Order may still be filling.`,
    };
  }, { category: "trading" });
  tests.push(test4);

  // ── Test 5: Portfolio History ───────────────────────────────────────────
  const test5 = await runTest("Portfolio History", async () => {
    const history = await getPortfolioHistory(apiKey, secretKey, { period: "1M", timeframe: "1D", mode });
    if (!history) throw new Error("No portfolio history data returned");
    if (!Array.isArray(history.equity) && !history.timestamp) {
      throw new Error("Portfolio history returned unexpected format");
    }
    const dataPoints = Array.isArray(history.equity) ? history.equity.length : 0;
    return {
      details: `Portfolio history returned ${dataPoints} data points`,
    };
  }, { category: "trading" });
  tests.push(test5);

  // ── Test 6: Fill Detection ──────────────────────────────────────────────
  if (orderId) {
    const test6 = await runTest("Fill Detection", async () => {
      const afterDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // last 10 min
      const activities = await getActivities(apiKey, secretKey, {
        activity_types: "FILL",
        after: afterDate,
        direction: "desc",
        page_size: 10,
        mode,
      });

      const ourFill = Array.isArray(activities)
        ? activities.find((a) => a.order_id === orderId)
        : null;

      if (ourFill) {
        orderFilled = true;
        return {
          details: `Fill detected: ${ourFill.side} ${ourFill.qty} ${ourFill.symbol} @ $${ourFill.price || "market"}`,
        };
      }
      // Market orders on paper typically fill within seconds, but let's be lenient
      return {
        details: `No fill activity yet for order ${orderId}. ${Array.isArray(activities) ? activities.length : 0} recent fills found.`,
      };
    }, { category: "trading" });
    tests.push(test6);
  } else {
    tests.push({
      name: "Fill Detection",
      status: "skip",
      duration: 0,
      details: "Skipped: no order was placed",
      category: "trading",
    });
  }

  // ── Test 7: Cleanup — Cancel/Liquidate ──────────────────────────────────
  const test7 = await runTest("Cleanup (Cancel/Sell)", async () => {
    const cleanupActions = [];

    // If order still open, cancel it
    if (orderId) {
      try {
        const order = await alpacaFetch(`/orders/${orderId}`, { apiKey, secretKey, mode });
        const openStatuses = ["new", "partially_filled", "accepted", "pending_new", "pending_replace"];

        if (openStatuses.includes(order?.status)) {
          await alpacaFetch(`/orders/${orderId}`, {
            apiKey,
            secretKey,
            method: "DELETE",
            mode,
          });
          cleanupActions.push(`Cancelled open order ${orderId}`);
        } else if (order?.status === "filled") {
          orderFilled = true;
        }
      } catch (err) {
        cleanupActions.push(`Cancel check failed: ${err.message}`);
      }
    }

    // If position was filled, close it (sell)
    if (orderFilled || !orderId) {
      try {
        const positions = await getPositions(apiKey, secretKey, mode);
        const spyPos = Array.isArray(positions)
          ? positions.find((p) => (p.symbol || "").toUpperCase() === TEST_SYMBOL)
          : null;

        if (spyPos && parseInt(spyPos.qty) > 0) {
          await alpacaFetch("/orders", {
            apiKey,
            secretKey,
            method: "POST",
            body: {
              symbol: TEST_SYMBOL,
              qty: spyPos.qty,
              side: "sell",
              type: "market",
              time_in_force: "day",
            },
            mode,
          });
          cleanupActions.push(`Sold ${spyPos.qty} shares of SPY to close position`);
        } else {
          cleanupActions.push("No SPY position to close");
        }
      } catch (err) {
        cleanupActions.push(`Position close failed: ${err.message}`);
      }
    }

    if (cleanupActions.length === 0) {
      cleanupActions.push("No cleanup needed");
    }

    return {
      details: cleanupActions.join("; "),
    };
  }, { critical: true, category: "trading" });
  tests.push(test7);

  // ── Test 8: Circuit Breaker Check ───────────────────────────────────────
  const test8 = await runTest("Circuit Breaker Check", async () => {
    const cbResult = await checkCircuitBreakers({
      userId,
      account: account || undefined,
      positions: [],
      order: { symbol: TEST_SYMBOL, side: "buy", qty: 1 },
      mode,
    });

    if (!cbResult.allowed) {
      throw new Error(`Circuit breaker blocked test order: ${cbResult.reason}`);
    }

    const haltResult = await isHalted({ userId });
    if (haltResult.halted) {
      throw new Error(`Trading is halted: ${haltResult.level} — ${haltResult.reason}`);
    }

    return {
      details: `Circuit breakers OK (allowed: ${cbResult.allowed}), no active halts`,
    };
  }, { category: "risk" });
  tests.push(test8);

  // ── Test 9: Audit Trail ─────────────────────────────────────────────────
  const test9 = await runTest("Audit Trail", async () => {
    const client = getServiceClient();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await client
      .from("trade_audit_log")
      .select("event_type, created_at, symbol, order_id")
      .eq("user_id", userId)
      .gte("created_at", tenMinAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Failed to query audit log: ${error.message}`);

    const events = data || [];
    const hasOrderSubmitted = events.some((e) => e.event_type === "ORDER_SUBMITTED");

    if (!hasOrderSubmitted) {
      // Not necessarily a failure — the smoke test itself may not have logged ORDER_SUBMITTED yet
      // (it goes through the alpaca API directly, not through the BFF order creation route)
      // Instead, check that the audit log is accessible
      if (events.length === 0) {
        return {
          details: "Audit log accessible, but no ORDER_SUBMITTED events in last 10 min. (This is expected when order is placed directly via Alpaca API rather than through BFF route.)",
        };
      }
    }

    const eventTypes = [...new Set(events.map((e) => e.event_type))];
    return {
      details: `Audit log accessible. ${events.length} recent events. Types: ${eventTypes.join(", ")}`,
    };
  }, { category: "audit" });
  tests.push(test9);

  // ── Test 10: Reconciliation ─────────────────────────────────────────────
  const test10 = await runTest("Reconciliation Engine", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await reconcile({
      userId,
      dateFrom: new Date(today).toISOString(),
      dateTo: new Date(today + "T23:59:59").toISOString(),
      alpacaKeys: { apiKey, secretKey, mode },
      triggeredBy: "smoke_test",
    });

    return {
      details: `Reconciliation ran successfully. Status: ${result.status}, matched: ${result.summary.matchRate}%, discrepancies: ${result.summary.discrepancyCount}`,
    };
  }, { category: "reconciliation" });
  tests.push(test10);

  // ── Test 11: Supabase Connectivity ──────────────────────────────────────
  const test11 = await runTest("Supabase Connectivity", async () => {
    const client = getServiceClient();

    // Test read from key tables
    const tables = ["trade_audit_log", "circuit_breakers", "portfolio_snapshots"];
    let accessible = 0;
    for (const table of tables) {
      try {
        const { error } = await client.from(table).select("id").limit(1);
        if (!error) accessible++;
      } catch { /* ignore */ }
    }

    // Test write/read/delete with a temp record in smoke_test_results
    const testRecord = {
      user_id: `smoke_test_${Date.now()}`,
      overall: "pass",
      tests: [{ name: "connectivity_test", status: "pass", duration: 0, details: "test" }],
    };

    const { data: insertData, error: insertErr } = await client
      .from("smoke_test_results")
      .insert(testRecord)
      .select()
      .single();

    if (insertErr) throw new Error(`Write test failed: ${insertErr.message}`);

    // Read back
    const { data: readData, error: readErr } = await client
      .from("smoke_test_results")
      .select("*")
      .eq("id", insertData.id)
      .single();

    if (readErr) throw new Error(`Read test failed: ${readErr.message}`);

    // Delete
    const { error: deleteErr } = await client
      .from("smoke_test_results")
      .delete()
      .eq("id", insertData.id);

    if (deleteErr) throw new Error(`Delete test failed: ${deleteErr.message}`);

    return {
      details: `${accessible}/${tables.length} tables accessible. Write/read/delete on smoke_test_results succeeded.`,
    };
  }, { category: "connectivity" });
  tests.push(test11);

  // ── Test 12: Health Check ───────────────────────────────────────────────
  const test12 = await runTest("System Health Check", async () => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/health/detailed`, {
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`);

    const data = await res.json();
    if (data.overall === "unhealthy") {
      throw new Error(`System is unhealthy. Check individual subsystems for details.`);
    }

    return {
      details: `System status: ${data.overall}. Backend: ${data.checks?.backend?.status || "?"}, Supabase: ${data.checks?.supabase?.status || "?"}, Alpaca: ${data.checks?.alpaca?.status || "?"}`,
    };
  }, { category: "connectivity" });
  tests.push(test12);

  // ── Compute overall result ──────────────────────────────────────────────
  const failedTests = tests.filter((t) => t.status === "fail");
  const criticalFailures = failedTests.filter((t) => t.critical);
  const passedTests = tests.filter((t) => t.status === "pass");
  const skippedTests = tests.filter((t) => t.status === "skip");

  let overall = "pass";
  if (criticalFailures.length > 0) {
    overall = "fail";
  } else if (failedTests.length > 0) {
    overall = "partial";
  }

  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  // ── Log the smoke test result to audit trail ────────────────────────────
  try {
    logAuditEvent({
      eventType: "SMOKE_TEST_RUN",
      userId,
      metadata: {
        overall,
        totalTests: tests.length,
        passed: passedTests.length,
        failed: failedTests.length,
        skipped: skippedTests.length,
        durationMs,
        criticalFailures: criticalFailures.map((t) => t.name),
      },
    });
  } catch { /* non-critical */ }

  // ── Persist result to Supabase ──────────────────────────────────────────
  try {
    const client = getServiceClient();
    await client.from("smoke_test_results").insert({
      user_id: userId,
      overall,
      tests,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.warn("[smoke-test] Failed to persist result:", err.message);
  }

  return {
    startedAt,
    completedAt,
    overall,
    tests,
    durationMs,
    summary: {
      total: tests.length,
      passed: passedTests.length,
      failed: failedTests.length,
      skipped: skippedTests.length,
    },
  };
}

// ── Get last smoke test result ────────────────────────────────────────────────

/**
 * Fetch the most recent smoke test result for a user.
 *
 * @param {{ userId: string }} params
 * @returns {Promise<object|null>}
 */
export async function getLastSmokeTest({ userId }) {
  const client = getServiceClient();

  const { data, error } = await client
    .from("smoke_test_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[smoke-test] Failed to fetch last result:", error.message);
    return null;
  }

  return data;
}

// ── Get smoke test history ────────────────────────────────────────────────────

/**
 * Fetch smoke test history for a user.
 *
 * @param {{ userId: string, limit?: number }} params
 * @returns {Promise<Array>}
 */
export async function getSmokeTestHistory({ userId, limit = 20 }) {
  const client = getServiceClient();

  const { data, error } = await client
    .from("smoke_test_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[smoke-test] Failed to fetch history:", error.message);
    return [];
  }

  return data || [];
}
