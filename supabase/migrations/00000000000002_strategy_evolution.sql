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
