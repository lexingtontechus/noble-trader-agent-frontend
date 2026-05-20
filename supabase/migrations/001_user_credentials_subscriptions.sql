-- ============================================================
-- Noble Trader Agent — User Credentials, Subscriptions & Onboarding
-- Migration: 001_user_credentials_subscriptions.sql
--
-- Creates:
--   1. user_credentials  — Encrypted Alpaca API keys (paper + live)
--   2. user_subscriptions — Plan/subscription state (free/premium/institutional)
--   3. user_onboarding   — Onboarding progress tracking
--
-- PREREQUISITES:
--   - Supabase project must be provisioned
--   - The `app.encryption_key` database setting must be configured
--     (ALTER DATABASE <db> SET app.encryption_key = '<your-32-char-key>';)
--   - pgcrypto extension requires superuser to enable
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

COMMENT ON EXTENSION pgcrypto IS 'Provides cryptographic functions for encrypting API credentials (pgp_sym_encrypt/decrypt)';

-- ============================================================
-- 1. Helper Functions
-- ============================================================

-- Updated-at trigger: auto-set updated_at = now() on every row update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger function: automatically sets updated_at to current timestamp on row update';

-- Encrypt a plaintext value using the app.encryption_key setting
CREATE OR REPLACE FUNCTION public.encrypt_credential(plain_text TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not set. Configure it with: ALTER DATABASE %% SET app.encryption_key = ''<key>''';
  END IF;
  RETURN pgp_sym_encrypt(plain_text, enc_key);
END;
$$;

COMMENT ON FUNCTION public.encrypt_credential(TEXT) IS
  'Encrypts a plaintext string using pgp_sym_encrypt with the app.encryption_key database setting. Returns BYTEA ciphertext.';

-- Decrypt a ciphertext value using the app.encryption_key setting
CREATE OR REPLACE FUNCTION public.decrypt_credential(cipher_text BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not set. Configure it with: ALTER DATABASE %% SET app.encryption_key = ''<key>''';
  END IF;
  RETURN pgp_sym_decrypt(cipher_text, enc_key);
END;
$$;

COMMENT ON FUNCTION public.decrypt_credential(BYTEA) IS
  'Decrypts a BYTEA ciphertext using pgp_sym_decrypt with the app.encryption_key database setting. Returns plaintext TEXT.';

-- ============================================================
-- 2. user_credentials table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id         TEXT        NOT NULL,
  credential_type       TEXT        NOT NULL CHECK (credential_type IN ('paper', 'live')),
  api_key_encrypted     BYTEA       NOT NULL,
  secret_key_encrypted  BYTEA       NOT NULL,
  is_valid              BOOLEAN     DEFAULT true,
  last_validated_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  -- One credential row per (user, type) — user cannot have duplicate paper/live entries
  CONSTRAINT uq_user_credential_type UNIQUE (clerk_user_id, credential_type)
);

-- Column comments
COMMENT ON TABLE public.user_credentials IS
  'Stores encrypted Alpaca API keys per user. Each user may have one ''paper'' and one ''live'' credential set.';
COMMENT ON COLUMN public.user_credentials.id IS 'Primary key';
COMMENT ON COLUMN public.user_credentials.clerk_user_id IS 'Clerk user ID — identifies the user in the auth system';
COMMENT ON COLUMN public.user_credentials.credential_type IS 'Key environment: ''paper'' for paper-trading, ''live'' for real-money';
COMMENT ON COLUMN public.user_credentials.api_key_encrypted IS 'PGP-encrypted Alpaca API key (use encrypt_credential() to insert)';
COMMENT ON COLUMN public.user_credentials.secret_key_encrypted IS 'PGP-encrypted Alpaca secret key (use encrypt_credential() to insert)';
COMMENT ON COLUMN public.user_credentials.is_valid IS 'True if keys passed last validation check; set to false on auth failure';
COMMENT ON COLUMN public.user_credentials.last_validated_at IS 'Timestamp of the most recent successful key validation';
COMMENT ON COLUMN public.user_credentials.created_at IS 'Row creation timestamp';
COMMENT ON COLUMN public.user_credentials.updated_at IS 'Row last-modified timestamp (auto-updated via trigger)';

-- Updated-at trigger
CREATE TRIGGER trg_user_credentials_updated_at
  BEFORE UPDATE ON public.user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_credentials_clerk_user_id
  ON public.user_credentials (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_credential_type
  ON public.user_credentials (credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_is_valid
  ON public.user_credentials (is_valid)
  WHERE is_valid = false;  -- partial index: only rows that need attention

-- RLS
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only see their own credentials (auth.jwt->>'sub' is the Clerk user ID)
CREATE POLICY "Users can read own credentials"
  ON public.user_credentials
  FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own credentials"
  ON public.user_credentials
  FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own credentials"
  ON public.user_credentials
  FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own credentials"
  ON public.user_credentials
  FOR DELETE
  USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Service role bypasses RLS (used by backend/API routes)
CREATE POLICY "Service role full access on user_credentials"
  ON public.user_credentials
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. user_subscriptions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL UNIQUE,
  plan                    TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'institutional')),
  plan_status             TEXT        NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'cancelled', 'trialing')),
  helio_subscription_id   TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN     DEFAULT false,
  trial_ends_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Column comments
COMMENT ON TABLE public.user_subscriptions IS
  'Tracks user subscription plan and billing state. One row per user — plan determines feature access.';
COMMENT ON COLUMN public.user_subscriptions.id IS 'Primary key';
COMMENT ON COLUMN public.user_subscriptions.clerk_user_id IS 'Clerk user ID — unique, one subscription per user';
COMMENT ON COLUMN public.user_subscriptions.plan IS 'Subscription tier: ''free'', ''premium'', or ''institutional''';
COMMENT ON COLUMN public.user_subscriptions.plan_status IS 'Billing status: ''active'', ''past_due'', ''cancelled'', or ''trialing''';
COMMENT ON COLUMN public.user_subscriptions.helio_subscription_id IS 'Helio Pay subscription ID for billing reference';
COMMENT ON COLUMN public.user_subscriptions.current_period_start IS 'Start of the current billing period';
COMMENT ON COLUMN public.user_subscriptions.current_period_end IS 'End of the current billing period';
COMMENT ON COLUMN public.user_subscriptions.cancel_at_period_end IS 'If true, subscription will not renew at period end';
COMMENT ON COLUMN public.user_subscriptions.trial_ends_at IS 'When the trial period expires (null if no trial)';
COMMENT ON COLUMN public.user_subscriptions.created_at IS 'Row creation timestamp';
COMMENT ON COLUMN public.user_subscriptions.updated_at IS 'Row last-modified timestamp (auto-updated via trigger)';

-- Updated-at trigger
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_clerk_user_id
  ON public.user_subscriptions (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan
  ON public.user_subscriptions (plan);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_status
  ON public.user_subscriptions (plan_status)
  WHERE plan_status != 'active';  -- partial index: focus on non-active for ops
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_helio_id
  ON public.user_subscriptions (helio_subscription_id)
  WHERE helio_subscription_id IS NOT NULL;

-- RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription (no direct write — managed by backend/webhooks)
CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Service role full access
CREATE POLICY "Service role full access on user_subscriptions"
  ON public.user_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. user_onboarding table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL UNIQUE,
  onboarding_complete     BOOLEAN     DEFAULT false,
  current_step            INTEGER     DEFAULT 0,
  paper_keys_configured   BOOLEAN     DEFAULT false,
  live_keys_configured    BOOLEAN     DEFAULT false,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Column comments
COMMENT ON TABLE public.user_onboarding IS
  'Tracks per-user onboarding progress — which steps are done, whether API keys are configured.';
COMMENT ON COLUMN public.user_onboarding.id IS 'Primary key';
COMMENT ON COLUMN public.user_onboarding.clerk_user_id IS 'Clerk user ID — unique, one onboarding record per user';
COMMENT ON COLUMN public.user_onboarding.onboarding_complete IS 'True once all required onboarding steps are finished';
COMMENT ON COLUMN public.user_onboarding.current_step IS 'Zero-indexed step the user is currently on';
COMMENT ON COLUMN public.user_onboarding.paper_keys_configured IS 'True when user has saved valid paper-trading API keys';
COMMENT ON COLUMN public.user_onboarding.live_keys_configured IS 'True when user has saved valid live-trading API keys';
COMMENT ON COLUMN public.user_onboarding.completed_at IS 'Timestamp when onboarding was marked complete';
COMMENT ON COLUMN public.user_onboarding.created_at IS 'Row creation timestamp';
COMMENT ON COLUMN public.user_onboarding.updated_at IS 'Row last-modified timestamp (auto-updated via trigger)';

-- Updated-at trigger
CREATE TRIGGER trg_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_onboarding_clerk_user_id
  ON public.user_onboarding (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_incomplete
  ON public.user_onboarding (clerk_user_id)
  WHERE onboarding_complete = false;  -- partial index: active onboarding sessions

-- RLS
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own onboarding state
CREATE POLICY "Users can read own onboarding"
  ON public.user_onboarding
  FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own onboarding"
  ON public.user_onboarding
  FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own onboarding"
  ON public.user_onboarding
  FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

-- Service role full access
CREATE POLICY "Service role full access on user_onboarding"
  ON public.user_onboarding
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 5. Grants
-- ============================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_credentials TO authenticated;
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;

-- ============================================================
-- 6. Validation: ensure encryption key is configurable
-- ============================================================
-- This block is informational — it will raise a notice at migration time
-- if the key is not yet set. It does NOT block the migration.
DO $$
BEGIN
  IF current_setting('app.encryption_key', true) IS NULL THEN
    RAISE NOTICE
      'app.encryption_key is not set. Encrypted credential functions will fail until configured. '
      'Run: ALTER DATABASE %% SET app.encryption_key = ''<your-secret-key>''';
  ELSE
    RAISE NOTICE 'app.encryption_key is configured. Encryption functions are ready.';
  END IF;
END;
$$;
