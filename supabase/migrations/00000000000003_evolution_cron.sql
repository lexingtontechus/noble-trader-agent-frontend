-- ============================================================
-- Noble Trader Agent — Phase 5: Strategy Evolution Cron Jobs
-- Run this in Supabase Dashboard → SQL Editor
--
-- Adds two new cron jobs:
--   1. Strategy Rotation Check (every 6 hours)
--   2. Auto-Optimization (daily at 10pm UTC)
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
-- Step 1: Cron Job — Strategy Rotation Check (every 6 hours)
-- Calls: POST /api/evolution/rotate?secret=CRON_SECRET
-- Checks if the active strategy variant is underperforming
-- and rotates to a better one if available.
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-strategy-rotate',         -- job name
  '0 */6 * * *',                   -- every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
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

-- ----------------------------------------------------------
-- Step 2: Cron Job — Daily Auto-Optimization (10pm UTC)
-- Calls: POST /api/evolution/optimize?secret=CRON_SECRET
-- Runs Optuna-style optimization for the most traded symbol.
-- Uses the active variant as a starting point.
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-strategy-optimize',       -- job name
  '0 22 * * 1-5',                  -- 10pm UTC, Mon-Fri (after market close)
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

-- ----------------------------------------------------------
-- Step 3: Verify the new jobs are scheduled
-- ----------------------------------------------------------
SELECT jobid, name, schedule, command, active
FROM cron.job
WHERE name IN ('noble-strategy-rotate', 'noble-strategy-optimize');

-- ----------------------------------------------------------
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause rotation:     SELECT cron.pause('noble-strategy-rotate');
-- Resume rotation:    SELECT cron.resume('noble-strategy-rotate');
-- Delete rotation:    SELECT cron.unschedule('noble-strategy-rotate');
-- Pause optimization: SELECT cron.pause('noble-strategy-optimize');
-- Resume optimization:SELECT cron.resume('noble-strategy-optimize');
-- Delete optimization:SELECT cron.unschedule('noble-strategy-optimize');
--
-- View all job logs:  SELECT * FROM cron.job_run_details
--                     WHERE name IN ('noble-strategy-rotate', 'noble-strategy-optimize')
--                     ORDER BY start_time DESC LIMIT 10;
-- ----------------------------------------------------------
