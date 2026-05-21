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
