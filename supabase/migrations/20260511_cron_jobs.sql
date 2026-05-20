-- ============================================================
-- Noble Trader Agent — Supabase pg_cron + pg_net Migration
-- Sets up two cron jobs that call the Next.js API routes:
--   1. TDA Early Warning Scan (every 4 hours)
--   2. Scheduled Order Execution (every 15 minutes during market hours)
--
-- PREREQUISITES (run in Supabase Dashboard → SQL Editor first):
--   1. Enable pg_net extension:  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
--   2. Enable pg_cron extension: CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;
--   3. Add secrets in Dashboard → Vault:
--      - Name: cron_secret       Value: <your CRON_SECRET (same as Vercel)>
--      - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
--
-- CONFIGURATION:
--   - CRON_SECRET must match the CRON_SECRET in Vercel env vars
--   - Secrets are read from Supabase Vault using vault.read_secret()
--   - The base URL and cron secret are NOT stored as GUC variables
--     (Supabase hosted plans don't support ALTER DATABASE SET for custom GUCs)
--
-- IMPORTANT: Add the Vault secrets BEFORE running this migration.
-- ============================================================

-- ----------------------------------------------------------
-- Verify Vault secrets exist
-- ----------------------------------------------------------
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING — add in Dashboard → Vault' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- ----------------------------------------------------------
-- Cron Job — TDA Early Warning Scan (every 4 hours)
-- Calls: POST /api/tda/scan?secret=CRON_SECRET
-- Headers: x-cron-secret: CRON_SECRET
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-tda-scan',              -- job name
  '0 */4 * * *',                 -- every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/tda/scan?secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', vault.read_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------
-- Cron Job — Scheduled Order Execution
-- Calls: POST /api/trading/schedule/execute?secret=CRON_SECRET
-- Headers: x-cron-secret: CRON_SECRET
-- Runs every 15 minutes during US market hours (13:30-20:00 UTC = 9:30am-4pm ET)
-- ----------------------------------------------------------
SELECT cron.schedule(
  'noble-schedule-execute',      -- job name
  '*/15 13-20 * * 1-5',         -- every 15 min, Mon-Fri, 13:30-20:00 UTC
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
-- Verify the jobs are scheduled
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
--
-- Verify Vault secrets:
--   SELECT name,
--     CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
--   FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);
-- ----------------------------------------------------------
