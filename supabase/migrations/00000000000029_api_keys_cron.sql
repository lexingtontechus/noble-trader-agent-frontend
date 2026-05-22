-- Migration 29: API Keys — pg_cron for auto-expiry and cleanup
--
-- Schedules the expire_stale_api_keys() function (created in migration 027)
-- to run daily at 3 AM UTC. Also revokes keys whose rotation grace period
-- has expired.
--
-- Prerequisites:
--   1. pg_cron extension enabled (done in migration 018)
--   2. expire_stale_api_keys() function exists (migration 027)

-- 1. Schedule daily auto-expire job at 3 AM UTC
--    This handles:
--      - Free-tier keys past their 30-day expiry
--      - Any keys with expires_at in the past
--      - Keys whose rotation_grace_until has passed
DO $$
BEGIN
  -- Remove existing schedule if present (idempotent)
  PERFORM cron.unschedule('noble-expire-api-keys');
  RAISE NOTICE 'Unscheduled noble-expire-api-keys (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-expire-api-keys to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-expire-api-keys',
  '0 3 * * *',  -- Daily at 3:00 AM UTC
  $$SELECT expire_stale_api_keys();$$
);

-- 2. Also expire keys past their rotation grace period
--    The expire_stale_api_keys() function only checks expires_at,
--    so we add a separate cleanup for rotation grace periods.
CREATE OR REPLACE FUNCTION expire_rotation_grace_keys()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE api_keys
  SET is_active = false, revoked_at = now()
  WHERE is_active = true
    AND rotation_grace_until IS NOT NULL
    AND rotation_grace_until < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expire_rotation_grace_keys() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('noble-expire-grace-keys');
  RAISE NOTICE 'Unscheduled noble-expire-grace-keys (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-expire-grace-keys to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-expire-grace-keys',
  '30 3 * * *',  -- Daily at 3:30 AM UTC (after the main expiry job)
  $$SELECT expire_rotation_grace_keys();$$
);

-- 3. Verify both jobs are scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name IN ('noble-expire-api-keys', 'noble-expire-grace-keys')
ORDER BY name;
