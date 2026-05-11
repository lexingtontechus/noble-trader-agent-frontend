-- ============================================================
-- Noble Trader Agent — Supabase pg_cron + pg_net Migration
-- Sets up two cron jobs that call the Next.js API routes:
--   1. TDA Early Warning Scan (every 4 hours)
--   2. Scheduled Order Execution (every 15 minutes during market hours)
--
-- PREREQUISITES (run in Supabase Dashboard → SQL Editor first):
--   1. Enable pg_net extension:  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
--   2. Enable pg_cron extension: CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;
--
-- CONFIGURATION:
--   - CRON_SECRET must match the CRON_SECRET in Vercel .env.local
--   - The secret is passed via the ?secret= query parameter and x-cron-secret header
--   - BASE_URL should be set to the Vercel deployment URL
--
-- IMPORTANT: Before running Step 2, set the GUC variables below.
-- Replace <YOUR_CRON_SECRET> with your actual CRON_SECRET value.
-- Replace <YOUR_BASE_URL> with your Vercel deployment URL.
-- ============================================================

-- ----------------------------------------------------------
-- Step 1: Store the base URL and cron secret as GUC variables
-- so cron jobs can reference them without hard-coding.
-- Run these ALTER DATABASE commands once in the SQL Editor:
--
--   ALTER DATABASE postgres SET app.noble_base_url = '<YOUR_BASE_URL>';
--   ALTER DATABASE postgres SET app.noble_cron_secret = '<YOUR_CRON_SECRET>';
--
-- Then RECONNECT for the GUCs to take effect.
-- ----------------------------------------------------------

-- ----------------------------------------------------------
-- Step 2: Cron Job — TDA Early Warning Scan (every 4 hours)
-- Calls: POST /api/tda/scan?secret=CRON_SECRET
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-tda-scan',              -- job name
  '0 */4 * * *',                 -- every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
  $$
  SELECT net.http_post(
    url := current_setting('app.noble_base_url', true) || '/api/tda/scan?secret=' || current_setting('app.noble_cron_secret', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.noble_cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------
-- Step 3: Cron Job — Scheduled Order Execution
-- Calls: POST /api/trading/schedule/execute?secret=CRON_SECRET
-- Runs every 15 minutes during US market hours (13:30-20:00 UTC = 9:30am-4pm ET)
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-schedule-execute',      -- job name
  '*/15 13-20 * * 1-5',         -- every 15 min, Mon-Fri, 13:30-20:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.noble_base_url', true) || '/api/trading/schedule/execute?secret=' || current_setting('app.noble_cron_secret', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.noble_cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------
-- Step 4: Verify the jobs are scheduled
-- ----------------------------------------------------------
SELECT jobid, name, schedule, command, active
FROM cron.job
WHERE name IN ('noble-tda-scan', 'noble-schedule-execute');

-- ----------------------------------------------------------
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause a job:    SELECT cron.pause('noble-tda-scan');
-- Resume a job:   SELECT cron.resume('noble-tda-scan');
-- Delete a job:   SELECT cron.unschedule('noble-tda-scan');
-- View job logs:  SELECT * FROM cron.job_run_details
--                  WHERE name IN ('noble-tda-scan', 'noble-schedule-execute')
--                  ORDER BY start_time DESC LIMIT 10;
-- ----------------------------------------------------------
