-- ============================================================
-- Noble Trader — Migration 19: Portfolio Snapshots
-- Daily portfolio snapshots for long-term equity curve tracking.
-- Enables historical P&L analysis beyond Alpaca's 30-day API limit.
--
-- Prerequisites:
--   1. pg_cron + pg_net extensions enabled (Migration 18)
--   2. Vault secrets configured (cron_secret, noble_base_url)
--   3. Migration 18 must be applied first (cron jobs)
-- ============================================================

-- 1. Create portfolio_snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT NOT NULL,
    snapshot_date   DATE NOT NULL,
    equity          DECIMAL(15,2),
    cash            DECIMAL(15,2),
    positions       JSONB DEFAULT '[]',
    day_pnl         DECIMAL(12,2),
    unrealized_pnl  DECIMAL(12,2),
    realized_pnl    DECIMAL(12,2),
    total_value     DECIMAL(15,2),
    benchmark_value DECIMAL(15,2),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, snapshot_date)
);

-- 2. Enable RLS
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. Service role policy (full access for BFF routes using SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access" ON portfolio_snapshots
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_id ON portfolio_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON portfolio_snapshots (user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots (snapshot_date DESC);

-- 5. Table comment
COMMENT ON TABLE portfolio_snapshots IS 'Daily portfolio snapshots for long-term equity curve tracking. One row per user per day, upserted by cron job or manual capture.';

-- 6. Schedule: Daily portfolio snapshot capture at market close (8:00 PM UTC = 4:00 PM ET)
--    Runs weekdays only (Mon-Fri) since markets are closed on weekends.
DO $$
BEGIN
  PERFORM cron.unschedule('noble-portfolio-snapshot');
  RAISE NOTICE 'Unscheduled noble-portfolio-snapshot (if existed)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No noble-portfolio-snapshot to unschedule';
END;
$$;

SELECT cron.schedule(
  'noble-portfolio-snapshot',
  '0 20 * * 1-5',  -- 8:00 PM UTC = 4:00 PM ET, weekdays only
  $$
  SELECT net.http_post(
    url := vault.read_secret('noble_base_url') || '/api/portfolio/snapshot/capture?cron_secret=' || vault.read_secret('cron_secret'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || vault.read_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 7. Verify the job is scheduled
SELECT jobid, name, schedule, active
FROM cron.job
WHERE name = 'noble-portfolio-snapshot';

-- ============================================================
-- UTILITY COMMANDS (run as needed in SQL Editor):
--
-- Pause snapshot job:   SELECT cron.pause('noble-portfolio-snapshot');
-- Resume snapshot job:  SELECT cron.resume('noble-portfolio-snapshot');
-- Delete snapshot job:  SELECT cron.unschedule('noble-portfolio-snapshot');
--
-- View recent snapshots for a user:
--   SELECT * FROM portfolio_snapshots
--   WHERE user_id = '<clerk_user_id>'
--   ORDER BY snapshot_date DESC LIMIT 30;
--
-- Delete old snapshots (> 2 years):
--   DELETE FROM portfolio_snapshots
--   WHERE created_at < NOW() - INTERVAL '2 years';
-- ============================================================
