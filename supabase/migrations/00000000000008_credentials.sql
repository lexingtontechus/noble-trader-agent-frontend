-- ============================================================
-- Noble Trader — Migration 08: Backend Credentials Table
-- Alpaca API keys per user/org (used by FastAPI backend).
-- Separate from user_credentials (frontend) which uses AES-256-GCM encryption.
-- ============================================================

CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    org_id TEXT,
    api_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    credential_type TEXT NOT NULL DEFAULT 'paper' CHECK (credential_type IN ('paper', 'live')),
    is_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    label TEXT
);

-- Index for user-level lookups (used by resolve_alpaca_credentials)
CREATE INDEX IF NOT EXISTS idx_credentials_user_valid
ON credentials (user_id, is_valid, credential_type)
WHERE is_valid = true;

-- Enable RLS
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credentials"
ON credentials FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert own credentials"
ON credentials FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update own credentials"
ON credentials FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete own credentials"
ON credentials FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

COMMENT ON TABLE credentials IS
'Alpaca API credentials stored per-user or per-org. Paper keys are resolved first, then live keys.';
