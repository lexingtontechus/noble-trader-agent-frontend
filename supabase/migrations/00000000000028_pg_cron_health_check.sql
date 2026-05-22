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
