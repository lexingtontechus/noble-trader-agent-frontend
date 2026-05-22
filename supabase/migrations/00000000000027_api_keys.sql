-- Migration 27: API Keys — SaaS API key management with plan-aware expiry
-- Supports: free (1 key, 30-day expiry), premium (1 key, permanent), institutional (5 keys, permanent)
-- Key format: nt_live_{64 hex chars} — stored as SHA-256 hash for security
-- Integrates with Helio subscription webhooks for automatic key lifecycle management

-- ── api_keys table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT NOT NULL,
  key_hash          TEXT NOT NULL UNIQUE,          -- SHA-256 of full API key
  key_prefix        TEXT NOT NULL,                 -- e.g. "nt_live_a3f2" for UI display
  name              TEXT DEFAULT 'Default Key',    -- User-friendly label
  plan_at_creation  TEXT NOT NULL DEFAULT 'free'   -- Plan at time of key creation
                    CHECK (plan_at_creation IN ('free', 'premium', 'institutional')),
  role_at_creation  TEXT NOT NULL DEFAULT 'viewer' -- Role at time of key creation
                    CHECK (role_at_creation IN ('viewer', 'trader', 'admin')),
  scopes            JSONB,                         -- Future: granular scopes (null = role-based)
  expires_at        TIMESTAMPTZ,                   -- NULL = permanent (premium/institutional)
  last_used_at      TIMESTAMPTZ,
  last_used_ip      TEXT,                          -- Hashed IP for audit trail
  rotated_from      UUID REFERENCES api_keys(id) ON DELETE SET NULL, -- Key rotation chain
  rotation_grace_until TIMESTAMPTZ,                -- Old key stays valid until this time during rotation
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup: hash-based auth (most frequent query)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = true;

-- User's keys: management UI listing
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(clerk_user_id);

-- Expiry cleanup: find keys nearing expiration
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- Rotation chain: trace key history
CREATE INDEX IF NOT EXISTS idx_api_keys_rotated_from ON api_keys(rotated_from) WHERE rotated_from IS NOT NULL;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys (never the full hash — prefix only)
DO $$ BEGIN
  CREATE POLICY "Users can manage their own API keys"
    ON api_keys FOR ALL
    USING (clerk_user_id = auth.jwt() ->> 'sub');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (BFF routes use service_role key)
DO $$ BEGIN
  CREATE POLICY "Service role has full API key access"
    ON api_keys FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Helper: count active keys per user ────────────────────────────────────────
-- Used by BFF routes to enforce plan-based key limits

CREATE OR REPLACE FUNCTION count_active_api_keys(p_clerk_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM api_keys
  WHERE clerk_user_id = p_clerk_user_id
    AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Helper: expire stale free-tier keys ────────────────────────────────────────
-- Can be called by pg_cron or admin endpoint

CREATE OR REPLACE FUNCTION expire_stale_api_keys()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE api_keys
  SET is_active = false, revoked_at = now()
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Grant permissions ─────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO service_role;
GRANT EXECUTE ON FUNCTION count_active_api_keys(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION expire_stale_api_keys() TO service_role;
