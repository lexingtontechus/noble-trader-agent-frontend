-- Migration 24: Rate Limit Violations Log
-- Tracks rate limit breaches for monitoring, abuse detection, and analytics.

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who / what triggered the violation
  identifier    TEXT NOT NULL,           -- userId or IP
  identifier_type TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'ip'
  tier          TEXT NOT NULL,           -- Rate limit tier (trade, data, admin, etc.)
  pathname      TEXT NOT NULL,           -- URL path that was rate-limited

  -- Limit details
  limit_max     INT NOT NULL,            -- The rate limit that was exceeded
  window_ms     INT NOT NULL,            -- Window duration in ms
  current_count INT NOT NULL,            -- Current request count when blocked

  -- Request metadata
  user_agent    TEXT,
  ip_address    TEXT,
  plan          TEXT,                     -- User's plan (free/premium/institutional)
  role          TEXT                      -- User's role (viewer/trader/admin)
);

-- Indexes for common queries
CREATE INDEX idx_rlv_created_at ON rate_limit_violations (created_at DESC);
CREATE INDEX idx_rlv_identifier ON rate_limit_violations (identifier);
CREATE INDEX idx_rlv_tier ON rate_limit_violations (tier);
CREATE INDEX idx_rlv_identifier_type ON rate_limit_violations (identifier_type);

-- Auto-partition by month for efficient querying (Supabase supports declarative partitioning)
-- For now, just a regular table. Can be partitioned later if volume is high.

-- Row Level Security
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view rate limit violations"
  ON rate_limit_violations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      -- Admin-only access via service role
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access to rate limit violations"
  ON rate_limit_violations FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-cleanup: delete violations older than 90 days
-- (Can be managed via pg_cron if needed)
