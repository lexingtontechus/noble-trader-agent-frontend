-- Migration 26: Multi-Tenant Isolation — org_id columns + RLS policies
-- Adds org_id to all user-scoped tables and creates org-scoped RLS policies.
-- All columns are nullable for backward compatibility (single-user mode).

-- ── Add org_id columns ───────────────────────────────────────────────────────

ALTER TABLE ta_analysis_run ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE ta_scheduled_order ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE trade_campaign ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE campaign_trades ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE circuit_breakers ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE pnl_alert_thresholds ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE trading_halts ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE rate_limit_violations ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE smoke_test_results ADD COLUMN IF NOT EXISTS org_id TEXT;

-- ── Partial indexes for org-scoped queries ────────────────────────────────────
-- Use regular indexes (not CONCURRENTLY — can't run in transaction)

CREATE INDEX IF NOT EXISTS idx_taa_org_id ON ta_analysis_run (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tso_org_id ON ta_scheduled_order (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tbr_org_id ON ta_backtest_result (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tc_org_id ON trade_campaign (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ct_org_id ON campaign_trades (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cb_org_id ON circuit_breakers (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ps_org_id ON portfolio_snapshots (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rr_org_id ON reconciliation_results (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rlv_org_id ON rate_limit_violations (org_id) WHERE org_id IS NOT NULL;

-- ── Org-scoped RLS policies ──────────────────────────────────────────────────
-- These policies allow org members to access org-scoped data.
-- They work alongside existing user-scoped policies (OR logic in RLS).
-- For these to work with user-scoped JWTs, the JWT must include org_id claim.
-- Currently, service role bypasses RLS, so these are defense-in-depth.

-- trade_audit_log: add org-scoped SELECT policy (org_id column already exists)
DO $$ BEGIN
  CREATE POLICY "Org members can read org audit logs"
    ON trade_audit_log FOR SELECT
    USING (
      org_id IS NOT NULL
      AND auth.jwt() ->> 'org_id' = org_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- circuit_breakers: org-scoped access
DO $$ BEGIN
  CREATE POLICY "Org members can read org circuit breakers"
    ON circuit_breakers FOR SELECT
    USING (
      org_id IS NOT NULL
      AND auth.jwt() ->> 'org_id' = org_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- portfolio_snapshots: org-scoped access
DO $$ BEGIN
  CREATE POLICY "Org members can read org portfolio snapshots"
    ON portfolio_snapshots FOR SELECT
    USING (
      org_id IS NOT NULL
      AND auth.jwt() ->> 'org_id' = org_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reconciliation_results: org-scoped access
DO $$ BEGIN
  CREATE POLICY "Org members can read org reconciliation results"
    ON reconciliation_results FOR SELECT
    USING (
      org_id IS NOT NULL
      AND auth.jwt() ->> 'org_id' = org_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
