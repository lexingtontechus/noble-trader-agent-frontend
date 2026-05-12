-- ============================================================
-- Noble Trader Agent — Scheduled Orders Tables + Indexes
-- Run this in Supabase Dashboard → SQL Editor
--
-- Creates / ensures the tables required by:
--   src/app/api/trading/schedule/route.js       (POST/GET — create & list scheduled orders)
--   src/app/api/trading/schedule/execute/route.js (POST/GET — execute queued orders via Alpaca)
--
-- Tables:
--   1. ta_scheduled_order       — queued orders with dependency tracking, retry logic
--   2. ta_telegram_notification — notification log (used by execute route to record sends)
--
-- PREREQUISITE: Run 00000000000001_create_tables.sql first (creates the
--   update_updated_at_column() trigger function and base RLS policies).
--   If you have NOT run migration 01, this script includes safety checks
--   so it can also run standalone (IF NOT EXISTS throughout).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Scheduled Order table
-- ──────────────────────────────────────────────────────────────
-- Stores orders queued for later execution. The schedule/execute
-- route processes these every 15 minutes during market hours.
--
-- Key columns used by the route code:
--   status:           'queued' | 'executing' | 'filled' | 'failed' | 'cancelled'
--   scheduleAt:       ISO timestamp — earliest time to execute (NULL = immediately)
--   dependsOnOrders:  JSON array of Alpaca order IDs that must be "filled" first
--   alpacaOrderId:    Set once the order is submitted to Alpaca
--   attempts:         Incremented on each execution attempt
--   maxAttempts:      Order moves to "failed" after this many attempts
--   lastAttemptAt:    Timestamp of the most recent attempt
--   errorMessage:     Last error message (if any)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ta_scheduled_order (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL DEFAULT 'default',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,                -- 'buy' | 'sell'
  "orderType" TEXT NOT NULL,         -- 'limit' | 'market'
  qty DOUBLE PRECISION NOT NULL,
  "limitPrice" DOUBLE PRECISION,     -- required for limit orders
  "timeInForce" TEXT NOT NULL DEFAULT 'gtc',  -- 'gtc' | 'day' | 'ioc'
  reason TEXT,                        -- human-readable reason for the order
  status TEXT NOT NULL DEFAULT 'queued',       -- 'queued' | 'executing' | 'filled' | 'failed' | 'cancelled'
  "scheduleAt" TIMESTAMP(3),         -- earliest execution time (NULL = execute ASAP)
  "dependsOnOrders" TEXT,            -- JSON array of Alpaca order IDs (dependencies)
  "alpacaOrderId" TEXT,              -- set once order is submitted to Alpaca
  "errorMessage" TEXT,               -- last error (if any)
  attempts INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────
-- 2. Telegram Notification table
-- ──────────────────────────────────────────────────────────────
-- The execute route sends Telegram notifications after processing
-- scheduled orders (cron-triggered only). Each send is logged here.
-- Also used by the resolveChatId() helper — it queries the most
-- recent successful notification to recover a chat ID if the
-- TELEGRAM_CHAT_ID env var is not set.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ta_telegram_notification (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "chatId" TEXT NOT NULL,
  message TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'trade_report',  -- 'trade_report' | 'schedule_reminder' | 'early_warning' | 'evolution_update'
  success BOOLEAN NOT NULL,
  error TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────
-- 3. Indexes for scheduled order queries
-- ──────────────────────────────────────────────────────────────
-- The execute route queries by status='queued' and orders by
-- createdAt ASC. The GET route also filters by status.
-- Telegram notifications are queried by success=true + ordered
-- by createdAt DESC (for resolveChatId fallback).

CREATE INDEX IF NOT EXISTS idx_scheduled_order_status ON ta_scheduled_order(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_order_created ON ta_scheduled_order("createdAt");
CREATE INDEX IF NOT EXISTS idx_scheduled_order_schedule_at ON ta_scheduled_order("scheduleAt") WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_telegram_notification_success ON ta_telegram_notification(success) WHERE success = true;
CREATE INDEX IF NOT EXISTS idx_telegram_notification_created ON ta_telegram_notification("createdAt");

-- ──────────────────────────────────────────────────────────────
-- 4. Auto-update "updatedAt" trigger
-- ──────────────────────────────────────────────────────────────
-- The execute route updates status, alpacaOrderId, attempts, etc.
-- The updatedAt column should auto-refresh on every update.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ta_scheduled_order_updated_at ON ta_scheduled_order;
CREATE TRIGGER update_ta_scheduled_order_updated_at
  BEFORE UPDATE ON ta_scheduled_order
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ──────────────────────────────────────────────────────────────
-- Same pattern as all other tables — full access via the
-- publishable key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).
-- RLS is enabled but policies allow all operations.

ALTER TABLE ta_scheduled_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_telegram_notification ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if they exist (idempotent re-run)
  DROP POLICY IF EXISTS "Service role full access" ON ta_scheduled_order;
  DROP POLICY IF EXISTS "Service role full access" ON ta_telegram_notification;

  CREATE POLICY "Service role full access" ON ta_scheduled_order FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Service role full access" ON ta_telegram_notification FOR ALL USING (true) WITH CHECK (true);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. Grant access to postgres role (Supabase default)
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
