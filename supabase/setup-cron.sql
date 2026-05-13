-- ============================================================
-- Noble Trader Agent — One-Time Setup Script
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor
--
-- IMPORTANT: Replace <YOUR_BASE_URL> and <YOUR_CRON_SECRET>
-- with your actual values before running.
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- 2. Grant pg_net access to the postgres role
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;

-- 3. Set GUC variables for the cron jobs to reference
--    Replace the values below with your actual deployment URL and CRON_SECRET
ALTER DATABASE postgres SET app.noble_base_url = '<YOUR_BASE_URL>';
ALTER DATABASE postgres SET app.noble_cron_secret = '<YOUR_CRON_SECRET>';

-- 4. Schedule TDA scan (every 4 hours)
SELECT cron.schedule(
  'noble-tda-scan',
  '0 */4 * * *',
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

-- 5. Schedule order execution (every 15 min, Mon-Fri, US market hours 13:30-20:00 UTC)
SELECT cron.schedule(
  'noble-schedule-execute',
  '*/15 13-20 * * 1-5',
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

-- 6. Verify
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN ('noble-tda-scan', 'noble-schedule-execute');
