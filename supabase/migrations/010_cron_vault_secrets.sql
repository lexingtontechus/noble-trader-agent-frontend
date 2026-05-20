-- ============================================================
-- Noble Trader Agent — Migrate Cron Secrets to Supabase Vault
-- Migration: 010_cron_vault_secrets.sql
--
-- Replaces GUC-based secrets (current_setting) with
-- Supabase Vault (vault.read_secret()) for all cron jobs.
--
-- PREREQUISITES:
--   1. CRON_SECRET must already be stored in Supabase Vault
--     (Dashboard → Vault → Add Secret, name: cron_secret)
--   2. NOBLE_BASE_URL must be stored in Supabase Vault
--     (Dashboard → Vault → Add Secret, name: noble_base_url)
--   3. The Vault extension must be enabled (it is by default
--     on Supabase)
--
-- WHY VAULT INSTEAD OF GUC?
--   Supabase does not support ALTER DATABASE SET for custom
--   GUC variables on hosted plans. The recommended approach
--   is Supabase Vault, which stores secrets encrypted at rest
--   and exposes them via vault.read_secret().
--
-- ARCHITECTURE:
--   pg_cron → SQL function → vault.read_secret() → net.http_post()
--   → /api/campaign/tick (or /api/tda/scan, /api/trading/schedule/execute,
--     /api/evolution/rotate, /api/evolution/optimize)
--   → Authorization: Bearer <CRON_SECRET> or x-cron-secret header
-- ============================================================

-- ============================================================
-- 1. Ensure Vault extension is available
-- ============================================================
-- Supabase Vault is enabled by default. If not, run:
-- CREATE EXTENSION IF NOT EXISTS vault SCHEMA vault;

-- ============================================================
-- 2. Helper: Read a secret from Vault with fallback
-- ============================================================
-- vault.read_secret(secret_name) returns the decrypted value.
-- It returns NULL if the secret doesn't exist.

-- ============================================================
-- 3. Update campaign_tick() to use Vault
-- ============================================================
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
  -- Read secrets from Supabase Vault
  base_url := vault.read_secret('noble_base_url');
  secret := vault.read_secret('cron_secret');

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'Vault secrets noble_base_url or cron_secret not found — campaign tick skipped. Add them in Dashboard → Vault.';
    RETURN;
  END IF;

  -- Fire-and-forget HTTP POST to the campaign tick endpoint
  SELECT INTO response net.http_post(
    url := base_url || '/api/campaign/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Campaign tick fired to %, response status: %', base_url || '/api/campaign/tick', response;
END;
$$;

COMMENT ON FUNCTION public.campaign_tick() IS
  'pg_cron callback: fires HTTP POST to the campaign tick API route every minute during market hours. Reads CRON_SECRET and base URL from Supabase Vault.';

-- ============================================================
-- 4. Re-schedule all cron jobs using Vault-based functions
-- ============================================================

-- Remove old schedules (safe — errors if they don't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('noble-campaign-tick');
  RAISE NOTICE 'Unscheduled old noble-campaign-tick';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old noble-campaign-tick to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-tda-scan');
  RAISE NOTICE 'Unscheduled old noble-tda-scan';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old noble-tda-scan to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-schedule-execute');
  RAISE NOTICE 'Unscheduled old noble-schedule-execute';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old noble-schedule-execute to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-rotate');
  RAISE NOTICE 'Unscheduled old noble-strategy-rotate';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old noble-strategy-rotate to unschedule';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-strategy-optimize');
  RAISE NOTICE 'Unscheduled old noble-strategy-optimize';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No old noble-strategy-optimize to unschedule';
END;
$$;

-- ============================================================
-- 5. Schedule: Campaign tick (every 60s during US market hours)
-- ============================================================
-- Market hours: 9:30 AM – 4:00 PM ET = 13:30 – 20:00 UTC
SELECT cron.schedule(
  'noble-campaign-tick',
  '* 13-20 * * 1-5',     -- every minute, Mon-Fri, 13:30-20:00 UTC
  $$SELECT public.campaign_tick();$$
);

-- ============================================================
-- 6. Schedule: TDA Early Warning Scan (every 4 hours)
-- ============================================================
-- Uses inline Vault reads for the URL and secret
SELECT cron.schedule(
  'noble-tda-scan',
  '0 */4 * * *',          -- every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
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

-- ============================================================
-- 7. Schedule: Scheduled Order Execution (every 15 min during market hours)
-- ============================================================
SELECT cron.schedule(
  'noble-schedule-execute',
  '*/15 13-20 * * 1-5',   -- every 15 min, Mon-Fri, 13:30-20:00 UTC
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

-- ============================================================
-- 8. Schedule: Strategy Rotation Check (every 6 hours)
-- ============================================================
SELECT cron.schedule(
  'noble-strategy-rotate',
  '0 */6 * * *',           -- every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
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

-- ============================================================
-- 9. Schedule: Daily Strategy Optimization (10pm UTC, Mon-Fri)
-- ============================================================
SELECT cron.schedule(
  'noble-strategy-optimize',
  '0 22 * * 1-5',          -- 10pm UTC, Mon-Fri (after market close)
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

-- ============================================================
-- 10. Verify all jobs are scheduled
-- ============================================================
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN ('noble-campaign-tick', 'noble-tda-scan', 'noble-schedule-execute', 'noble-strategy-rotate', 'noble-strategy-optimize');

-- ============================================================
-- 11. Clean up old GUC variables (optional, safe to skip)
-- ============================================================
-- These ALTER DATABASE RESET commands remove the old GUC variables.
-- Only run if you're confident the Vault migration is working.
-- You must RECONNECT after running these.
--
-- ALTER DATABASE postgres RESET app.campaign_tick_url;
-- ALTER DATABASE postgres RESET app.cron_secret;
-- ALTER DATABASE postgres RESET app.noble_base_url;
-- ALTER DATABASE postgres RESET app.noble_cron_secret;

-- ============================================================
-- UTILITY: Verify Vault secrets exist
-- ============================================================
-- Run this to check that your Vault secrets are configured:
--
-- SELECT
--   id, name, description,
--   CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END as status
-- FROM vault.secrets
-- WHERE name IN ('cron_secret', 'noble_base_url');
--
-- If either shows MISSING, add them in:
--   Dashboard → Vault → Add Secret
--   - Name: cron_secret       Value: <your CRON_SECRET from Vercel>
--   - Name: noble_base_url    Value: https://noble-trader-agent-frontend.vercel.app
