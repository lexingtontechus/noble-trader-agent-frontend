-- ============================================================
-- Noble Trader Agent — One-Time Setup Script (Vault-based)
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor
--
-- This script uses Supabase Vault for secret storage instead
-- of GUC variables (ALTER DATABASE SET), which Supabase does
-- not support on hosted plans.
--
-- PREREQUISITES:
--   1. Add secrets in Dashboard → Vault:
--      - Name: cron_secret       Value: <your CRON_SECRET (same as Vercel)>
--      - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
--   2. CRON_SECRET must also be set in Vercel (Project Settings → Environment Variables)
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- 2. Grant pg_net access to the postgres role
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;

-- 3. Verify Vault secrets exist (will show NULL if not configured)
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING — add in Dashboard → Vault' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- 4. Schedule TDA scan (every 4 hours)
--    Reads secrets from Vault: vault.read_secret('cron_secret'), vault.read_secret('noble_base_url')
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

-- 5. Schedule order execution (every 15 min, Mon-Fri, US market hours 13:30-20:00 UTC)
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

-- 6. Schedule campaign tick (every minute during market hours)
--    Uses the campaign_tick() function which also reads from Vault
SELECT cron.schedule(
  'noble-campaign-tick',
  '* 13-20 * * 1-5',
  $$SELECT public.campaign_tick();$$
);

-- 7. Schedule strategy rotation check (every 6 hours)
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

-- 8. Schedule daily strategy optimization (10pm UTC, Mon-Fri)
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

-- 9. Verify all jobs
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN ('noble-campaign-tick', 'noble-tda-scan', 'noble-schedule-execute', 'noble-strategy-rotate', 'noble-strategy-optimize');
