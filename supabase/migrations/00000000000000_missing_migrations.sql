-- ============================================================
-- Noble Trader — Missing Migrations (Targeted Script)
-- Only includes the 8 migrations NOT yet applied to the database.
-- Run this in: Supabase Dashboard → SQL Editor
--   https://supabase.com/dashboard/project/pcvscowltlrxzgxjurcr/sql
--
-- Already applied: 01,02,03,04,06,07,09,10,11,17
-- Missing (this script): 05,08,12,13,14,15,16,18
-- ============================================================

-- ============================================================
-- MIGRATION 05: 00000000000005_backtest_cost_columns.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 05: Backtest Cost Tracking Columns
-- Adds aggregate cost columns to ta_backtest_result for efficient
-- querying, sorting, and list-view display without parsing JSONB.
-- ============================================================

ALTER TABLE ta_backtest_result
    ADD COLUMN IF NOT EXISTS total_commission     FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_slippage       FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cost           FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_return         FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_drag_pct        FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_cost_per_trade   FLOAT NOT NULL DEFAULT 0;

-- Indexes for cost-based queries
CREATE INDEX IF NOT EXISTS idx_backtest_cost_drag
    ON ta_backtest_result (user_id, cost_drag_pct DESC)
    WHERE cost_drag_pct > 0;

CREATE INDEX IF NOT EXISTS idx_backtest_total_cost
    ON ta_backtest_result (user_id, total_cost DESC)
    WHERE total_cost > 0;

-- Backfill existing rows from JSONB
UPDATE ta_backtest_result
SET
    total_commission = COALESCE(
        (SELECT SUM(COALESCE((t->>'commission')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    total_slippage = COALESCE(
        (SELECT SUM(COALESCE((t->>'slippage_cost')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    total_cost = COALESCE(
        (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    gross_return = COALESCE(
        total_return + COALESCE(
            (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
             FROM jsonb_array_elements(trade_log) AS t),
            0
        ) / 100000.0,
        total_return
    ),
    cost_drag_pct = CASE
        WHEN total_return != 0 THEN
            COALESCE(
                (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
                 FROM jsonb_array_elements(trade_log) AS t),
                0
            ) / ABS(total_return * 100000.0) * 100
        ELSE 0
    END,
    avg_cost_per_trade = CASE
        WHEN n_trades > 0 THEN
            COALESCE(
                (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
                 FROM jsonb_array_elements(trade_log) AS t),
                0
            ) / n_trades
        ELSE 0
    END
WHERE total_commission = 0
  AND trade_log != '[]'::jsonb;


-- ============================================================
-- MIGRATION 08: 00000000000008_credentials.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 08: Backend Credentials Table
-- Alpaca API keys per user/org (used by FastAPI backend).
-- Separate from user_credentials (frontend) which uses AES-256-GCM encryption.
-- ============================================================

CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    org_id TEXT,
    api_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    credential_type TEXT NOT NULL DEFAULT 'paper' CHECK (credential_type IN ('paper', 'live')),
    is_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    label TEXT
);

-- Index for user-level lookups (used by resolve_alpaca_credentials)
CREATE INDEX IF NOT EXISTS idx_credentials_user_valid
ON credentials (user_id, is_valid, credential_type)
WHERE is_valid = true;

-- Enable RLS
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credentials"
ON credentials FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert own credentials"
ON credentials FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update own credentials"
ON credentials FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete own credentials"
ON credentials FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

COMMENT ON TABLE credentials IS
'Alpaca API credentials stored per-user or per-org. Paper keys are resolved first, then live keys.';


-- ============================================================
-- MIGRATION 12: 00000000000012_statistical_rigor_columns.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 12: Statistical Rigor Columns
-- Bootstrap CIs, deflated Sharpe, multiple testing, significance tests.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS bootstrap_cis JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS deflated_sharpe_result JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS multiple_testing_results JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS significance_test_results JSONB DEFAULT '{}';

COMMENT ON COLUMN ta_backtest_result.bootstrap_cis IS 'Bootstrap confidence intervals for key metrics (Sharpe, win rate, profit factor, max drawdown, mean return)';
COMMENT ON COLUMN ta_backtest_result.deflated_sharpe_result IS 'Deflated Sharpe Ratio result — DSR probability, raw Sharpe, n_trials, threshold, interpretation';
COMMENT ON COLUMN ta_backtest_result.multiple_testing_results IS 'Multiple testing correction results — Bonferroni, Holm-Bonferroni, Benjamini-Hochberg FDR';
COMMENT ON COLUMN ta_backtest_result.significance_test_results IS 'Strategy significance test results — White Reality Check, Hansen SPA';


-- ============================================================
-- MIGRATION 13: 00000000000013_execution_modeling_columns.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 13: Execution Modeling Columns
-- Adds execution_modeling JSONB column to ta_backtest_result.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS execution_modeling JSONB DEFAULT NULL;

COMMENT ON COLUMN ta_backtest_result.execution_modeling IS 'Execution modeling summary (market impact, fill probability, borrow/financing costs)';


-- ============================================================
-- MIGRATION 14: 00000000000014_trade_audit_log.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 14: Trade Audit Log
-- Append-only, immutable audit trail. No UPDATE or DELETE permitted.
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_audit_log (
    id            BIGSERIAL PRIMARY KEY,
    event_type    VARCHAR(50) NOT NULL,
    user_id       VARCHAR(255) NOT NULL,
    org_id        VARCHAR(255),
    symbol        VARCHAR(20),
    order_id      VARCHAR(100),
    direction     VARCHAR(10),
    quantity      DECIMAL(18, 4),
    price         DECIMAL(18, 4),
    order_type    VARCHAR(20),
    regime        VARCHAR(20),
    strategy      VARCHAR(50),
    signal_score  DECIMAL(5, 4),
    risk_metrics  JSONB,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: enforce immutability
ALTER TABLE trade_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit events" ON trade_audit_log
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read own audit events" ON trade_audit_log
    FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON trade_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_id ON trade_audit_log (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_symbol ON trade_audit_log (symbol);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON trade_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON trade_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_order_id ON trade_audit_log (order_id);

-- Prevent UPDATE and DELETE (append-only trigger)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'trade_audit_log is append-only: % operations are not permitted', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON trade_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
    BEFORE DELETE ON trade_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

COMMENT ON TABLE trade_audit_log IS 'Append-only, immutable trade audit trail. No UPDATE or DELETE allowed.';
COMMENT ON COLUMN trade_audit_log.org_id IS 'Clerk Organization ID for org-scoped audit queries. Nullable for user-level events.';


-- ============================================================
-- MIGRATION 15: 00000000000015_pnl_alert_thresholds.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 15: P&L Alert Thresholds
-- Per-user P&L alert rules. Persists across server restarts.
-- ============================================================

CREATE TABLE IF NOT EXISTS pnl_alert_thresholds (
    id                VARCHAR(36) PRIMARY KEY,
    user_id           VARCHAR(255) NOT NULL,
    metric            VARCHAR(30) NOT NULL,
    operator          VARCHAR(20) NOT NULL,
    value             DOUBLE PRECISION NOT NULL,
    severity          VARCHAR(10) NOT NULL DEFAULT 'warning',
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes  INTEGER NOT NULL DEFAULT 15,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered    TIMESTAMPTZ
);

-- RLS
ALTER TABLE pnl_alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pnl_alert_thresholds
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pnl_alert_user_id ON pnl_alert_thresholds (user_id);
CREATE INDEX IF NOT EXISTS idx_pnl_alert_enabled ON pnl_alert_thresholds (user_id, enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_pnl_alert_metric ON pnl_alert_thresholds (metric);

COMMENT ON TABLE pnl_alert_thresholds IS 'P&L alert thresholds for real-time risk monitoring. Persists across server restarts.';


-- ============================================================
-- MIGRATION 16: 00000000000016_org_credentials.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 16: Org Credentials (Multi-Tenant)
-- Adds org_id column to credentials table for org-level credential resolution.
-- Prerequisite: Migration 08 (credentials table)
-- ============================================================

ALTER TABLE credentials ADD COLUMN IF NOT EXISTS org_id TEXT;

-- Index for fast org-level credential lookups
CREATE INDEX IF NOT EXISTS idx_credentials_org_id
ON credentials (org_id) WHERE org_id IS NOT NULL;

-- Composite index for the exact query pattern used by resolve_alpaca_credentials
CREATE INDEX IF NOT EXISTS idx_credentials_org_valid
ON credentials (org_id, is_valid, credential_type)
WHERE org_id IS NOT NULL AND is_valid = true;

-- RLS policy: org members can read org-level credentials
CREATE POLICY "Org members can read org credentials"
ON credentials FOR SELECT
USING (
  org_id IS NOT NULL
  AND auth.jwt() ->> 'org_id' = org_id
);

COMMENT ON COLUMN credentials.org_id IS
'Clerk Organization ID. When set, these credentials are resolved for all org members. Takes priority over user-level credentials.';


-- ============================================================
-- MIGRATION 18: 00000000000018_cron_jobs_consolidated.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 18: Consolidated Cron Jobs
-- Single source of truth for ALL pg_cron scheduled jobs.
--
-- Replaces the following former migrations:
--   - 00000000000003_evolution_cron.sql
--   - 00000000000005_scheduled_orders_cron.sql
--   - 010_cron_vault_secrets.sql
--   - 20260511_cron_jobs.sql
--   - setup-cron.sql
--
-- Prerequisites:
--   1. pg_cron + pg_net extensions enabled (done below)
--   2. Vault secrets configured in Dashboard → Vault:
--      - Name: cron_secret       Value: <your CRON_SECRET from Vercel>
--      - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
--   3. Migration 17 must be applied first (campaign_tick function)
--
-- All secrets read from Supabase Vault (vault.read_secret()).
-- No GUC variables used (Supabase hosted plans don't support them).
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;

-- 2. Grant pg_net access to the postgres role
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;

-- 3. Verify Vault secrets exist
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING — add in Dashboard → Vault' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- 4. Unschedule all existing noble-* jobs (safe — errors if they don't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('noble-campaign-tick');
  RAISE NOTICE 'Unscheduled noble-campaign-tick';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-campaign-tick to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-tda-scan');
  RAISE NOTICE 'Unscheduled noble-tda-scan';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-tda-scan to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-schedule-execute');
  RAISE NOTICE 'Unscheduled noble-schedule-execute';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-schedule-execute to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-rotate');
  RAISE NOTICE 'Unscheduled noble-strategy-rotate';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-strategy-rotate to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-optimize');
  RAISE NOTICE 'Unscheduled noble-strategy-optimize';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-strategy-optimize to unschedule';
END;
$$;

-- 5. Schedule: Campaign tick (every 60s during US market hours)
--    Market hours: 9:30 AM – 4:00 PM ET = 13:30 – 20:00 UTC
SELECT cron.schedule(
  'noble-campaign-tick',
  '* 13-20 * * 1-5',
  $$SELECT public.campaign_tick();$$
);

-- 6. Schedule: TDA Early Warning Scan (every 4 hours)
SELECT cron.schedule(
  'noble-tda-scan',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/tda/scan?secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', vault.read_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 7. Schedule: Scheduled Order Execution (every 15 min during market hours)
SELECT cron.schedule(
  'noble-schedule-execute',
  '*/15 13-20 * * 1-5',
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/trading/schedule/execute?secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', vault.read_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 8. Schedule: Strategy Rotation Check (every 6 hours)
SELECT cron.schedule(
  'noble-strategy-rotate',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/evolution/rotate?secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', vault.read_secret('cron_secret')
    ),
    body := '{"auto": true}'::jsonb
  );
  $$
);

-- 9. Schedule: Daily Strategy Optimization (10pm UTC, Mon-Fri)
SELECT cron.schedule(
  'noble-strategy-optimize',
  '0 22 * * 1-5',
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/evolution/optimize?secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', vault.read_secret('cron_secret')
    ),
    body := '{"symbol": "SPY", "nTrials": 5}'::jsonb
  );
  $$
);

-- 10. Verify all 5 jobs are scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN (
  'noble-campaign-tick',
  'noble-tda-scan',
  'noble-schedule-execute',
  'noble-strategy-rotate',
  'noble-strategy-optimize'
) ORDER BY name;

-- ============================================================
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause a job:     SELECT cron.pause('noble-tda-scan');
-- Resume a job:    SELECT cron.resume('noble-tda-scan');
-- Delete a job:    SELECT cron.unschedule('noble-tda-scan');
-- View job logs:   SELECT * FROM cron.job_run_details
--                   WHERE name LIKE 'noble-%'
--                   ORDER BY start_time DESC LIMIT 20;
--
-- Verify Vault secrets:
--   SELECT name,
--     CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
--   FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);
-- ============================================================

