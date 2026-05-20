-- ============================================================
-- Noble Trader Agent — Trade Campaign System
-- Migration: 009_trade_campaign.sql
--
-- Creates:
--   1. trade_campaign    — Batch trade orchestration with risk guards
--   2. campaign_trades   — Individual trades within a campaign
--   3. pg_cron job       — Campaign tick every 60s during market hours
--
-- Architecture:
--   pg_cron → SQL function (net.http_post) → /api/campaign/tick
--   The API route does the actual orchestration (check fills,
--   place orders, enforce stop conditions).
--   State is persisted here so the orchestrator is stateless
--   and survives browser disconnects / server restarts.
-- ============================================================

-- ============================================================
-- 1. trade_campaign table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_campaign (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'stopped_loss_streak', 'stopped_max_drawdown', 'stopped_manual', 'error')),

  -- Batch parameters (set at creation)
  max_trades              INTEGER     NOT NULL DEFAULT 10,
  max_consecutive_losses  INTEGER     NOT NULL DEFAULT 3,
  max_drawdown_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  kelly_fraction          NUMERIC(5,4) NOT NULL DEFAULT 0.50,
  position_sizing_mode    TEXT        NOT NULL DEFAULT 'kelly'
    CHECK (position_sizing_mode IN ('kelly', 'fixed', 'risk_parity')),
  fixed_qty               INTEGER,   -- only used when position_sizing_mode = 'fixed'

  -- Signal source
  analysis_id             UUID,       -- links to ta_analysis_run
  signal_source           TEXT        NOT NULL DEFAULT 'renko'
    CHECK (signal_source IN ('renko', 'analysis', 'manual')),

  -- Live tracking (updated by orchestrator)
  trades_placed           INTEGER     NOT NULL DEFAULT 0,
  trades_filled           INTEGER     NOT NULL DEFAULT 0,
  wins                    INTEGER     NOT NULL DEFAULT 0,
  losses                  INTEGER     NOT NULL DEFAULT 0,
  consecutive_losses      INTEGER     NOT NULL DEFAULT 0,
  realized_pnl            NUMERIC(12,2) NOT NULL DEFAULT 0,
  peak_pnl                NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_drawdown            NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Current active trade (null when waiting to place next)
  current_trade_id        UUID,       -- FK to campaign_trades.id

  -- Timing
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  stopped_reason          TEXT,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Column comments
COMMENT ON TABLE public.trade_campaign IS
  'Orchestrates a batch of sequential trades with aggregate risk guards (loss streak, max DD). Server-driven via pg_cron tick.';
COMMENT ON COLUMN public.trade_campaign.status IS 'Campaign lifecycle: draft → running → completed/stopped. stopped_* variants indicate WHY it stopped.';
COMMENT ON COLUMN public.trade_campaign.max_trades IS 'Maximum number of trades in the batch';
COMMENT ON COLUMN public.trade_campaign.max_consecutive_losses IS 'Auto-stop after N consecutive losing trades';
COMMENT ON COLUMN public.trade_campaign.max_drawdown_pct IS 'Auto-stop if drawdown exceeds this percentage of equity';
COMMENT ON COLUMN public.trade_campaign.consecutive_losses IS 'Current consecutive loss streak — reset on any win';
COMMENT ON COLUMN public.trade_campaign.current_trade_id IS 'The trade currently awaiting fill/exit. NULL = ready to place next trade.';
COMMENT ON COLUMN public.trade_campaign.stopped_reason IS 'Human-readable reason for stop (e.g. "3 consecutive losses", "max drawdown 6.2% exceeded 5%")';

-- Updated-at trigger
CREATE TRIGGER trg_trade_campaign_updated_at
  BEFORE UPDATE ON public.trade_campaign
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_campaign_clerk_user_id
  ON public.trade_campaign (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_trade_campaign_status
  ON public.trade_campaign (status)
  WHERE status IN ('running', 'paused');
CREATE INDEX IF NOT EXISTS idx_trade_campaign_created_at
  ON public.trade_campaign (created_at DESC);

-- RLS
ALTER TABLE public.trade_campaign ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaigns"
  ON public.trade_campaign FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own campaigns"
  ON public.trade_campaign FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own campaigns"
  ON public.trade_campaign FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own campaigns"
  ON public.trade_campaign FOR DELETE
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on trade_campaign"
  ON public.trade_campaign FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. campaign_trades table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_trades (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             UUID        NOT NULL REFERENCES public.trade_campaign(id) ON DELETE CASCADE,
  trade_index             INTEGER     NOT NULL,  -- 1-based position in batch

  -- Trade details
  symbol                  TEXT        NOT NULL,
  side                    TEXT        NOT NULL CHECK (side IN ('buy', 'sell')),
  qty                     INTEGER     NOT NULL,
  order_type              TEXT        NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop', 'bracket')),
  limit_price             NUMERIC(12,4),
  stop_loss_price         NUMERIC(12,4),
  take_profit_price       NUMERIC(12,4),

  -- Signal context
  signal_direction        TEXT,       -- long/short/flat from HMM+Renko
  confidence              NUMERIC(5,4),
  regime                  TEXT,       -- HMM regime at time of entry
  kelly_fraction_used     NUMERIC(5,4),

  -- Execution results
  alpaca_order_id         TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'filled', 'partially_filled', 'stopped_out', 'taken_profit', 'cancelled', 'rejected', 'error')),
  fill_price              NUMERIC(12,4),
  fill_qty                INTEGER,
  exit_price              NUMERIC(12,4),
  realized_pnl            NUMERIC(12,4),
  commission              NUMERIC(8,4) DEFAULT 0,

  -- Timing
  submitted_at            TIMESTAMPTZ,
  filled_at               TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Column comments
COMMENT ON TABLE public.campaign_trades IS
  'Individual trades within a campaign batch. Each trade is sequential — the next trade is placed only after the previous one closes.';
COMMENT ON COLUMN public.campaign_trades.trade_index IS '1-based position in the campaign batch (trade 1, 2, ... N)';
COMMENT ON COLUMN public.campaign_trades.signal_direction IS 'Original signal direction from the analysis pipeline';
COMMENT ON COLUMN public.campaign_trades.regime IS 'HMM regime state at the time the trade was placed (bull/bear/neutral/crisis)';
COMMENT ON COLUMN public.campaign_trades.status IS 'Trade lifecycle: pending → submitted → filled → stopped_out/taken_profit';

-- Updated-at trigger
CREATE TRIGGER trg_campaign_trades_updated_at
  BEFORE UPDATE ON public.campaign_trades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_trades_campaign_id
  ON public.campaign_trades (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_trades_status
  ON public.campaign_trades (status)
  WHERE status IN ('pending', 'submitted', 'filled');
CREATE INDEX IF NOT EXISTS idx_campaign_trades_alpaca_order_id
  ON public.campaign_trades (alpaca_order_id)
  WHERE alpaca_order_id IS NOT NULL;

-- RLS
ALTER TABLE public.campaign_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaign trades"
  ON public.campaign_trades FOR SELECT
  USING (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own campaign trades"
  ON public.campaign_trades FOR INSERT
  WITH CHECK (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own campaign trades"
  ON public.campaign_trades FOR UPDATE
  USING (campaign_id IN (SELECT id FROM public.trade_campaign WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Service role full access on campaign_trades"
  ON public.campaign_trades FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_campaign TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_trades TO authenticated;

-- ============================================================
-- 4. Campaign tick function (called by pg_cron)
-- ============================================================
-- This function triggers the Next.js API route that does the
-- actual orchestration. The API route:
--   1. Fetches all running campaigns
--   2. For each, checks if current trade has closed
--   3. Updates stats, places next trade, or stops campaign
--
-- The CRON_SECRET env var must be set in Vercel for auth.

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
  -- Read the app config for the tick endpoint
  base_url := current_setting('app.campaign_tick_url', true);
  secret := current_setting('app.cron_secret', true);

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'app.campaign_tick_url or app.cron_secret not set — campaign tick skipped';
    RETURN;
  END IF;

  -- Fire-and-forget HTTP POST to the campaign tick endpoint
  SELECT INTO response net.http_post(
    url := base_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Campaign tick fired, response status: %', response;
END;
$$;

COMMENT ON FUNCTION public.campaign_tick() IS
  'pg_cron callback: fires HTTP POST to the campaign tick API route every minute during market hours. The API route does the actual orchestration.';

-- ============================================================
-- 5. pg_cron schedule — every 60s during US market hours
-- ============================================================
-- Market hours: 9:30 AM – 4:00 PM ET = 13:30 – 20:00 UTC
-- Run every minute during market hours on weekdays

-- First, ensure pg_cron and pg_net are available
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Remove old schedule if it exists (safe)
DO $$
BEGIN
  PERFORM cron.unschedule('noble-campaign-tick');
  RAISE NOTICE 'Unscheduled old campaign tick job';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old campaign tick job to unschedule';
END;
$$;

-- Schedule: every 60 seconds, Mon-Fri, during US market hours (13:30-20:00 UTC)
SELECT cron.schedule(
  'noble-campaign-tick',
  '* 13-20 * * 1-5',
  $$SELECT public.campaign_tick();$$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules the campaign tick job every 60s during US market hours';
COMMENT ON EXTENSION pg_net IS 'Allows pg_cron to make HTTP requests (fire campaign tick to API route)';
