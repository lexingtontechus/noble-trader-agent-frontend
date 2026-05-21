-- ============================================================
-- Noble Trader — Consolidated Migration Script
-- Generated from 18 individual migration files.
-- Paste this entire script into the Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/pcvscowltlrxzgxjurcr/sql
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

