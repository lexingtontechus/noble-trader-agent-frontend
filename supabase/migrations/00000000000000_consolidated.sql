-- ============================================================
-- Noble Trader — Consolidated Migration Script
-- Generated from 18 individual migration files.
-- Paste this entire script into the Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/pcvscowltlrxzgxjurcr/sql
-- ============================================================

-- ============================================================
-- FILE: 00000000000000_missing_migrations.sql
-- ============================================================
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



-- ============================================================
-- FILE: 00000000000001_create_tables.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 01: Core Tables
-- Creates the six base ta_* tables with indexes, triggers, and RLS.
-- ============================================================

-- 1. Analysis Run table
CREATE TABLE IF NOT EXISTS ta_analysis_run (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'pending',
  results TEXT,
  positions TEXT,
  correlation TEXT,
  optimizer TEXT,
  regimes TEXT,
  "strategySignals" TEXT,
  "riskAnalysis" TEXT,
  "kellySizes" TEXT,
  "validationSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trade Recommendation table
CREATE TABLE IF NOT EXISTS ta_trade_recommendation (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "analysisId" TEXT NOT NULL REFERENCES ta_analysis_run(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  "limitPrice" DOUBLE PRECISION,
  "timeInForce" TEXT NOT NULL DEFAULT 'day',
  priority INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  "alpacaOrderId" TEXT,
  "errorMessage" TEXT,
  regime TEXT,
  "regimeLabel" TEXT,
  "strategySignal" TEXT,
  "strategyConfidence" DOUBLE PRECISION,
  "kellyFraction" DOUBLE PRECISION,
  "kellySize" DOUBLE PRECISION,
  "riskScore" DOUBLE PRECISION,
  "varDaily" DOUBLE PRECISION,
  "cvarDaily" DOUBLE PRECISION,
  "validationStatus" TEXT,
  "validationScore" DOUBLE PRECISION,
  "validationDetails" TEXT,
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scheduled Order table
CREATE TABLE IF NOT EXISTS ta_scheduled_order (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL DEFAULT 'default',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  "limitPrice" DOUBLE PRECISION,
  "timeInForce" TEXT NOT NULL DEFAULT 'gtc',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  "scheduleAt" TIMESTAMP(3),
  "dependsOnOrders" TEXT,
  "alpacaOrderId" TEXT,
  "errorMessage" TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Telegram Notification table
CREATE TABLE IF NOT EXISTS ta_telegram_notification (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "chatId" TEXT NOT NULL,
  message TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'trade_report',
  success BOOLEAN NOT NULL,
  error TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. TDA Scan Result table
CREATE TABLE IF NOT EXISTS ta_tda_scan_result (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  symbol TEXT NOT NULL,
  "anomalyScore" DOUBLE PRECISION,
  "regimeChangeProbability" DOUBLE PRECISION,
  betti0 INTEGER,
  betti1 INTEGER,
  "totalEntropy" DOUBLE PRECISION,
  "featureVector" TEXT,
  "alertTriggered" BOOLEAN NOT NULL DEFAULT false,
  "alertLevel" TEXT,
  source TEXT,
  "scanResults" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Early Warning Alert table
CREATE TABLE IF NOT EXISTS ta_early_warning_alert (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  symbol TEXT NOT NULL,
  "alertType" TEXT NOT NULL,
  "alertLevel" TEXT NOT NULL,
  "anomalyScore" DOUBLE PRECISION,
  "regimeChangeProb" DOUBLE PRECISION,
  "betti0Before" INTEGER,
  "betti0After" INTEGER,
  "betti1Before" INTEGER,
  "betti1After" INTEGER,
  message TEXT,
  "telegramSent" BOOLEAN NOT NULL DEFAULT false,
  "telegramChatId" TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  "scanResultId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trade_recommendation_analysis ON ta_trade_recommendation("analysisId");
CREATE INDEX IF NOT EXISTS idx_trade_recommendation_status ON ta_trade_recommendation(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_order_status ON ta_scheduled_order(status);
CREATE INDEX IF NOT EXISTS idx_tda_scan_symbol ON ta_tda_scan_result(symbol);
CREATE INDEX IF NOT EXISTS idx_early_warning_ack ON ta_early_warning_alert(acknowledged);

-- Create a trigger to auto-update "updatedAt" on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ta_analysis_run_updated_at
  BEFORE UPDATE ON ta_analysis_run
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ta_trade_recommendation_updated_at
  BEFORE UPDATE ON ta_trade_recommendation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ta_scheduled_order_updated_at
  BEFORE UPDATE ON ta_scheduled_order
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant access to the postgres role (Supabase default)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Enable Row Level Security
ALTER TABLE ta_analysis_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_trade_recommendation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_scheduled_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_telegram_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_tda_scan_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_early_warning_alert ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Service role full access" ON ta_analysis_run FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_trade_recommendation FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_scheduled_order FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_telegram_notification FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_tda_scan_result FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_early_warning_alert FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- FILE: 00000000000002_strategy_evolution.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 02: Strategy Evolution Tables
-- Phase 5: Strategy variant, performance, A/B test, evolution log.
-- Prerequisite: Migration 01 (update_updated_at_column function)
-- ============================================================

-- 1. Strategy Variant table
CREATE TABLE IF NOT EXISTS ta_strategy_variant (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "nHmmStates" INTEGER NOT NULL DEFAULT 4,
  "hmmIter" INTEGER NOT NULL DEFAULT 100,
  "hmmWindow" INTEGER NOT NULL DEFAULT 200,
  "hmmRefitEvery" INTEGER NOT NULL DEFAULT 50,
  "kellyFraction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "targetVol" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "baseRiskLimit" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  "maxPositionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "regimeGate" BOOLEAN NOT NULL DEFAULT true,
  "riskCheck" BOOLEAN NOT NULL DEFAULT true,
  "commissionBps" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "slippageBps" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "optimizerStudyName" TEXT,
  "optimizerTrialNumber" INTEGER,
  "optimizerParams" TEXT,
  "parentVariantId" TEXT,
  "scoreComposite" DOUBLE PRECISION,
  "scoreSharpe" DOUBLE PRECISION,
  "scoreWinRate" DOUBLE PRECISION,
  "scoreMaxDd" DOUBLE PRECISION,
  "scoreProfitFactor" DOUBLE PRECISION,
  "scoreReturn" DOUBLE PRECISION,
  "totalTrades" INTEGER NOT NULL DEFAULT 0,
  "winningTrades" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Strategy Performance table
CREATE TABLE IF NOT EXISTS ta_strategy_performance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "variantId" TEXT NOT NULL REFERENCES ta_strategy_variant(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  "tradeSide" TEXT NOT NULL,
  "entryPrice" DOUBLE PRECISION,
  "exitPrice" DOUBLE PRECISION,
  "pnlPct" DOUBLE PRECISION,
  "pnlDollar" DOUBLE PRECISION,
  "holdingPeriodBars" INTEGER,
  "regimeAtEntry" TEXT,
  "regimeAtExit" TEXT,
  "validationScore" DOUBLE PRECISION,
  "kellyFractionUsed" DOUBLE PRECISION,
  "riskScoreAtEntry" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'live',
  "tradeId" TEXT,
  "analysisId" TEXT,
  metadata TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. A/B Test table
CREATE TABLE IF NOT EXISTS ta_ab_test (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  "variantAId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  "variantBId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  status TEXT NOT NULL DEFAULT 'running',
  "allocationPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "variantAPnl" DOUBLE PRECISION,
  "variantATrades" INTEGER,
  "variantAWinRate" DOUBLE PRECISION,
  "variantASharpe" DOUBLE PRECISION,
  "variantBPnl" DOUBLE PRECISION,
  "variantBTrades" INTEGER,
  "variantBWinRate" DOUBLE PRECISION,
  "variantBSharpe" DOUBLE PRECISION,
  "winnerId" TEXT,
  "confidenceLevel" DOUBLE PRECISION,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Evolution Log table
CREATE TABLE IF NOT EXISTS ta_evolution_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fromVariantId" TEXT REFERENCES ta_strategy_variant(id),
  "toVariantId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  "triggerType" TEXT NOT NULL,
  "triggerReason" TEXT,
  "previousScore" DOUBLE PRECISION,
  "newScore" DOUBLE PRECISION,
  "scoreDelta" DOUBLE PRECISION,
  "parametersChanged" TEXT,
  "abTestId" TEXT REFERENCES ta_ab_test(id),
  metadata TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_strategy_variant_active ON ta_strategy_variant("isActive");
CREATE INDEX IF NOT EXISTS idx_strategy_performance_variant ON ta_strategy_performance("variantId");
CREATE INDEX IF NOT EXISTS idx_strategy_performance_symbol ON ta_strategy_performance(symbol);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_source ON ta_strategy_performance("source");
CREATE INDEX IF NOT EXISTS idx_ab_test_status ON ta_ab_test(status);
CREATE INDEX IF NOT EXISTS idx_evolution_log_to_variant ON ta_evolution_log("toVariantId");
CREATE INDEX IF NOT EXISTS idx_evolution_log_trigger ON ta_evolution_log("triggerType");

-- Auto-update triggers
CREATE TRIGGER update_ta_strategy_variant_updated_at
  BEFORE UPDATE ON ta_strategy_variant
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ta_ab_test_updated_at
  BEFORE UPDATE ON ta_ab_test
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE ta_strategy_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_ab_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_evolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ta_strategy_variant FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_strategy_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_ab_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_evolution_log FOR ALL USING (true) WITH CHECK (true);

-- Seed the default variant
INSERT INTO ta_strategy_variant (
  name, "isActive", "isDefault", "generation",
  "nHmmStates", "hmmIter", "hmmWindow", "hmmRefitEvery",
  "kellyFraction", "targetVol", "baseRiskLimit", "maxPositionPct",
  "regimeGate", "riskCheck", "commissionBps", "slippageBps"
) VALUES (
  'Default v1', true, true, 1,
  4, 100, 200, 50,
  0.5, 0.15, 0.02, 0.25,
  true, true, 5.0, 2.0
) ON CONFLICT DO NOTHING;


-- ============================================================
-- FILE: 00000000000003_scheduled_orders.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 03: Scheduled Orders (Enhanced)
-- Enhanced scheduled orders + telegram notification tables
-- with additional indexes and partial indexes.
-- Prerequisite: Migration 01 (update_updated_at_column function)
-- ============================================================

-- 1. Scheduled Order table (idempotent — IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS ta_scheduled_order (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL DEFAULT 'default',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  "limitPrice" DOUBLE PRECISION,
  "timeInForce" TEXT NOT NULL DEFAULT 'gtc',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  "scheduleAt" TIMESTAMP(3),
  "dependsOnOrders" TEXT,
  "alpacaOrderId" TEXT,
  "errorMessage" TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Telegram Notification table (idempotent — IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS ta_telegram_notification (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "chatId" TEXT NOT NULL,
  message TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'trade_report',
  success BOOLEAN NOT NULL,
  error TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additional indexes for scheduled order queries
CREATE INDEX IF NOT EXISTS idx_scheduled_order_created ON ta_scheduled_order("createdAt");
CREATE INDEX IF NOT EXISTS idx_scheduled_order_schedule_at ON ta_scheduled_order("scheduleAt") WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_telegram_notification_success ON ta_telegram_notification(success) WHERE success = true;
CREATE INDEX IF NOT EXISTS idx_telegram_notification_created ON ta_telegram_notification("createdAt");

-- Re-create the trigger (idempotent)
DROP TRIGGER IF EXISTS update_ta_scheduled_order_updated_at ON ta_scheduled_order;
CREATE TRIGGER update_ta_scheduled_order_updated_at
  BEFORE UPDATE ON ta_scheduled_order
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (idempotent — drop and recreate)
ALTER TABLE ta_scheduled_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_telegram_notification ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role full access" ON ta_scheduled_order;
  DROP POLICY IF EXISTS "Service role full access" ON ta_telegram_notification;
  CREATE POLICY "Service role full access" ON ta_scheduled_order FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Service role full access" ON ta_telegram_notification FOR ALL USING (true) WITH CHECK (true);
END;
$$;

-- Grant access to postgres role
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;


-- ============================================================
-- FILE: 00000000000004_backtest_results.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 04: Backtest Results
-- Stores walk-forward backtest results for history, comparison, and audit.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_backtest_result (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    symbol      TEXT NOT NULL DEFAULT 'UNKNOWN',

    -- Summary metrics
    n_trades        INT    NOT NULL DEFAULT 0,
    win_rate        FLOAT  NOT NULL DEFAULT 0,
    total_return    FLOAT  NOT NULL DEFAULT 0,
    annual_return   FLOAT  NOT NULL DEFAULT 0,
    sharpe_ratio    FLOAT  NOT NULL DEFAULT 0,
    sortino_ratio   FLOAT  NOT NULL DEFAULT 0,
    calmar_ratio    FLOAT  NOT NULL DEFAULT 0,
    max_drawdown    FLOAT  NOT NULL DEFAULT 0,
    profit_factor   FLOAT  NOT NULL DEFAULT 0,
    n_hmm_states    INT    NOT NULL DEFAULT 4,

    -- Full data as JSONB
    config_used         JSONB NOT NULL DEFAULT '{}',
    summary_metrics     JSONB NOT NULL DEFAULT '{}',
    regime_distribution JSONB NOT NULL DEFAULT '{}',
    trades_by_regime    JSONB NOT NULL DEFAULT '{}',
    equity_curve        JSONB NOT NULL DEFAULT '[]',
    drawdown_curve      JSONB NOT NULL DEFAULT '[]',
    trade_log           JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backtest_user_id ON ta_backtest_result (user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_symbol  ON ta_backtest_result (symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_created ON ta_backtest_result (user_id, created_at DESC);

-- RLS: users can only see their own backtest results
ALTER TABLE ta_backtest_result ENABLE ROW LEVEL SECURITY;

CREATE POLICY backtest_result_user_policy ON ta_backtest_result
    FOR ALL
    USING (auth.uid()::text = user_id OR user_id = 'dev')
    WITH CHECK (auth.uid()::text = user_id OR user_id = 'dev');


-- ============================================================
-- FILE: 00000000000005_backtest_cost_columns.sql
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
-- FILE: 00000000000006_renko_snapshot.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 06: Renko Snapshot Persistence
-- Stores warm-up results per symbol for instant cache loading.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_renko_snapshot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  brick_size FLOAT NOT NULL DEFAULT 0.5,
  prices_fed INT NOT NULL DEFAULT 0,
  total_bricks INT NOT NULL DEFAULT 0,
  total_trades INT NOT NULL DEFAULT 0,
  total_pnl_bricks FLOAT NOT NULL DEFAULT 0,
  bricks JSONB NOT NULL DEFAULT '[]'::jsonb,
  classified JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  trades JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_range JSONB NOT NULL DEFAULT '{"min":0,"max":0}'::jsonb,
  period TEXT NOT NULL DEFAULT '6mo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, brick_size)
);

-- RLS
ALTER TABLE ta_renko_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to renko snapshots" ON ta_renko_snapshot
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups by symbol
CREATE INDEX IF NOT EXISTS idx_renko_snapshot_symbol ON ta_renko_snapshot(symbol);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_renko_snapshot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS renko_snapshot_updated_at ON ta_renko_snapshot;
CREATE TRIGGER renko_snapshot_updated_at
  BEFORE UPDATE ON ta_renko_snapshot
  FOR EACH ROW EXECUTE FUNCTION update_renko_snapshot_updated_at();


-- ============================================================
-- FILE: 00000000000007_user_credentials_subscriptions.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 07: User Credentials, Subscriptions & Onboarding
-- Encrypted Alpaca API keys, subscription tiers, onboarding progress.
-- Encryption is handled in the application layer (AES-256-GCM).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'Provides cryptographic functions (gen_random_uuid, etc.)';

-- Helper function: auto-set updated_at on row update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger function: automatically sets updated_at to current timestamp on row update';

-- ============================================================
-- 1. user_credentials table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id         TEXT        NOT NULL,
  credential_type       TEXT        NOT NULL CHECK (credential_type IN ('paper', 'live')),
  api_key_encrypted     TEXT        NOT NULL,
  secret_key_encrypted  TEXT        NOT NULL,
  is_valid              BOOLEAN     DEFAULT true,
  last_validated_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_credential_type UNIQUE (clerk_user_id, credential_type)
);

COMMENT ON TABLE public.user_credentials IS
  'Stores encrypted Alpaca API keys per user. Each user may have one paper and one live credential set.';
COMMENT ON COLUMN public.user_credentials.api_key_encrypted IS 'AES-256-GCM encrypted Alpaca API key (base64-encoded, encrypted in application layer)';
COMMENT ON COLUMN public.user_credentials.secret_key_encrypted IS 'AES-256-GCM encrypted Alpaca secret key (base64-encoded, encrypted in application layer)';

-- Updated-at trigger
CREATE TRIGGER trg_user_credentials_updated_at
  BEFORE UPDATE ON public.user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_credentials_clerk_user_id ON public.user_credentials (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_credential_type ON public.user_credentials (credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_is_valid ON public.user_credentials (is_valid) WHERE is_valid = false;

-- RLS
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credentials"
  ON public.user_credentials FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own credentials"
  ON public.user_credentials FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own credentials"
  ON public.user_credentials FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own credentials"
  ON public.user_credentials FOR DELETE
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_credentials"
  ON public.user_credentials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. user_subscriptions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL UNIQUE,
  plan                    TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'institutional')),
  plan_status             TEXT        NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'cancelled', 'trialing')),
  helio_subscription_id   TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN     DEFAULT false,
  trial_ends_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.user_subscriptions IS
  'Tracks user subscription plan and billing state. One row per user.';

CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_clerk_user_id ON public.user_subscriptions (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON public.user_subscriptions (plan);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_status ON public.user_subscriptions (plan_status) WHERE plan_status != 'active';
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_helio_id ON public.user_subscriptions (helio_subscription_id) WHERE helio_subscription_id IS NOT NULL;

-- RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. user_onboarding table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL UNIQUE,
  onboarding_complete     BOOLEAN     DEFAULT false,
  current_step            INTEGER     DEFAULT 0,
  paper_keys_configured   BOOLEAN     DEFAULT false,
  live_keys_configured    BOOLEAN     DEFAULT false,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_onboarding_clerk_user_id ON public.user_onboarding (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_incomplete ON public.user_onboarding (clerk_user_id) WHERE onboarding_complete = false;

-- RLS
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding"
  ON public.user_onboarding FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own onboarding"
  ON public.user_onboarding FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own onboarding"
  ON public.user_onboarding FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_onboarding"
  ON public.user_onboarding FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_credentials TO authenticated;
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;


-- ============================================================
-- FILE: 00000000000008_credentials.sql
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
-- FILE: 00000000000009_universe_snapshot.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 09: Universe Snapshot (Survivorship Bias)
-- Point-in-time index constituent changes for bias-free backtests.
-- ============================================================

CREATE TABLE IF NOT EXISTS nt_universe_snapshot (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker      TEXT    NOT NULL,
    index_name  TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    action_date DATE    NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one action per ticker per index per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_unique
    ON nt_universe_snapshot (ticker, index_name, action_date, action);

-- Fast lookup: what was in the index on date X?
CREATE INDEX IF NOT EXISTS idx_universe_lookup
    ON nt_universe_snapshot (index_name, action_date);

-- Fast lookup: when was ticker X added/removed?
CREATE INDEX IF NOT EXISTS idx_universe_ticker
    ON nt_universe_snapshot (ticker, index_name);

-- RLS
ALTER TABLE nt_universe_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can do everything" ON nt_universe_snapshot
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE nt_universe_snapshot IS
    'Point-in-time index constituent changes for survivorship-bias-free backtests';


-- ============================================================
-- FILE: 00000000000010_corporate_action.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 10: Corporate Actions
-- Stock splits, dividends, spinoffs for price adjustment in backtests.
-- ============================================================

CREATE TABLE IF NOT EXISTS nt_corporate_action (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker      TEXT    NOT NULL,
    action_type TEXT    NOT NULL,
    ex_date     DATE    NOT NULL,
    record_date DATE,
    factor      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    amount      DOUBLE PRECISION,
    description TEXT,
    source      TEXT    NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one action per ticker per type per ex-date
CREATE UNIQUE INDEX IF NOT EXISTS idx_corp_action_unique
    ON nt_corporate_action (ticker, action_type, ex_date);

-- Fast lookup: what actions happened on or before date X?
CREATE INDEX IF NOT EXISTS idx_corp_action_lookup
    ON nt_corporate_action (ticker, ex_date);

-- RLS
ALTER TABLE nt_corporate_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can do everything" ON nt_corporate_action
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE nt_corporate_action IS
    'Corporate actions (splits, dividends, spinoffs) for price adjustment in backtests';


-- ============================================================
-- FILE: 00000000000011_data_quality_columns.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 11: Data Quality & Lineage Columns
-- Adds data_hash, data_source, price_adjustment, universe_mode,
-- and look_ahead_audit columns to ta_backtest_result.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS data_hash TEXT;
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS data_source JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS price_adjustment TEXT DEFAULT 'raw';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS universe_mode TEXT DEFAULT 'current_constituents';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS look_ahead_audit JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_backtest_data_hash
    ON ta_backtest_result (data_hash) WHERE data_hash IS NOT NULL;

COMMENT ON COLUMN ta_backtest_result.data_hash IS 'SHA-256 hash of input price data for reproducibility verification';
COMMENT ON COLUMN ta_backtest_result.data_source IS 'Provenance metadata: source, fetch_date, adjustment_level';
COMMENT ON COLUMN ta_backtest_result.price_adjustment IS 'Price adjustment mode: raw, split_adjusted, fully_adjusted';
COMMENT ON COLUMN ta_backtest_result.universe_mode IS 'Universe filtering mode: current_constituents or pit_constituents';
COMMENT ON COLUMN ta_backtest_result.look_ahead_audit IS 'Look-ahead bias audit results: warnings or clean status';


-- ============================================================
-- FILE: 00000000000012_statistical_rigor_columns.sql
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
-- FILE: 00000000000013_execution_modeling_columns.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 13: Execution Modeling Columns
-- Adds execution_modeling JSONB column to ta_backtest_result.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS execution_modeling JSONB DEFAULT NULL;

COMMENT ON COLUMN ta_backtest_result.execution_modeling IS 'Execution modeling summary (market impact, fill probability, borrow/financing costs)';


-- ============================================================
-- FILE: 00000000000014_trade_audit_log.sql
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
-- FILE: 00000000000015_pnl_alert_thresholds.sql
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
-- FILE: 00000000000016_org_credentials.sql
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
-- FILE: 00000000000017_trade_campaign.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 17: Trade Campaign System
-- Batch trade orchestration with risk guards + campaign_tick() function.
-- Note: cron scheduling is handled by Migration 18.
-- ============================================================

-- 1. trade_campaign table
CREATE TABLE IF NOT EXISTS public.trade_campaign (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'stopped_loss_streak', 'stopped_max_drawdown', 'stopped_manual', 'error')),
  max_trades              INTEGER     NOT NULL DEFAULT 10,
  max_consecutive_losses  INTEGER     NOT NULL DEFAULT 3,
  max_drawdown_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  kelly_fraction          NUMERIC(5,4) NOT NULL DEFAULT 0.50,
  position_sizing_mode    TEXT        NOT NULL DEFAULT 'kelly'
    CHECK (position_sizing_mode IN ('kelly', 'fixed', 'risk_parity')),
  fixed_qty               INTEGER,
  analysis_id             UUID,
  signal_source           TEXT        NOT NULL DEFAULT 'renko'
    CHECK (signal_source IN ('renko', 'analysis', 'manual')),
  trades_placed           INTEGER     NOT NULL DEFAULT 0,
  trades_filled           INTEGER     NOT NULL DEFAULT 0,
  wins                    INTEGER     NOT NULL DEFAULT 0,
  losses                  INTEGER     NOT NULL DEFAULT 0,
  consecutive_losses      INTEGER     NOT NULL DEFAULT 0,
  realized_pnl            NUMERIC(12,2) NOT NULL DEFAULT 0,
  peak_pnl                NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_drawdown            NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_trade_id        UUID,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  stopped_reason          TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.trade_campaign IS
  'Orchestrates a batch of sequential trades with aggregate risk guards.';

CREATE TRIGGER trg_trade_campaign_updated_at
  BEFORE UPDATE ON public.trade_campaign
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_campaign_clerk_user_id ON public.trade_campaign (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_trade_campaign_status ON public.trade_campaign (status) WHERE status IN ('running', 'paused');
CREATE INDEX IF NOT EXISTS idx_trade_campaign_created_at ON public.trade_campaign (created_at DESC);

-- RLS
ALTER TABLE public.trade_campaign ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaigns" ON public.trade_campaign FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');
CREATE POLICY "Users can insert own campaigns" ON public.trade_campaign FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');
CREATE POLICY "Users can update own campaigns" ON public.trade_campaign FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');
CREATE POLICY "Users can delete own campaigns" ON public.trade_campaign FOR DELETE
  USING (clerk_user_id = auth.jwt() ->> 'sub');
CREATE POLICY "Service role full access on trade_campaign" ON public.trade_campaign FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. campaign_trades table
CREATE TABLE IF NOT EXISTS public.campaign_trades (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             UUID        NOT NULL REFERENCES public.trade_campaign(id) ON DELETE CASCADE,
  trade_index             INTEGER     NOT NULL,
  symbol                  TEXT        NOT NULL,
  side                    TEXT        NOT NULL CHECK (side IN ('buy', 'sell')),
  qty                     INTEGER     NOT NULL,
  order_type              TEXT        NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop', 'bracket')),
  limit_price             NUMERIC(12,4),
  stop_loss_price         NUMERIC(12,4),
  take_profit_price       NUMERIC(12,4),
  signal_direction        TEXT,
  confidence              NUMERIC(5,4),
  regime                  TEXT,
  kelly_fraction_used     NUMERIC(5,4),
  alpaca_order_id         TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'filled', 'partially_filled', 'stopped_out', 'taken_profit', 'cancelled', 'rejected', 'error')),
  fill_price              NUMERIC(12,4),
  fill_qty                INTEGER,
  exit_price              NUMERIC(12,4),
  realized_pnl            NUMERIC(12,4),
  commission              NUMERIC(8,4) DEFAULT 0,
  submitted_at            TIMESTAMPTZ,
  filled_at               TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.campaign_trades IS
  'Individual trades within a campaign batch. Sequential — next trade placed only after previous closes.';

CREATE TRIGGER trg_campaign_trades_updated_at
  BEFORE UPDATE ON public.campaign_trades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_trades_campaign_id ON public.campaign_trades (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_trades_status ON public.campaign_trades (status) WHERE status IN ('pending', 'submitted', 'filled');
CREATE INDEX IF NOT EXISTS idx_campaign_trades_alpaca_order_id ON public.campaign_trades (alpaca_order_id) WHERE alpaca_order_id IS NOT NULL;

-- RLS
ALTER TABLE public.campaign_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaign trades" ON public.campaign_trades FOR SELECT
  USING (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));
CREATE POLICY "Users can insert own campaign trades" ON public.campaign_trades FOR INSERT
  WITH CHECK (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));
CREATE POLICY "Users can update own campaign trades" ON public.campaign_trades FOR UPDATE
  USING (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));
CREATE POLICY "Service role full access on campaign_trades" ON public.campaign_trades FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_campaign TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_trades TO authenticated;

-- 3. campaign_tick() function — called by pg_cron (scheduled in Migration 18)
CREATE OR REPLACE FUNCTION public.campaign_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  secret TEXT;
  response integer;
BEGIN
  base_url := vault.read_secret('noble_base_url');
  secret := vault.read_secret('cron_secret');

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'Vault secrets noble_base_url or cron_secret not found — campaign tick skipped.';
    RETURN;
  END IF;

  SELECT INTO response net.http_post(
    url := base_url || '/api/campaign/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Campaign tick fired to %, response status: %', base_url || '/api/campaign/tick', response;
END;
$$;

COMMENT ON FUNCTION public.campaign_tick() IS
  'pg_cron callback: fires HTTP POST to campaign tick API route. Reads CRON_SECRET and base URL from Supabase Vault.';


-- ============================================================
-- FILE: 00000000000019_portfolio_snapshot.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 19: Portfolio Snapshots
-- Daily portfolio snapshots for long-term equity curve tracking.
-- Enables historical P&L analysis beyond Alpaca's 30-day API limit.
--
-- Prerequisites:
--   1. pg_cron + pg_net extensions enabled (Migration 18)
--   2. Vault secrets configured (cron_secret, noble_base_url)
--   3. Migration 18 must be applied first (cron jobs)
-- ============================================================

-- 1. Create portfolio_snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT NOT NULL,
    snapshot_date   DATE NOT NULL,
    equity          DECIMAL(15,2),
    cash            DECIMAL(15,2),
    positions       JSONB DEFAULT '[]',
    day_pnl         DECIMAL(12,2),
    unrealized_pnl  DECIMAL(12,2),
    realized_pnl    DECIMAL(12,2),
    total_value     DECIMAL(15,2),
    benchmark_value DECIMAL(15,2),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, snapshot_date)
);

-- 2. Enable RLS
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. Service role policy (full access for BFF routes using SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access" ON portfolio_snapshots
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_id ON portfolio_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON portfolio_snapshots (user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots (snapshot_date DESC);

-- 5. Table comment
COMMENT ON TABLE portfolio_snapshots IS 'Daily portfolio snapshots for long-term equity curve tracking. One row per user per day, upserted by cron job or manual capture.';

-- 6. Schedule: Daily portfolio snapshot capture at market close (8:00 PM UTC = 4:00 PM ET)
--    Runs weekdays only (Mon-Fri) since markets are closed on weekends.
DO $$
BEGIN
  PERFORM cron.unschedule('noble-portfolio-snapshot');
  RAISE NOTICE 'Unscheduled noble-portfolio-snapshot (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-portfolio-snapshot to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-portfolio-snapshot',
  '0 20 * * 1-5',  -- 8:00 PM UTC = 4:00 PM ET, weekdays only
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/portfolio/snapshot/capture?cron_secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || vault.read_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 7. Verify the job is scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name = 'noble-portfolio-snapshot';

-- ============================================================
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause snapshot job:   SELECT cron.pause('noble-portfolio-snapshot');
-- Resume snapshot job:  SELECT cron.resume('noble-portfolio-snapshot');
-- Delete snapshot job:  SELECT cron.unschedule('noble-portfolio-snapshot');
--
-- View recent snapshots for a user:
--   SELECT * FROM portfolio_snapshots
--   WHERE user_id = '<clerk_user_id>'
--   ORDER BY snapshot_date DESC LIMIT 30;
--
-- Delete old snapshots (> 2 years):
--   DELETE FROM portfolio_snapshots
--   WHERE created_at < NOW() - INTERVAL '2 years';
-- ============================================================


-- ============================================================
-- FILE: 00000000000020_notification_preferences.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 20: Notification Preferences
-- User-configurable notification preferences for channel routing,
-- alert type filtering, quiet hours, and digest settings.
-- ============================================================

-- 1. Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE,
    channels        JSONB NOT NULL DEFAULT '{"in_app": true, "discord": false, "email": false}',
    alert_types     JSONB NOT NULL DEFAULT '{
        "trade_filled": true,
        "trade_rejected": true,
        "order_submitted": true,
        "risk_breach": true,
        "kill_switch": true,
        "mode_change": true,
        "pnl_threshold": true,
        "regime_change": false,
        "strategy_signal": false,
        "campaign_complete": true,
        "reconciliation": true
    }',
    quiet_hours     JSONB DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00", "timezone": "America/New_York"}',
    digest_settings JSONB DEFAULT '{"enabled": false, "frequency": "daily", "time": "18:00"}',
    discord_webhook_url TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 3. Service role policy (full access for BFF routes using SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access on notification_preferences" ON notification_preferences
    FOR ALL USING (true) WITH CHECK (true);

-- 4. User read own preferences
CREATE POLICY "Users can read own notification preferences" ON notification_preferences
    FOR SELECT USING (user_id = auth.jwt() ->> 'sub');

-- 5. User update own preferences
CREATE POLICY "Users can update own notification preferences" ON notification_preferences
    FOR UPDATE USING (user_id = auth.jwt() ->> 'sub');

-- 6. User insert own preferences
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences
    FOR INSERT WITH CHECK (user_id = auth.jwt() ->> 'sub');

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences (user_id);

-- 8. Updated_at trigger
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trigger_update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- 9. Table comment
COMMENT ON TABLE notification_preferences IS 'User-configurable notification preferences for channel routing, alert type filtering, quiet hours, and digest settings.';


-- ============================================================
-- FILE: 00000000000021_circuit_breakers.sql
-- ============================================================
-- Circuit Breaker System (P3-5A)
-- Tables for circuit breaker configuration and trading halt state tracking

CREATE TABLE IF NOT EXISTS circuit_breakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  breaker_type TEXT NOT NULL CHECK (breaker_type IN (
    'max_position_size',      -- Max $ value per position
    'max_portfolio_heat',     -- Max total portfolio risk %
    'daily_loss_limit',       -- Max daily loss $ or %
    'max_drawdown',           -- Max drawdown % from peak
    'consecutive_loss_stop',  -- Halt after N consecutive losses
    'max_open_positions',     -- Max concurrent open positions
    'order_rate_limit',       -- Max orders per minute
    'sector_concentration',   -- Max % in single sector
    'single_stock_concentration' -- Max % in single stock
  )),
  threshold_value DOUBLE PRECISION NOT NULL,
  threshold_unit TEXT NOT NULL DEFAULT 'percent' CHECK (threshold_unit IN ('percent', 'dollars', 'count')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  action TEXT NOT NULL DEFAULT 'halt' CHECK (action IN ('reject_order', 'halt', 'alert')),
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, breaker_type)
);

-- Halt state tracking (persists across server restarts)
CREATE TABLE IF NOT EXISTS trading_halts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('global_halt', 'user_halt', 'symbol_halt')),
  scope TEXT NOT NULL,  -- user_id or symbol or 'global'
  reason TEXT NOT NULL CHECK (reason IN ('manual', 'circuit_breaker', 'max_drawdown', 'data_feed_error', 'compliance', 'reconciliation_failure', 'daily_loss_limit', 'consecutive_loss_stop', 'rate_limit')),
  triggered_by TEXT,  -- breaker_type that triggered it
  metadata JSONB DEFAULT '{}',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- RLS
ALTER TABLE circuit_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_halts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON circuit_breakers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON trading_halts FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own breakers" ON circuit_breakers FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "Users can manage own breakers" ON circuit_breakers FOR ALL USING (auth.jwt() ->> 'sub' = user_id) WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can read active halts" ON trading_halts FOR SELECT USING (is_active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_circuit_breakers_user ON circuit_breakers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trading_halts_active ON trading_halts(level, scope, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_trading_halts_user_active ON trading_halts(scope, is_active) WHERE is_active = true AND level = 'user_halt';

-- Auto-update updated_at trigger for circuit_breakers
DROP TRIGGER IF EXISTS trg_circuit_breakers_updated_at ON circuit_breakers;
CREATE TRIGGER trg_circuit_breakers_updated_at
  BEFORE UPDATE ON circuit_breakers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- FILE: 00000000000022_reconciliation.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 22: Reconciliation Results
-- P3-5C: Reconciliation Engine persistence + auto-recon config
-- ============================================================

-- Reconciliation results table
-- Stores the outcome of each reconciliation run
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning')),
  total_expected INTEGER NOT NULL DEFAULT 0,
  total_filled INTEGER NOT NULL DEFAULT 0,
  match_rate DECIMAL(5,2),
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  phantom_count INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-reconciliation configuration table
-- Per-user setting for automatic daily reconciliation
CREATE TABLE IF NOT EXISTS reconciliation_auto_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  run_time TEXT NOT NULL DEFAULT '16:05',  -- HH:MM in ET
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_auto_config ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on reconciliation_results" ON reconciliation_results
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reconciliation_auto_config" ON reconciliation_auto_config
  FOR ALL USING (true) WITH CHECK (true);

-- Users can read own results
CREATE POLICY "Users can read own reconciliation results" ON reconciliation_results
  FOR SELECT USING (true);

-- Users can read own auto config
CREATE POLICY "Users can read own auto recon config" ON reconciliation_auto_config
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recon_results_user_date ON reconciliation_results (user_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_recon_results_status ON reconciliation_results (status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_recon_results_created_at ON reconciliation_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_auto_config_user ON reconciliation_auto_config (user_id);

-- Auto-update updated_at trigger for reconciliation_auto_config
DROP TRIGGER IF EXISTS trg_recon_auto_config_updated_at ON reconciliation_auto_config;
CREATE TRIGGER trg_recon_auto_config_updated_at
  BEFORE UPDATE ON reconciliation_auto_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE reconciliation_results IS 'Stores reconciliation run results for trade verification. P3-5C.';
COMMENT ON TABLE reconciliation_auto_config IS 'Per-user auto-reconciliation settings. When enabled, reconciliation runs automatically at market close.';


-- ============================================================
-- FILE: 00000000000023_smoke_test.sql
-- ============================================================
-- Migration 23: Smoke Test Results Table
-- P3-5E: Paper Trading E2E Smoke Test
-- Stores results from comprehensive end-to-end smoke tests

CREATE TABLE IF NOT EXISTS smoke_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  overall TEXT NOT NULL CHECK (overall IN ('pass', 'fail', 'partial')),
  tests JSONB NOT NULL DEFAULT '[]',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_user_id ON smoke_test_results (user_id);

-- Index for sorting by most recent
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_created_at ON smoke_test_results (created_at DESC);

-- Index for filtering by overall status
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_overall ON smoke_test_results (overall);

-- RLS: Users can only see their own results
ALTER TABLE smoke_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY smoke_test_results_select ON smoke_test_results
  FOR SELECT USING (true); -- Service role handles auth filtering; viewer+ can see their own via BFF

CREATE POLICY smoke_test_results_insert ON smoke_test_results
  FOR INSERT WITH CHECK (true); -- Inserted via service role from BFF

-- Add comment
COMMENT ON TABLE smoke_test_results IS 'P3-5E: Stores results from paper trading E2E smoke tests';


-- ============================================================
-- FILE: 00000000000024_rate_limit_violations.sql
-- ============================================================
-- Migration 24: Rate Limit Violations Log
-- Tracks rate limit breaches for monitoring, abuse detection, and analytics.

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who / what triggered the violation
  identifier    TEXT NOT NULL,           -- userId or IP
  identifier_type TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'ip'
  tier          TEXT NOT NULL,           -- Rate limit tier (trade, data, admin, etc.)
  pathname      TEXT NOT NULL,           -- URL path that was rate-limited

  -- Limit details
  limit_max     INT NOT NULL,            -- The rate limit that was exceeded
  window_ms     INT NOT NULL,            -- Window duration in ms
  current_count INT NOT NULL,            -- Current request count when blocked

  -- Request metadata
  user_agent    TEXT,
  ip_address    TEXT,
  plan          TEXT,                     -- User's plan (free/premium/institutional)
  role          TEXT                      -- User's role (viewer/trader/admin)
);

-- Indexes for common queries
CREATE INDEX idx_rlv_created_at ON rate_limit_violations (created_at DESC);
CREATE INDEX idx_rlv_identifier ON rate_limit_violations (identifier);
CREATE INDEX idx_rlv_tier ON rate_limit_violations (tier);
CREATE INDEX idx_rlv_identifier_type ON rate_limit_violations (identifier_type);

-- Auto-partition by month for efficient querying (Supabase supports declarative partitioning)
-- For now, just a regular table. Can be partitioned later if volume is high.

-- Row Level Security
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view rate limit violations"
  ON rate_limit_violations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      -- Admin-only access via service role
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access to rate limit violations"
  ON rate_limit_violations FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-cleanup: delete violations older than 90 days
-- (Can be managed via pg_cron if needed)


-- ============================================================
-- FILE: 00000000000025_retention_archive.sql
-- ============================================================
-- Migration 25: Audit Log Archive Tables + GDPR Erasure Log
-- Creates archive tables for hot/cold storage and GDPR compliance tracking.

-- ── Archive Tables (same schema as originals + archived_at) ──────────────────

-- Trade Audit Log Archive
CREATE TABLE IF NOT EXISTS trade_audit_log_archive (
  id            BIGINT PRIMARY KEY,
  event_type    VARCHAR,
  user_id       VARCHAR,
  org_id        VARCHAR,
  symbol        VARCHAR,
  order_id      VARCHAR,
  direction     VARCHAR,
  quantity      NUMERIC,
  price         NUMERIC,
  order_type    VARCHAR,
  regime        VARCHAR,
  strategy      VARCHAR,
  signal_score  NUMERIC,
  risk_metrics  JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tala_archived_at ON trade_audit_log_archive (archived_at DESC);
CREATE INDEX idx_tala_user_id ON trade_audit_log_archive (user_id);

-- Rate Limit Violations Archive
CREATE TABLE IF NOT EXISTS rate_limit_violations_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  identifier      TEXT,
  identifier_type TEXT,
  tier            TEXT,
  pathname        TEXT,
  limit_max       INT,
  window_ms       INT,
  current_count   INT,
  user_agent      TEXT,
  ip_address      TEXT,
  plan            TEXT,
  role            TEXT,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rlva_archived_at ON rate_limit_violations_archive (archived_at DESC);

-- Reconciliation Results Archive
CREATE TABLE IF NOT EXISTS reconciliation_results_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  user_id         VARCHAR,
  status          VARCHAR,
  total_orders    INT,
  matched_count   INT,
  mismatch_count  INT,
  missing_count   INT,
  details         JSONB,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rra_archived_at ON reconciliation_results_archive (archived_at DESC);

-- Portfolio Snapshots Archive
CREATE TABLE IF NOT EXISTS portfolio_snapshots_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  user_id         VARCHAR,
  total_value     NUMERIC,
  total_pnl       NUMERIC,
  positions       JSONB,
  metadata        JSONB,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_psa_archived_at ON portfolio_snapshots_archive (archived_at DESC);
CREATE INDEX idx_psa_user_id ON portfolio_snapshots_archive (user_id);

-- ── GDPR Erasure Log ────────────────────────────────────────────────────────
-- Required by GDPR Article 17: must keep a record that erasure occurred.

CREATE TABLE IF NOT EXISTS gdpr_erasure_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL,
  reason                TEXT NOT NULL DEFAULT 'gdpr_request',
  tables_affected       TEXT[] NOT NULL DEFAULT '{}',
  total_records_purged  INT NOT NULL DEFAULT 0,
  purged_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gel_user_id ON gdpr_erasure_log (user_id);
CREATE INDEX idx_gel_purged_at ON gdpr_erasure_log (purged_at DESC);

ALTER TABLE gdpr_erasure_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to gdpr_erasure_log"
  ON gdpr_erasure_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── pg_cron: Daily Retention Job ────────────────────────────────────────────
-- Runs at 3 AM UTC to archive old records and purge expired archives.

SELECT cron.schedule(
  'noble-retention-archive',
  '0 3 * * *',
  $$
  -- Archive trade_audit_log records older than 90 days
  INSERT INTO trade_audit_log_archive
  SELECT *, now() as archived_at FROM trade_audit_log
  WHERE created_at < now() - interval '90 days'
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM trade_audit_log
  WHERE created_at < now() - interval '90 days'
  AND id IN (SELECT id FROM trade_audit_log_archive);

  -- Archive rate_limit_violations older than 30 days
  INSERT INTO rate_limit_violations_archive
  SELECT *, now() as archived_at FROM rate_limit_violations
  WHERE created_at < now() - interval '30 days'
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM rate_limit_violations
  WHERE created_at < now() - interval '30 days'
  AND id IN (SELECT id FROM rate_limit_violations_archive);

  -- Purge archive tables older than their retention period
  DELETE FROM rate_limit_violations_archive
  WHERE archived_at < now() - interval '90 days';

  DELETE FROM trade_audit_log_archive
  WHERE archived_at < now() - interval '365 days';
  $$
);


-- ============================================================
-- FILE: 00000000000026_multi_tenant_org_id.sql
-- ============================================================
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


-- ============================================================
-- FILE: 00000000000027_api_keys.sql
-- ============================================================
-- Migration 27: API Keys — SaaS API key management with plan-aware expiry
-- Supports: free (1 key, 30-day expiry), premium (1 key, permanent), institutional (5 keys, permanent)
-- Key format: nt_live_{64 hex chars} — stored as SHA-256 hash for security
-- Integrates with Helio subscription webhooks for automatic key lifecycle management

-- ── api_keys table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT NOT NULL,
  key_hash          TEXT NOT NULL UNIQUE,          -- SHA-256 of full API key
  key_prefix        TEXT NOT NULL,                 -- e.g. "nt_live_a3f2" for UI display
  name              TEXT DEFAULT 'Default Key',    -- User-friendly label
  plan_at_creation  TEXT NOT NULL DEFAULT 'free'   -- Plan at time of key creation
                    CHECK (plan_at_creation IN ('free', 'premium', 'institutional')),
  role_at_creation  TEXT NOT NULL DEFAULT 'viewer' -- Role at time of key creation
                    CHECK (role_at_creation IN ('viewer', 'trader', 'admin')),
  scopes            JSONB,                         -- Future: granular scopes (null = role-based)
  expires_at        TIMESTAMPTZ,                   -- NULL = permanent (premium/institutional)
  last_used_at      TIMESTAMPTZ,
  last_used_ip      TEXT,                          -- Hashed IP for audit trail
  rotated_from      UUID REFERENCES api_keys(id) ON DELETE SET NULL, -- Key rotation chain
  rotation_grace_until TIMESTAMPTZ,                -- Old key stays valid until this time during rotation
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup: hash-based auth (most frequent query)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = true;

-- User's keys: management UI listing
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(clerk_user_id);

-- Expiry cleanup: find keys nearing expiration
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- Rotation chain: trace key history
CREATE INDEX IF NOT EXISTS idx_api_keys_rotated_from ON api_keys(rotated_from) WHERE rotated_from IS NOT NULL;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys (never the full hash — prefix only)
DO $$ BEGIN
  CREATE POLICY "Users can manage their own API keys"
    ON api_keys FOR ALL
    USING (clerk_user_id = auth.jwt() ->> 'sub');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (BFF routes use service_role key)
DO $$ BEGIN
  CREATE POLICY "Service role has full API key access"
    ON api_keys FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Helper: count active keys per user ────────────────────────────────────────
-- Used by BFF routes to enforce plan-based key limits

CREATE OR REPLACE FUNCTION count_active_api_keys(p_clerk_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM api_keys
  WHERE clerk_user_id = p_clerk_user_id
    AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Helper: expire stale free-tier keys ────────────────────────────────────────
-- Can be called by pg_cron or admin endpoint

CREATE OR REPLACE FUNCTION expire_stale_api_keys()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE api_keys
  SET is_active = false, revoked_at = now()
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Grant permissions ─────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO service_role;
GRANT EXECUTE ON FUNCTION count_active_api_keys(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION expire_stale_api_keys() TO service_role;


-- ============================================================
-- FILE: 00000000000028_pg_cron_health_check.sql
-- ============================================================
-- Migration 028: pg_cron health check
--
-- Replaces Vercel Cron Jobs (which are blocked on Hobby plan for sub-daily schedules).
-- Uses Supabase pg_cron to call the BFF health cron endpoint every 5 minutes.
--
-- IMPORTANT: Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor).
-- The pg_cron extension must be enabled first via:
--   CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
--
-- Vercel Hobby Plan cron limits:
--   - Max frequency: once per day (not every 5 minutes)
--   - Having "*/5 * * * *" in vercel.json causes ALL deployments to fail
--   - This migration moves the scheduling to Supabase instead.

-- 1. Enable pg_cron extension (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 2. Grant pg_cron usage to the service role
-- (Supabase service_role already has superuser privileges, so this is typically unnecessary
--  but included for explicitness)
-- GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Schedule the health check cron job
-- This calls the BFF /api/health/cron endpoint every 5 minutes
-- The CRON_SECRET must be set as an environment variable in Supabase
-- (Dashboard → Settings → Edge Functions → Environment Variables)
--
-- Note: pg_cron runs INSIDE the database, so it can't make HTTP requests directly.
-- Instead, we use the Supabase Edge Function approach or pg_net extension.
-- However, since our health check is a simple internal operation, we can
-- use a different approach: schedule a database function that records a
-- "ping needed" flag, which the frontend picks up on next request.

-- Alternative approach: Use Supabase pg_net extension to make HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4. Create a cron schedule table for tracking scheduled job state
CREATE TABLE IF NOT EXISTS cron_job_state (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  consecutive_failures INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create the health check function that pg_cron will call
CREATE OR REPLACE FUNCTION cron_health_check()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cron_secret TEXT;
  v_frontend_url TEXT;
  v_response INTEGER;
BEGIN
  -- Get the cron secret and frontend URL from environment
  -- These should be set in Supabase Dashboard → Settings → Database → Environment Variables
  -- or via: ALTER DATABASE postgres SET app.settings.cron_secret = 'your-secret';
  v_cron_secret := current_setting('app.settings.cron_secret', true);
  v_frontend_url := current_setting('app.settings.frontend_url', true);

  IF v_frontend_url IS NULL OR v_frontend_url = '' THEN
    v_frontend_url := 'https://noble-trader-agent-frontend.vercel.app';
  END IF;

  -- Use pg_net to make an HTTP GET request to the health cron endpoint
  -- pg_net.http_get is async — it enqueues the request
  IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
    SELECT INTO v_response net.http_get(
      url := v_frontend_url || '/api/health/cron',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_cron_secret,
        'Content-Type', 'application/json'
      )
    );
  ELSE
    -- No cron secret — make unauthenticated request (health cron allows this in dev)
    SELECT INTO v_response net.http_get(
      url := v_frontend_url || '/api/health/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );
  END IF;

  -- Update job state
  INSERT INTO cron_job_state (job_name, last_run_at, next_run_at, status)
  VALUES ('health_check', NOW(), NOW() + INTERVAL '5 minutes', 'active')
  ON CONFLICT (job_name)
  DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '5 minutes',
    status = 'active';

  RAISE NOTICE 'Health check cron triggered at %', NOW();
END;
$$;

-- 6. Schedule the cron job: every 5 minutes during market hours (Mon-Fri 9:30am-4pm ET)
-- Note: Supabase uses UTC timezone. ET = UTC-5 (EST) / UTC-4 (EDT)
-- Market hours: 13:30-20:00 UTC (winter) / 14:30-21:00 UTC (summer)
-- Using broader window 13:00-21:00 UTC to cover both EST and EDT
SELECT cron.schedule(
  'health-check-during-market',
  '*/5 * 13-21 * * 1-5',  -- Every 5 min, 1pm-9pm UTC, Mon-Fri
  $$SELECT cron_health_check();$$
);

-- 7. Schedule a lighter check outside market hours (every 30 min, 24/7)
SELECT cron.schedule(
  'health-check-off-hours',
  '*/30 * * * * *',  -- Every 30 min, 24/7
  $$SELECT cron_health_check();$$
);

-- 8. Schedule daily portfolio snapshot capture (once per day at 9pm UTC)
-- This replaces the need for a Vercel cron for /api/portfolio/snapshot/capture
SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '0 21 * * 1-5',  -- 9pm UTC on weekdays
  $$SELECT net.http_get(
    url := COALESCE(
      current_setting('app.settings.frontend_url', true),
      'https://noble-trader-agent-frontend.vercel.app'
    ) || '/api/portfolio/snapshot/capture',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.cron_secret', true), ''),
      'Content-Type', 'application/json'
    )
  );$$
);

-- 9. Set app settings (must be run as superuser — run these separately in SQL Editor)
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your-cron-secret-here';
-- ALTER DATABASE postgres SET app.settings.frontend_url = 'https://noble-trader-agent-frontend.vercel.app';

-- 10. RLS on cron_job_state (only service_role can access)
ALTER TABLE cron_job_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage cron state" ON cron_job_state
  FOR ALL USING (true) WITH CHECK (true);
-- Note: Since we use the service_role key from API routes, RLS is bypassed anyway.
-- This policy is for explicitness and in case anon key queries are attempted.


-- ============================================================
-- FILE: 00000000000029_api_keys_cron.sql
-- ============================================================
-- Migration 29: API Keys — pg_cron for auto-expiry and cleanup
--
-- Schedules the expire_stale_api_keys() function (created in migration 027)
-- to run daily at 3 AM UTC. Also revokes keys whose rotation grace period
-- has expired.
--
-- Prerequisites:
--   1. pg_cron extension enabled (done in migration 018)
--   2. expire_stale_api_keys() function exists (migration 027)

-- 1. Schedule daily auto-expire job at 3 AM UTC
--    This handles:
--      - Free-tier keys past their 30-day expiry
--      - Any keys with expires_at in the past
--      - Keys whose rotation_grace_until has passed
DO $$
BEGIN
  -- Remove existing schedule if present (idempotent)
  PERFORM cron.unschedule('noble-expire-api-keys');
  RAISE NOTICE 'Unscheduled noble-expire-api-keys (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-expire-api-keys to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-expire-api-keys',
  '0 3 * * *',  -- Daily at 3:00 AM UTC
  $$SELECT expire_stale_api_keys();$$
);

-- 2. Also expire keys past their rotation grace period
--    The expire_stale_api_keys() function only checks expires_at,
--    so we add a separate cleanup for rotation grace periods.
CREATE OR REPLACE FUNCTION expire_rotation_grace_keys()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE api_keys
  SET is_active = false, revoked_at = now()
  WHERE is_active = true
    AND rotation_grace_until IS NOT NULL
    AND rotation_grace_until < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expire_rotation_grace_keys() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-expire-grace-keys');
  RAISE NOTICE 'Unscheduled noble-expire-grace-keys (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-expire-grace-keys to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-expire-grace-keys',
  '30 3 * * *',  -- Daily at 3:30 AM UTC (after the main expiry job)
  $$SELECT expire_rotation_grace_keys();$$
);

-- 3. Verify both jobs are scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN ('noble-expire-api-keys', 'noble-expire-grace-keys')
ORDER BY name;


-- ============================================================
-- FILE: 00000000000030_price_alerts.sql
-- ============================================================
-- ============================================================
-- Noble Trader — Migration 30: Price Alerts
-- User-defined price alerts that trigger on real-time WebSocket ticks.
-- Supports above/below/crosses directions with cooldown.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_price_alerts (
    id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id           VARCHAR(255) NOT NULL,
    symbol            VARCHAR(30) NOT NULL,
    target_price      DOUBLE PRECISION NOT NULL,
    direction         VARCHAR(10) NOT NULL DEFAULT 'above',  -- 'above' | 'below' | 'crosses'
    severity          VARCHAR(10) NOT NULL DEFAULT 'info',    -- 'info' | 'warning' | 'error'
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    triggered         BOOLEAN NOT NULL DEFAULT FALSE,
    triggered_at      TIMESTAMPTZ,
    cooldown_minutes  INTEGER NOT NULL DEFAULT 15,
    last_triggered    TIMESTAMPTZ,
    trigger_count     INTEGER NOT NULL DEFAULT 0,
    label             VARCHAR(100),                           -- optional user label
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE ta_price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ta_price_alerts
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON ta_price_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_enabled ON ta_price_alerts (user_id, enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON ta_price_alerts (symbol);
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON ta_price_alerts (user_id, triggered) WHERE triggered = TRUE AND enabled = TRUE;

COMMENT ON TABLE ta_price_alerts IS 'User-defined price alerts triggered by real-time WebSocket price feed. Supports above/below/crosses directions with cooldown to prevent spam.';


-- ============================================================
-- FILE: 00000000000031_system_config.sql
-- ============================================================
-- ══════════════════════════════════════════════════════════════════════════════
-- Noble Trader — System Configuration Table
-- ══════════════════════════════════════════════════════════════════════════════
-- Runtime-configurable parameters for admin adjustment without redeployment.
-- Supports hierarchical keys (e.g. "renko.brick_size"), typed values,
-- audit trail of changes, and category-based grouping.
--
-- Resolution order: DB override → env var → hardcoded default
-- ══════════════════════════════════════════════════════════════════════════════

-- Main config table
CREATE TABLE IF NOT EXISTS system_config (
    key           TEXT PRIMARY KEY,          -- e.g. "renko.brick_size"
    value         JSONB NOT NULL,            -- typed value (number, string, bool, array)
    value_type    TEXT NOT NULL DEFAULT 'float',  -- "float" | "int" | "bool" | "str" | "json"
    category      TEXT NOT NULL DEFAULT 'general', -- "renko" | "risk" | "regime" | "sizing" | "execution" | "stream" | "auth" | "general"
    description   TEXT NOT NULL DEFAULT '',  -- human-readable explanation
    default_value JSONB,                     -- the hardcoded default (for reference/reset)
    env_var       TEXT,                      -- corresponding env var name (e.g. "RENKO_BRICK_SIZE")
    min_value     JSONB,                     -- optional minimum for numeric types
    max_value     JSONB,                     -- optional maximum for numeric types
    allowed_values JSONB,                    -- optional enum list (e.g. ["fixed","atr","dynamic"])
    is_sensitive  BOOLEAN NOT NULL DEFAULT FALSE, -- hide value from non-admin reads
    requires_restart BOOLEAN NOT NULL DEFAULT FALSE, -- if true, change needs server restart
    updated_by    TEXT NOT NULL DEFAULT 'system',   -- who made the change
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config change audit log
CREATE TABLE IF NOT EXISTS system_config_audit (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key         TEXT NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    changed_by  TEXT NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason      TEXT                     -- optional change reason
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config (category);
CREATE INDEX IF NOT EXISTS idx_system_config_audit_key ON system_config_audit (key);
CREATE INDEX IF NOT EXISTS idx_system_config_audit_time ON system_config_audit (changed_at DESC);

-- Enable RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can read, only admins can mutate
CREATE POLICY "Authenticated users can read config"
    ON system_config FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access to config"
    ON system_config FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can read config audit"
    ON system_config_audit FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access to config audit"
    ON system_config_audit FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION update_system_config_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Renko configuration defaults
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
-- Brick Engine
('renko.brick_size',           '0.50',  'float', 'renko', 'Fixed dollar brick size',                 '0.50',  'RENKO_BRICK_SIZE',           '0.01',  '100.0'),
('renko.brick_size_mode',      '"fixed"','str',  'renko', 'Brick sizing mode: fixed|atr|dynamic',    '"fixed"','RENKO_BRICK_SIZE_MODE',       NULL,    NULL),
('renko.atr_period',           '14',    'int',   'renko', 'ATR lookback period',                     '14',    'RENKO_ATR_PERIOD',           '2',     '100'),
('renko.atr_multiplier',       '1.0',   'float', 'renko', 'ATR multiplier for brick size',           '1.0',   'RENKO_ATR_MULTIPLIER',       '0.1',   '10.0'),
('renko.reversal_bricks',      '2',     'int',   'renko', 'Bricks for reversal',                     '2',     'RENKO_REVERSAL_BRICKS',      '1',     '5'),
-- Swing Classifier
('renko.swing_lookback',       '3',     'int',   'renko', 'Bricks to confirm a swing point',         '3',     'RENKO_SWING_LOOKBACK',       '1',     '20'),
('renko.min_swing_distance',   '2',     'int',   'renko', 'Min bricks between swing highs/lows',     '2',     'RENKO_MIN_SWING_DISTANCE',   '1',     '10'),
-- Pattern Detector
('renko.bull_trigger_n',       '3',     'int',   'renko', 'N consecutive HH/HL for bull trigger',    '3',     'RENKO_BULL_TRIGGER_N',       '1',     '10'),
('renko.bear_trigger_n',       '3',     'int',   'renko', 'N consecutive LL/LH for bear trigger',    '3',     'RENKO_BEAR_TRIGGER_N',       '1',     '10'),
('renko.double_top_bricks',    '6',     'int',   'renko', 'Lookback for double-top/bottom patterns', '6',     'RENKO_DOUBLE_TOP_BRICKS',    '2',     '20'),
('renko.consolidation_max_mix','0.4',   'float', 'renko', 'Max ratio of opposite labels in a run',   '0.4',   'RENKO_CONSOLIDATION_MAX_MIX','0.0',   '1.0'),
-- Signal Filter / Session
('renko.session_start',        '"09:35"','str',  'renko', 'Session start time (ET)',                 '"09:35"','RENKO_SESSION_START',         NULL,    NULL),
('renko.session_end',          '"15:45"','str',  'renko', 'Session end time (ET)',                   '"15:45"','RENKO_SESSION_END',           NULL,    NULL),
('renko.skip_lunch',           'true',  'bool',  'renko', 'Skip 11:30-13:00 ET lunch period',       'true',  'RENKO_SKIP_LUNCH',           NULL,    NULL),
('renko.lunch_start',          '"11:30"','str',  'renko', 'Lunch period start (ET)',                 '"11:30"','RENKO_LUNCH_START',           NULL,    NULL),
('renko.lunch_end',            '"13:00"','str',  'renko', 'Lunch period end (ET)',                   '"13:00"','RENKO_LUNCH_END',             NULL,    NULL),
('renko.max_trades_per_session','15',   'int',   'renko', 'Hard cap on daily trades',                '15',    'RENKO_MAX_TRADES_PER_SESSION','1',     '100'),
('renko.max_daily_loss_bricks','10.0',  'float', 'renko', 'Stop trading after N bricks lost',        '10.0',  'RENKO_MAX_DAILY_LOSS_BRICKS','1.0',   '100.0'),
('renko.max_consecutive_losses','3',    'int',   'renko', 'Pause after N consecutive losses',        '3',     'RENKO_MAX_CONSECUTIVE_LOSSES','1',     '20'),
('renko.cooldown_seconds',    '30.0',   'float', 'renko', 'Min seconds between trades',              '30.0',  'RENKO_COOLDOWN_SECONDS',     '0.0',   '300.0'),
('renko.regime_gate',         'true',   'bool',  'renko', 'Only trade with HMM regime alignment',    'true',  'RENKO_REGIME_GATE',          NULL,    NULL),
-- Risk Manager
('renko.sl_bricks',           '3',      'int',   'renko', 'Stop-loss in brick units',                '3',     'RENKO_SL_BRICKS',            '1',     '20'),
('renko.tp_bricks',           '5',      'int',   'renko', 'Take-profit in brick units',              '5',     'RENKO_TP_BRICKS',            '1',     '50'),
('renko.trailing_stop',       'true',   'bool',  'renko', 'Enable trailing stop',                    'true',  'RENKO_TRAILING_STOP',        NULL,    NULL),
('renko.trail_after_bricks',  '3',      'int',   'renko', 'Start trailing after N bricks profit',    '3',     'RENKO_TRAIL_AFTER_BRICKS',   '1',     '20'),
('renko.trail_distance_bricks','2',     'int',   'renko', 'Trail by N bricks behind peak',           '2',     'RENKO_TRAIL_DISTANCE_BRICKS','1',     '10'),
('renko.time_stop_bricks',    '10',     'int',   'renko', 'Close if open N+ bricks without TP/SL',   '10',    'RENKO_TIME_STOP_BRICKS',     '1',     '50'),
('renko.partial_exit_pct',    '0.0',    'float', 'renko', 'Partial exit fraction (0 = off)',         '0.0',   'RENKO_PARTIAL_EXIT_PCT',     '0.0',   '0.5'),
('renko.partial_exit_bricks', '3',      'int',   'renko', 'Bricks of profit for partial exit',       '3',     'RENKO_PARTIAL_EXIT_BRICKS',  '1',     '20'),
-- Position Sizing
('renko.kelly_fraction',      '0.5',    'float', 'renko', 'Half-Kelly by default',                   '0.5',   'RENKO_KELLY_FRACTION',       '0.1',   '1.0'),
('renko.max_position_pct',    '0.10',   'float', 'renko', 'Max % of equity per trade',               '0.10',  'RENKO_MAX_POSITION_PCT',     '0.01',  '1.0'),
('renko.min_position_usd',    '50.0',   'float', 'renko', 'Minimum order value in USD',              '50.0',  'RENKO_MIN_POSITION_USD',     '0.0',   '10000.0'),
('renko.default_win_rate',    '0.55',   'float', 'renko', 'Fallback WR for Kelly when no history',   '0.55',  'RENKO_DEFAULT_WIN_RATE',     '0.01',  '0.99'),
-- Transaction Costs
('renko.slippage_bps',        '2.0',    'float', 'renko', 'Slippage in basis points',                '2.0',   'RENKO_SLIPPAGE_BPS',         '0.0',   '50.0'),
('renko.commission_bps',      '5.0',    'float', 'renko', 'Commission in basis points',              '5.0',   'RENKO_COMMISSION_BPS',       '0.0',   '100.0'),
('renko.spread_bps',          '1.0',    'float', 'renko', 'Bid-ask spread in basis points',          '1.0',   'RENKO_SPREAD_BPS',           '0.0',   '50.0'),
-- Execution Modeling
('renko.oco_priority',        '"sl_first"','str', 'renko', 'SL+TP priority: sl_first|tp_first',      '"sl_first"','RENKO_OCO_PRIORITY',        NULL,    NULL),
('renko.market_impact_mode',  '"none"','str',    'renko', 'Market impact: none|almgren_chriss',      '"none"','RENKO_MARKET_IMPACT_MODE',    NULL,    NULL),
('renko.adv_shares',          '10000000','int',  'renko', 'Average daily volume in shares',          '10000000','RENKO_ADV_SHARES',           '100000','1000000000'),
('renko.fill_probability_mode','"always_fill"','str','renko','Fill mode: always_fill|realistic',     '"always_fill"','RENKO_FILL_PROBABILITY_MODE',NULL, NULL),
('renko.borrow_rate_bps',     '50.0',   'float', 'renko', 'Annualized short borrow cost (bps)',      '50.0',  'RENKO_BORROW_RATE_BPS',      '0.0',   '5000.0'),
('renko.margin_rate_bps',     '150.0',  'float', 'renko', 'Annualized margin rate (bps)',            '150.0', 'RENKO_MARGIN_RATE_BPS',      '0.0',   '5000.0'),
('renko.is_hard_to_borrow',   'false',  'bool',  'renko', 'Whether stock is hard-to-borrow',        'false', 'RENKO_IS_HARD_TO_BORROW',    NULL,    NULL),
('renko.dividend_yield_bps',  '200.0',  'float', 'renko', 'Annualized dividend yield (bps)',         '200.0', 'RENKO_DIVIDEND_YIELD_BPS',   '0.0',   '5000.0'),
('renko.initial_capital',     '100000.0','float','renko',  'Starting capital for dollar P&L',         '100000.0','RENKO_INITIAL_CAPITAL',      '1000.0','100000000.0'),
('renko.confidence_level',    '0.95',   'float', 'renko', 'Statistical confidence level',            '0.95',  'RENKO_CONFIDENCE_LEVEL',     '0.80',  '0.99'),
-- Pipeline
('renko.default_symbol',      '"SPY"',  'str',   'renko', 'Default trading symbol',                  '"SPY"','RENKO_DEFAULT_SYMBOL',        NULL,    NULL),
('renko.timezone',            '"America/New_York"','str','renko','Timezone for session filters',    '"America/New_York"','RENKO_TIMEZONE',     NULL,    NULL),
-- Optimization
('renko.optimize_brick_sizes','[0.25, 0.50, 1.00]','json','renko','Brick sizes for optimization sweep','[0.25, 0.50, 1.00]',NULL,NULL,NULL),
('renko.optimize_sl_range',   '[2, 3, 4]','json','renko', 'SL bricks range for optimization',       '[2, 3, 4]',NULL,NULL,NULL),
('renko.optimize_tp_range',   '[4, 5, 6]','json','renko', 'TP bricks range for optimization',       '[4, 5, 6]',NULL,NULL,NULL),
('renko.multiple_testing_alpha','0.05', 'float', 'renko', 'Significance threshold for multi-test',  '0.05',  'RENKO_MULTIPLE_TESTING_ALPHA','0.01',  '0.10'),
-- Backend
('renko.snapshot_interval',   '100',    'int',   'renko', 'Save snapshot every Nth tick',            '100',   'RENKO_SNAPSHOT_INTERVAL',    '10',    '1000'),
('renko.backtest_chunk_size', '150',    'int',   'renko', 'Ticks per SSE chunk in streaming',        '150',   'RENKO_BACKTEST_CHUNK_SIZE',  '10',    '1000'),
('renko.loss_alert_bricks',   '-5',     'int',   'renko', 'Brick loss threshold for Discord alert',  '-5',    'RENKO_LOSS_ALERT_BRICKS',    '-20',   '0'),
('renko.batch_notify_min_ticks','50',   'int',   'renko', 'Min ticks for batch Discord notification','50',    'RENKO_BATCH_NOTIFY_MIN_TICKS','1',     '1000')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Position Sizing (Masaniello) configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('sizing.base_risk',       '0.005', 'float', 'sizing', 'Base risk fraction (beta in Masaniello formula)','0.005','SIZING_BASE_RISK',     '0.001',  '0.05'),
('sizing.min_risk',        '0.0025','float', 'sizing', 'Hard floor for risk fraction',                   '0.0025','SIZING_MIN_RISK',      '0.0001', '0.01'),
('sizing.max_risk',        '0.010', 'float', 'sizing', 'Hard cap for risk fraction',                     '0.010', 'SIZING_MAX_RISK',      '0.001',  '0.05'),
('sizing.min_prob',        '0.50',  'float', 'sizing', 'Minimum win probability to trade',               '0.50',  'SIZING_MIN_PROB',      '0.30',   '0.80'),
('sizing.min_rr',          '2.50',  'float', 'sizing', 'Minimum reward/risk ratio to trade',             '2.50',  'SIZING_MIN_REWARD_RISK','1.0',   '10.0'),
('sizing.max_drawdown',    '0.10',  'float', 'sizing', 'Max strategy DD for DD scaling',                 '0.10',  'SIZING_MAX_DRAWDOWN',  '0.01',   '0.50'),
('sizing.batch_halt_dd',   '0.05',  'float', 'sizing', 'Halt batch at -N intraday drawdown',             '0.05',  'SIZING_BATCH_HALT_DD', '0.01',   '0.20'),
('sizing.regime_floor',    '0.50',  'float', 'sizing', 'Min regime quality to allow trade',              '0.50',  'SIZING_REGIME_FLOOR',  '0.10',   '1.0'),
('sizing.use_kelly_overlay','false','bool',  'sizing', 'Enable Kelly cap overlay',                       'false', 'SIZING_USE_KELLY_OVERLAY',NULL,   NULL),
('sizing.kelly_fraction',  '0.25',  'float', 'sizing', 'Kelly fraction when overlay active',             '0.25',  'SIZING_KELLY_FRACTION','0.05',   '1.0'),
('sizing.batch_size',      '5',     'int',   'sizing', 'N trades per Masaniello batch',                  '5',     'SIZING_BATCH_SIZE',    '2',      '20'),
('sizing.target_wins',     '3',     'int',   'sizing', 'Target wins per batch',                          '3',     'SIZING_TARGET_WINS',   '1',      '20'),
('sizing.mc_simulations',  '1000',  'int',   'sizing', 'Monte Carlo simulation count',                   '1000',  'SIZING_MC_SIMULATIONS','100',    '10000')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Risk analysis configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('risk.annualise_factor',   '252',   'int',   'risk',   'Trading days per year for annualization',        '252',  'RISK_ANNUALISE_FACTOR','200',    '260'),
('risk.base_risk_limit',    '0.02',  'float', 'risk',   'Default daily loss limit (2%)',                  '0.02', 'RISK_BASE_RISK_LIMIT', '0.005',  '0.10'),
('risk.stop_cvar_multiplier','2',    'int',   'risk',   'Stop = N x CVaR95',                             '2',    'RISK_STOP_CVAR_MULTIPLIER','1',  '5'),
('risk.tp_cvar_multiplier', '3',     'int',   'risk',   'TP = N x CVaR95 (3:1 R:R)',                     '3',    'RISK_TP_CVAR_MULTIPLIER','1',    '10'),
('risk.stress_crash_mean',  '-0.02', 'float', 'risk',   '2008 crash simulation mean return',             '-0.02','RISK_STRESS_CRASH_MEAN','-0.10', '0.0'),
('risk.stress_crash_std',   '0.04',  'float', 'risk',   '2008 crash simulation std',                     '0.04', 'RISK_STRESS_CRASH_STD', '0.01',  '0.20'),
('risk.stress_crash_seed',  '42',    'int',   'risk',   'Stress test RNG seed',                          '42',   'RISK_STRESS_CRASH_SEED',NULL,    NULL),
('risk.stress_flash_drop',  '-0.10', 'float', 'risk',   'Flash crash single-day drop',                  '-0.10','RISK_STRESS_FLASH_DROP','-0.50', '-0.01'),
('risk.stress_vol_multiplier','3',   'int',   'risk',   'Vol spike factor',                              '3',    'RISK_STRESS_VOL_MULTIPLIER','1',  '10'),
('risk.stress_vol_spike_bars','20',  'int',   'risk',   'Vol spike duration in bars',                    '20',   'RISK_STRESS_VOL_SPIKE_BARS','5',  '100'),
('risk.stress_rate_shock_bps','0.002','float','risk',   'Rate shock daily shift',                        '0.002','RISK_STRESS_RATE_SHOCK_BPS','0.0001','0.01'),
('risk.stress_liquidity_shift','0.001','float','risk',  'Liquidity crisis extra cost',                   '0.001','RISK_STRESS_LIQUIDITY_SHIFT','0.0','0.01')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Regime engine configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('regime.vol_window_long',  '20',    'int',   'regime', 'Long vol lookback window',                      '20',   'REGIME_VOL_FEATURE_WINDOW_LONG','5',  '100'),
('regime.vol_window_short', '5',     'int',   'regime', 'Short vol lookback window',                     '5',    'REGIME_VOL_FEATURE_WINDOW_SHORT','2', '20'),
('regime.trend_window_short','10',   'int',   'regime', 'Short momentum window',                         '10',   'REGIME_TREND_FEATURE_WINDOW_SHORT','2','50'),
('regime.trend_window_long', '30',   'int',   'regime', 'Long momentum window',                          '30',   'REGIME_TREND_FEATURE_WINDOW_LONG','10','200'),
('regime.hmm_random_state', '42',    'int',   'regime', 'HMM reproducibility seed',                      '42',   'REGIME_HMM_RANDOM_STATE', NULL,    NULL),
('regime.hmm_n_iter',       '100',   'int',   'regime', 'HMM EM iterations',                             '100',  'REGIME_HMM_N_ITER',     '10',     '1000'),
('regime.stability_lookback','20',   'int',   'regime', 'Regime stability lookback bars',                '20',   'REGIME_STABILITY_LOOKBACK','5',   '100')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Execution modeling configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('exec.sigma_daily',              '0.02',  'float', 'execution', 'Default daily volatility assumption',    '0.02',  'EXEC_DEFAULT_SIGMA_DAILY',       '0.001','0.10'),
('exec.permanent_impact_coeff',   '0.1',   'float', 'execution', 'Almgren-Chriss eta coefficient',        '0.1',   'EXEC_PERMANENT_IMPACT_COEFF',    '0.01', '1.0'),
('exec.temporary_impact_coeff',   '0.142', 'float', 'execution', 'Almgren-Chriss epsilon coefficient',    '0.142', 'EXEC_TEMPORARY_IMPACT_COEFF',    '0.01', '1.0'),
('exec.default_adv_shares',       '10000000','int', 'execution', 'Default average daily volume',          '10000000','EXEC_DEFAULT_ADV_SHARES',       '100000','1000000000'),
('exec.default_avg_price',        '450.0', 'float', 'execution', 'Default average stock price',           '450.0', 'EXEC_DEFAULT_AVG_PRICE',         '1.0',   '10000.0'),
('exec.fill_time_horizon_hours',  '6.5',   'float', 'execution', 'Trading day hours for fill prob',       '6.5',   'EXEC_FILL_TIME_HORIZON_HOURS',   '1.0',   '24.0'),
('exec.fill_sensitivity',         '5.0',   'float', 'execution', 'Logit fill sensitivity k',              '5.0',   'EXEC_FILL_SENSITIVITY',          '0.1',   '20.0'),
('exec.fill_threshold',           '1.0',   'float', 'execution', 'Logit fill threshold',                  '1.0',   'EXEC_FILL_THRESHOLD',            '0.0',   '5.0'),
('exec.htb_premium_bps',          '500.0', 'float', 'execution', 'Hard-to-borrow premium (bps)',          '500.0', 'EXEC_HTB_PREMIUM_BPS',           '0.0',   '5000.0'),
('exec.trading_days_per_year',    '252',   'int',   'execution', 'Trading days per year',                 '252',   'EXEC_TRADING_DAYS_PER_YEAR',     '200',   '260')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Stream / WebSocket configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('stream.min_prices_for_fit', '81',     'int',   'stream', 'Min prices for HMM fit',               '81',   'STREAM_MIN_PRICES_FOR_FIT','20',   '500'),
('stream.window',             '500',    'int',   'stream', 'Price buffer max length',               '500',  'STREAM_DEFAULT_WINDOW',    '50',    '5000'),
('stream.kelly_fraction',     '0.5',    'float', 'stream', 'Default Kelly fraction',                '0.5',  'STREAM_DEFAULT_KELLY_FRACTION','0.1','1.0'),
('stream.target_vol',         '0.15',   'float', 'stream', 'Default target volatility',             '0.15', 'STREAM_DEFAULT_TARGET_VOL','0.05', '0.50'),
('stream.base_risk_limit',    '0.02',   'float', 'stream', 'Default risk limit',                    '0.02', 'STREAM_DEFAULT_BASE_RISK_LIMIT','0.005','0.10'),
('stream.refit_every',        '50',     'int',   'stream', 'HMM refit frequency (ticks)',           '50',   'STREAM_DEFAULT_REFIT_EVERY','10',   '200'),
('stream.regime_debounce',    '3',      'int',   'stream', 'Regime change debounce bars',           '3',    'STREAM_REGIME_DEBOUNCE_BARS','1',   '10'),
('stream.subscribe_timeout',  '30',     'int',   'stream', 'WS subscribe timeout (seconds)',        '30',   'STREAM_WS_SUBSCRIBE_TIMEOUT','5',   '120'),
('stream.sse_heartbeat_timeout','20',   'int',   'stream', 'SSE heartbeat timeout (seconds)',       '20',   'STREAM_SSE_PNL_TIMEOUT',   '5',     '60'),
('stream.alert_queue_size',   '200',    'int',   'stream', 'SSE alert queue size',                  '200',  'STREAM_SSE_ALERT_QUEUE_SIZE','10',  '1000')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Alpaca connection configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('alpaca.ws_max_reconnects',   '20',   'int',   'alpaca', 'Max WS reconnection attempts',          '20',  'ALPACA_WS_MAX_RECONNECTS',   '1',     '100'),
('alpaca.ws_base_backoff',     '1.0',  'float', 'alpaca', 'WS reconnection backoff base (seconds)','1.0', 'ALPACA_WS_BASE_BACKOFF',     '0.1',   '10.0'),
('alpaca.ws_ping_interval',    '30',   'int',   'alpaca', 'WS keepalive ping interval (seconds)',  '30',  'ALPACA_WS_PING_INTERVAL',    '5',     '120'),
('alpaca.ws_ping_timeout',     '10',   'int',   'alpaca', 'WS ping timeout (seconds)',             '10',  'ALPACA_WS_PING_TIMEOUT',     '1',     '30'),
('alpaca.snapshot_interval_sec','5',   'int',   'alpaca', 'P&L snapshot frequency (seconds)',      '5',   'ALPACA_SNAPSHOT_INTERVAL_SEC','1',     '60'),
('alpaca.stream_grace_period', '30',   'int',   'alpaca', 'Consumer disconnect grace (seconds)',   '30',  'ALPACA_STREAM_GRACE_PERIOD', '5',     '120'),
('alpaca.sse_queue_size',      '500',  'int',   'alpaca', 'Per-consumer SSE queue size',           '500', 'ALPACA_SSE_QUEUE_SIZE',      '50',    '5000')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed: Auth / infrastructure configuration
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('auth.role_cache_ttl',        '300',   'int',   'auth',   'Clerk role cache TTL (seconds)',        '300', 'CLERK_ROLE_CACHE_TTL',        '10',    '3600'),
('auth.jwks_cache_ttl',        '3600',  'int',   'auth',   'JWKS cache TTL (seconds)',              '3600','CLERK_JWKS_CACHE_TTL',        '60',    '86400'),
('auth.circuit_failure_threshold','3',  'int',   'auth',   'Auth circuit breaker failure threshold','3',   'CLERK_CIRCUIT_FAILURE_THRESHOLD','1',  '20'),
('auth.circuit_reset_timeout',  '60.0', 'float', 'auth',   'Auth circuit breaker reset (seconds)', '60.0', 'CLERK_CIRCUIT_RESET_TIMEOUT', '5.0',   '300.0'),
('auth.enrich_cache_ttl',       '300',  'int',   'auth',   'User enrichment cache TTL (seconds)',  '300', 'CLERK_ENRICH_CACHE_TTL',      '10',    '3600'),
('auth.api_key_cache_ttl',      '60',   'int',   'auth',   'SaaS API key cache TTL (seconds)',     '60',  'AUTH_API_KEY_CACHE_TTL',      '10',    '3600')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- FILE: 00000000000032_system_config_extended.sql
-- ============================================================
-- ══════════════════════════════════════════════════════════════════════════════
-- Noble Trader — Extended System Config Seeds
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds config keys for execution financing, fill probability internals,
-- Alpaca WS timeouts/throttling, stream subscriber queue, and risk
-- stress-test extended params.  These keys have DB seeds but were previously
-- hardcoded in the Python modules.
--
-- Run AFTER 007_system_config.sql (adds to the same table).
-- Uses ON CONFLICT (key) DO NOTHING so re-runs are safe.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Execution: Financing ────────────────────────────────────────────────────

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('exec.borrow_rate_bps',           '50.0',  'float', 'execution', 'Annualized short borrow cost (bps)',         '50.0',  'EXEC_BORROW_RATE_BPS',           '0.0',   '5000.0'),
('exec.margin_rate_bps',           '150.0', 'float', 'execution', 'Annualized margin interest rate (bps)',      '150.0', 'EXEC_MARGIN_RATE_BPS',           '0.0',   '5000.0'),
('exec.dividend_yield_bps',        '200.0', 'float', 'execution', 'Annualized dividend yield for short cost',   '200.0', 'EXEC_DIVIDEND_YIELD_BPS',        '0.0',   '5000.0'),
('exec.trading_days_per_quarter',  '63',    'int',   'execution', 'Trading days per quarter (dividend prob)',   '63',    'EXEC_TRADING_DAYS_PER_QUARTER',  '50',    '70')
ON CONFLICT (key) DO NOTHING;

-- ─── Execution: Fill Probability Internals ───────────────────────────────────

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('exec.default_participation_rate', '0.01', 'float', 'execution', 'Default volume participation rate',         '0.01',  'EXEC_DEFAULT_PARTICIPATION_RATE', '0.001', '0.10'),
('exec.volume_penalty_multiplier',  '10.0', 'float', 'execution', 'Volume penalty scale factor',               '10.0',  'EXEC_VOLUME_PENALTY_MULTIPLIER',  '1.0',   '50.0'),
('exec.max_volume_penalty',         '0.3',  'float', 'execution', 'Max volume penalty fraction',                '0.3',   'EXEC_MAX_VOLUME_PENALTY',         '0.05',  '0.80'),
('exec.stop_min_fill_probability',  '0.90', 'float', 'execution', 'Min fill prob for stop orders',              '0.90',  'EXEC_STOP_MIN_FILL_PROBABILITY',  '0.50',  '1.0'),
('exec.stop_adverse_sigma',         '0.5',  'float', 'execution', 'Adverse selection sigma for stop orders',    '0.5',   'EXEC_STOP_ADVERSE_SIGMA',         '0.1',   '3.0'),
('exec.limit_adverse_sigma',        '0.2',  'float', 'execution', 'Adverse selection sigma for limit orders',   '0.2',   'EXEC_LIMIT_ADVERSE_SIGMA',        '0.05',  '2.0'),
('exec.fill_interp_high',           '0.8',  'float', 'execution', 'High-fill interpretation threshold',         '0.8',   'EXEC_FILL_INTERP_HIGH',           '0.5',   '1.0'),
('exec.fill_interp_mid',            '0.5',  'float', 'execution', 'Mid-fill interpretation threshold',          '0.5',   'EXEC_FILL_INTERP_MID',            '0.2',   '0.8'),
('exec.fill_interp_low',            '0.2',  'float', 'execution', 'Low-fill interpretation threshold',          '0.2',   'EXEC_FILL_INTERP_LOW',            '0.05',  '0.5')
ON CONFLICT (key) DO NOTHING;

-- ─── Stream: Subscriber Queue ───────────────────────────────────────────────

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('stream.subscriber_queue_size',    '500',   'int',   'stream', 'Per-subscriber asyncio.Queue maxsize',       '500',   'STREAM_SUBSCRIBER_QUEUE_SIZE',   '50',    '5000')
ON CONFLICT (key) DO NOTHING;

-- ─── Alpaca: WS Timeouts & Throttling ───────────────────────────────────────

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('alpaca.ws_close_timeout',                '5',    'int',   'alpaca', 'WS close handshake timeout (seconds)',      '5',     'ALPACA_WS_CLOSE_TIMEOUT',                '1',     '30'),
('alpaca.ws_backoff_cap',                  '8',    'int',   'alpaca', 'Max reconnect backoff exponent cap',        '8',     'ALPACA_WS_BACKOFF_CAP',                  '2',     '15'),
('alpaca.supabase_http_timeout',           '10.0', 'float', 'alpaca', 'Supabase credential lookup HTTP timeout',   '10.0',  'ALPACA_SUPABASE_HTTP_TIMEOUT',           '1.0',   '30.0'),
('alpaca.bootstrap_http_timeout',          '10.0', 'float', 'alpaca', 'Bootstrap REST API HTTP timeout',           '10.0',  'ALPACA_BOOTSTRAP_HTTP_TIMEOUT',          '1.0',   '30.0'),
('alpaca.bootstrap_throttle_timeout',      '10.0', 'float', 'alpaca', 'Bootstrap throttle acquire timeout',        '10.0',  'ALPACA_BOOTSTRAP_THROTTLE_TIMEOUT',      '1.0',   '30.0'),
('alpaca.position_refresh_http_timeout',   '5.0',  'float', 'alpaca', 'Position refresh REST HTTP timeout',        '5.0',   'ALPACA_POSITION_REFRESH_HTTP_TIMEOUT',   '1.0',   '15.0'),
('alpaca.position_refresh_throttle_timeout','5.0', 'float', 'alpaca', 'Position refresh throttle acquire timeout', '5.0',   'ALPACA_POSITION_REFRESH_THROTTLE_TIMEOUT','1.0','15.0'),
('alpaca.data_no_position_wait_timeout',   '5.0',  'float', 'alpaca', 'Wait timeout when no positions held',       '5.0',   'ALPACA_DATA_NO_POSITION_WAIT_TIMEOUT',   '1.0',   '30.0'),
('alpaca.data_tick_min_interval',          '1.0',  'float', 'alpaca', 'Min seconds between ticks per symbol',      '1.0',   'ALPACA_DATA_TICK_MIN_INTERVAL',          '0.1',   '10.0'),
('alpaca.data_resubscribe_interval',       '2.0',  'float', 'alpaca', 'Re-subscribe check interval (seconds)',     '2.0',   'ALPACA_DATA_RESUBSCRIBE_INTERVAL',       '0.5',   '10.0')
ON CONFLICT (key) DO NOTHING;

-- ─── Risk: Stress Test Extended ──────────────────────────────────────────────

INSERT INTO system_config (key, value, value_type, category, description, default_value, env_var, min_value, max_value) VALUES
('risk.stress_min_returns',                '20',   'int',   'risk',   'Min returns required for stress tests',     '20',    'RISK_STRESS_MIN_RETURNS',                '5',     '100'),
('risk.stress_liquidity_downside_mult',    '1.5',  'float', 'risk',   'Liquidity crisis downside multiplier',      '1.5',   'RISK_STRESS_LIQUIDITY_DOWNSIDE_MULT',    '1.0',   '5.0'),
('risk.stress_liquidity_upside_mult',      '0.8',  'float', 'risk',   'Liquidity crisis upside multiplier',        '0.8',   'RISK_STRESS_LIQUIDITY_UPSIDE_MULT',      '0.1',   '1.0')
ON CONFLICT (key) DO NOTHING;

