# P3-5E: Paper Trading E2E Smoke Test

## Task Summary
Implemented a comprehensive end-to-end smoke test that validates the ENTIRE trade lifecycle from analysis to reconciliation. This is a BFF route that runs automated checks, triggered from the UI.

## Files Created

1. **`src/lib/smoke-test.js`** — Core smoke test engine
   - 12 sequential tests covering full trade lifecycle
   - Test 1: Alpaca Connectivity (account status, ACTIVE check)
   - Test 2: Order Creation (buy 1 SPY market order)
   - Test 3: Order Retrieval (verify order exists)
   - Test 4: Position Check (verify SPY position)
   - Test 5: Portfolio History (verify data returned)
   - Test 6: Fill Detection (verify fill activity)
   - Test 7: Cleanup (cancel open orders, close positions)
   - Test 8: Circuit Breaker Check (verify allowed=true, no halts)
   - Test 9: Audit Trail (verify trade_audit_log accessible)
   - Test 10: Reconciliation (run reconcile() for today)
   - Test 11: Supabase Connectivity (read/write/delete test)
   - Test 12: System Health Check (call /api/health/detailed)
   - Computes overall result: pass/partial/fail
   - Persists results to smoke_test_results table
   - Logs to audit trail via logAuditEvent()

2. **`src/app/api/smoke-test/route.js`** — BFF route
   - POST: Run smoke test (admin+ only, rate limited 3/5min)
   - GET: Get last result + history (viewer+)
   - Uses withAuth() middleware
   - Resolves Alpaca paper trading keys via getAlpacaCredentialKeys()

3. **`supabase/migrations/00000000000023_smoke_test.sql`** — Migration
   - Creates smoke_test_results table with RLS
   - Indexes on user_id, created_at, overall
   - Applied to production Supabase successfully

4. **`src/components/operational/SmokeTestPanel.jsx`** — UI Component
   - "Run Full Test" button (admin-only)
   - Progress indicator with loading state
   - Overall status hero: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
   - Test-by-test results with pass/fail badges and expandable details
   - Failed tests highlighted with error messages
   - Tests grouped by category: Connectivity, Trading, Risk, Audit, Reconciliation
   - History tab with past smoke test results
   - Recommendation card with actionable advice for failed tests
   - DaisyUI styling consistent with existing components

5. **`src/components/operational/OperationalPage.jsx`** — Updated
   - Added SmokeTestPanel import and component
   - Placed after Reconciliation + Audit Log row

## Key Design Decisions
- Paper trading ONLY — mode hardcoded to "paper"
- Self-cleaning: cancels open orders, sells filled positions after test
- Critical tests (1, 2, 7) trigger overall "fail" if they fail
- Rate limited to 3 runs per 5 minutes to prevent abuse
- Uses existing alpacaFetch() for direct API calls
- Uses checkCircuitBreakers() and isHalted() from circuit-breaker.js
- Uses reconcile() from reconciliation.js
- Fire-and-forget audit logging (non-blocking)
