-- ============================================================
-- Noble Trader Agent — Phase 5: Strategy Evolution Tables
-- Run this in Supabase Dashboard → SQL Editor
--
-- Creates tables for:
--   1. ta_strategy_variant — strategy parameter sets (HMM states, kelly fraction, risk limits, etc.)
--   2. ta_strategy_performance — live/backtest performance per variant
--   3. ta_ab_test — A/B test assignments and results
--   4. ta_evolution_log — history of strategy parameter changes and reasons
--
-- PREREQUISITE: Run 00000000000001_create_tables.sql first.
-- ============================================================

-- 1. Strategy Variant table
-- Stores a named set of strategy parameters that can be compared and evolved.
CREATE TABLE IF NOT EXISTS ta_strategy_variant (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "generation" INTEGER NOT NULL DEFAULT 1,
  -- HMM / regime parameters
  "nHmmStates" INTEGER NOT NULL DEFAULT 4,
  "hmmIter" INTEGER NOT NULL DEFAULT 100,
  "hmmWindow" INTEGER NOT NULL DEFAULT 200,
  "hmmRefitEvery" INTEGER NOT NULL DEFAULT 50,
  -- Strategy / Kelly parameters
  "kellyFraction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "targetVol" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "baseRiskLimit" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  "maxPositionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  -- Risk parameters
  "regimeGate" BOOLEAN NOT NULL DEFAULT true,
  "riskCheck" BOOLEAN NOT NULL DEFAULT true,
  "commissionBps" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "slippageBps" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  -- Optimization metadata
  "optimizerStudyName" TEXT,
  "optimizerTrialNumber" INTEGER,
  "optimizerParams" TEXT,          -- JSON: full Optuna trial params
  "parentVariantId" TEXT,          -- reference to parent variant this evolved from
  "scoreComposite" DOUBLE PRECISION,   -- latest composite score
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
-- Tracks individual trade/outcome performance attributed to a variant.
CREATE TABLE IF NOT EXISTS ta_strategy_performance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "variantId" TEXT NOT NULL REFERENCES ta_strategy_variant(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  "tradeSide" TEXT NOT NULL,          -- 'buy' or 'sell'
  "entryPrice" DOUBLE PRECISION,
  "exitPrice" DOUBLE PRECISION,
  "pnlPct" DOUBLE PRECISION,          -- realized P&L percentage
  "pnlDollar" DOUBLE PRECISION,       -- realized P&L dollar
  "holdingPeriodBars" INTEGER,        -- how many bars held
  "regimeAtEntry" TEXT,               -- regime when trade was opened
  "regimeAtExit" TEXT,                -- regime when trade was closed
  "validationScore" DOUBLE PRECISION, -- walk-forward score at entry
  "kellyFractionUsed" DOUBLE PRECISION,
  "riskScoreAtEntry" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'live',  -- 'live' or 'backtest'
  "tradeId" TEXT,                     -- optional reference to ta_trade_recommendation
  "analysisId" TEXT,                  -- optional reference to ta_analysis_run
  metadata TEXT,                      -- JSON: additional data
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. A/B Test table
-- Manages A/B test assignments between two strategy variants.
CREATE TABLE IF NOT EXISTS ta_ab_test (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  "variantAId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  "variantBId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  status TEXT NOT NULL DEFAULT 'running',  -- 'draft', 'running', 'completed', 'cancelled'
  "allocationPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,  -- fraction allocated to variant B
  -- Results (populated when test completes)
  "variantAPnl" DOUBLE PRECISION,
  "variantATrades" INTEGER,
  "variantAWinRate" DOUBLE PRECISION,
  "variantASharpe" DOUBLE PRECISION,
  "variantBPnl" DOUBLE PRECISION,
  "variantBTrades" INTEGER,
  "variantBWinRate" DOUBLE PRECISION,
  "variantBSharpe" DOUBLE PRECISION,
  "winnerId" TEXT,                     -- the winning variant id
  "confidenceLevel" DOUBLE PRECISION,  -- statistical confidence in the result
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Evolution Log table
-- Records the history of strategy parameter changes and the reason for each change.
CREATE TABLE IF NOT EXISTS ta_evolution_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "fromVariantId" TEXT REFERENCES ta_strategy_variant(id),
  "toVariantId" TEXT NOT NULL REFERENCES ta_strategy_variant(id),
  "triggerType" TEXT NOT NULL,         -- 'scheduled', 'performance', 'ab_test', 'manual', 'optuna'
  "triggerReason" TEXT,                -- human-readable reason
  "previousScore" DOUBLE PRECISION,    -- composite score of the old variant
  "newScore" DOUBLE PRECISION,         -- composite score of the new variant
  "scoreDelta" DOUBLE PRECISION,       -- newScore - previousScore
  "parametersChanged" TEXT,            -- JSON: list of params that changed
  "abTestId" TEXT REFERENCES ta_ab_test(id),
  metadata TEXT,                       -- JSON: additional data (Optuna trial info, etc.)
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_strategy_variant_active ON ta_strategy_variant("isActive");
CREATE INDEX IF NOT EXISTS idx_strategy_performance_variant ON ta_strategy_performance("variantId");
CREATE INDEX IF NOT EXISTS idx_strategy_performance_symbol ON ta_strategy_performance(symbol);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_source ON ta_strategy_performance("source");
CREATE INDEX IF NOT EXISTS idx_ab_test_status ON ta_ab_test(status);
CREATE INDEX IF NOT EXISTS idx_evolution_log_to_variant ON ta_evolution_log("toVariantId");
CREATE INDEX IF NOT EXISTS idx_evolution_log_trigger ON ta_evolution_log("triggerType");

-- Auto-update "updatedAt" triggers
CREATE TRIGGER update_ta_strategy_variant_updated_at
  BEFORE UPDATE ON ta_strategy_variant
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ta_ab_test_updated_at
  BEFORE UPDATE ON ta_ab_test
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (same pattern as existing tables — full access via publishable key)
ALTER TABLE ta_strategy_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_ab_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_evolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ta_strategy_variant FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_strategy_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_ab_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_evolution_log FOR ALL USING (true) WITH CHECK (true);

-- ── Seed the default variant ──────────────────────────────────────────────────
-- This ensures there's always an active strategy variant from day one.
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
