-- ============================================================
-- Noble Trader Agent — Database Tables Setup
-- Run this in Supabase Dashboard → SQL Editor
-- This creates the tables that Prisma expects.
--
-- PREREQUISITE: Run this AFTER setting up the Supabase project.
-- The DATABASE_URL in Vercel should point to this Supabase database.
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
-- These are needed for Prisma to work with Supabase
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Also grant to the anon and authenticated roles if needed for RLS
ALTER TABLE ta_analysis_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_trade_recommendation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_scheduled_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_telegram_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_tda_scan_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_early_warning_alert ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (Prisma uses this)
CREATE POLICY "Service role full access" ON ta_analysis_run FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_trade_recommendation FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_scheduled_order FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_telegram_notification FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_tda_scan_result FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON ta_early_warning_alert FOR ALL USING (true) WITH CHECK (true);
