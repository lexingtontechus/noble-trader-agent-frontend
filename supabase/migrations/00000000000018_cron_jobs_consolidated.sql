-- ============================================================
-- Noble Trader — Migration 18: Consolidated Cron Jobs
-- Single source of truth for ALL pg_cron scheduled jobs.
--
-- Replaces the following former migrations:
--   - 00000000000003_evolution_cron.sql
--   - 00000000000005_scheduled_orders_cron.sql
--   - 010_cron_vault_secrets.sql
--   - 20260511_cron_jobs.sql
--   - setup-cron.sql
--
-- Prerequisites:
--   1. pg_cron + pg_net extensions enabled (done below)
--   2. Vault secrets configured in Dashboard → Vault:
--      - Name: cron_secret       Value: <your CRON_SECRET from Vercel>
--      - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
--   3. Migration 17 must be applied first (campaign_tick function)
--
-- All secrets read from Supabase Vault (vault.read_secret()).
-- No GUC variables used (Supabase hosted plans don't support them).
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;

-- 2. Grant pg_net access to the postgres role
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;

-- 3. Verify Vault secrets exist
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING — add in Dashboard → Vault' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- 4. Unschedule all existing noble-* jobs (safe — errors if they don't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('noble-campaign-tick');
  RAISE NOTICE 'Unscheduled noble-campaign-tick';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-campaign-tick to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-tda-scan');
  RAISE NOTICE 'Unscheduled noble-tda-scan';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-tda-scan to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-schedule-execute');
  RAISE NOTICE 'Unscheduled noble-schedule-execute';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-schedule-execute to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-rotate');
  RAISE NOTICE 'Unscheduled noble-strategy-rotate';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-strategy-rotate to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-optimize');
  RAISE NOTICE 'Unscheduled noble-strategy-optimize';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-strategy-optimize to unschedule';
END;
$$;

-- 5. Schedule: Campaign tick (every 60s during US market hours)
--    Market hours: 9:30 AM – 4:00 PM ET = 13:30 – 20:00 UTC
SELECT cron.schedule(
  'noble-campaign-tick',
  '* 13-20 * * 1-5',
  $$SELECT public.campaign_tick();$$
);

-- 6. Schedule: TDA Early Warning Scan (every 4 hours)
SELECT cron.schedule(
  'noble-tda-scan',
  '0 */4 * * *',
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

-- 7. Schedule: Scheduled Order Execution (every 15 min during market hours)
SELECT cron.schedule(
  'noble-schedule-execute',
  '*/15 13-20 * * 1-5',
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

-- 8. Schedule: Strategy Rotation Check (every 6 hours)
SELECT cron.schedule(
  'noble-strategy-rotate',
  '0 */6 * * *',
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

-- 9. Schedule: Daily Strategy Optimization (10pm UTC, Mon-Fri)
SELECT cron.schedule(
  'noble-strategy-optimize',
  '0 22 * * 1-5',
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

-- 10. Verify all 5 jobs are scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN (
  'noble-campaign-tick',
  'noble-tda-scan',
  'noble-schedule-execute',
  'noble-strategy-rotate',
  'noble-strategy-optimize'
) ORDER BY name;

-- ============================================================
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause a job:     SELECT cron.pause('noble-tda-scan');
-- Resume a job:    SELECT cron.resume('noble-tda-scan');
-- Delete a job:    SELECT cron.unschedule('noble-tda-scan');
-- View job logs:   SELECT * FROM cron.job_run_details
--                   WHERE name LIKE 'noble-%'
--                   ORDER BY start_time DESC LIMIT 20;
--
-- Verify Vault secrets:
--   SELECT name,
--     CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
--   FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);
-- ============================================================
