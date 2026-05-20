-- ============================================================
-- Noble Trader Agent — Scheduled Orders Cron Job
-- Run this in Supabase Dashboard → SQL Editor
--
-- Schedules the pg_cron job that drives:
--   POST /api/trading/schedule/execute?secret=CRON_SECRET
--
-- This cron job processes queued scheduled orders every 15 minutes
-- during US market hours (Mon-Fri). It:
--   1. Fetches all orders with status='queued'
--   2. Sorts sells before buys (frees buying power)
--   3. Checks scheduleAt timestamps and dependsOnOrders
--   4. Submits orders to Alpaca and updates status
--   5. Sends Telegram notification of results
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled
--   2. Vault secrets configured in Dashboard → Vault:
--      - Name: cron_secret       Value: <your CRON_SECRET (same as Vercel)>
--      - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
--
-- CONFIGURATION:
--   - Secrets are read from Supabase Vault using vault.read_secret()
--   - The base URL and cron secret are NOT stored as GUC variables
--     (Supabase hosted plans don't support ALTER DATABASE SET for custom GUCs)
-- ============================================================

-- ----------------------------------------------------------
-- Verify Vault secrets exist
-- ----------------------------------------------------------
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING — add in Dashboard → Vault' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- ----------------------------------------------------------
-- Step 1: Schedule — Order Execution (every 15 min, market hours)
-- ----------------------------------------------------------
-- Schedule: */15 13-20 * * 1-5
--   → Every 15 minutes, Monday-Friday, 13:00-20:00 UTC
--   → US market hours: 9:30 AM - 4:00 PM Eastern
--   → 13:30 UTC = 9:30 AM ET, 20:00 UTC = 4:00 PM ET
--
-- The execute route:
--   - Accepts CRON_SECRET via ?secret= query param OR x-cron-secret header
--   - Sends both for maximum compatibility
--   - Returns { total, executed, skipped, failed, results }
-- ----------------------------------------------------------

-- Idempotent: unschedule first if it already exists
SELECT cron.unschedule('noble-schedule-execute');

SELECT cron.schedule(
  'noble-schedule-execute',      -- job name
  '*/15 13-20 * * 1-5',          -- every 15 min, Mon-Fri, 13:00-20:00 UTC
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

-- ----------------------------------------------------------
-- Step 2: Verify the job is scheduled
-- ----------------------------------------------------------
SELECT jobid, name, schedule, command, active
FROM cron.job
WHERE name = 'noble-schedule-execute';

-- ----------------------------------------------------------
-- Step 3: View all cron jobs (optional)
-- ----------------------------------------------------------
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name LIKE 'noble-%'
ORDER BY name;

-- ----------------------------------------------------------
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause the job:      SELECT cron.pause('noble-schedule-execute');
-- Resume the job:     SELECT cron.resume('noble-schedule-execute');
-- Delete the job:     SELECT cron.unschedule('noble-schedule-execute');
-- Force-run once:     SELECT net.http_post(
--                        url := vault.read_secret('noble_base_url') || '/api/trading/schedule/execute?secret=' || vault.read_secret('cron_secret'),
--                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', vault.read_secret('cron_secret')),
--                        body := '{}'::jsonb
--                      );
--
-- View recent logs:   SELECT name, status, return_message, start_time, end_time
--                      FROM cron.job_run_details
--                      WHERE name = 'noble-schedule-execute'
--                      ORDER BY start_time DESC LIMIT 10;
-- ----------------------------------------------------------
