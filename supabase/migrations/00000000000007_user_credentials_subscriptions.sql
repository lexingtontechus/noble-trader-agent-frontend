-- ============================================================
-- Noble Trader — Migration 07: User Credentials, Subscriptions & Onboarding
-- Encrypted Alpaca API keys, subscription tiers, onboarding progress.
-- Encryption is handled in the application layer (AES-256-GCM).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'Provides cryptographic functions (gen_random_uuid, etc.)';

-- Helper function: auto-set updated_at on row update
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

-- ============================================================
-- 1. user_credentials table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id         TEXT        NOT NULL,
  credential_type       TEXT        NOT NULL CHECK (credential_type IN ('paper', 'live')),
  api_key_encrypted     TEXT        NOT NULL,
  secret_key_encrypted  TEXT        NOT NULL,
  is_valid              BOOLEAN     DEFAULT true,
  last_validated_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_credential_type UNIQUE (clerk_user_id, credential_type)
);

COMMENT ON TABLE public.user_credentials IS
  'Stores encrypted Alpaca API keys per user. Each user may have one paper and one live credential set.';
COMMENT ON COLUMN public.user_credentials.api_key_encrypted IS 'AES-256-GCM encrypted Alpaca API key (base64-encoded, encrypted in application layer)';
COMMENT ON COLUMN public.user_credentials.secret_key_encrypted IS 'AES-256-GCM encrypted Alpaca secret key (base64-encoded, encrypted in application layer)';

-- Updated-at trigger
CREATE TRIGGER trg_user_credentials_updated_at
  BEFORE UPDATE ON public.user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_credentials_clerk_user_id ON public.user_credentials (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_credential_type ON public.user_credentials (credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_is_valid ON public.user_credentials (is_valid) WHERE is_valid = false;

-- RLS
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credentials"
  ON public.user_credentials FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own credentials"
  ON public.user_credentials FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own credentials"
  ON public.user_credentials FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own credentials"
  ON public.user_credentials FOR DELETE
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_credentials"
  ON public.user_credentials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. user_subscriptions table
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

COMMENT ON TABLE public.user_subscriptions IS
  'Tracks user subscription plan and billing state. One row per user.';

CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_clerk_user_id ON public.user_subscriptions (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON public.user_subscriptions (plan);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_status ON public.user_subscriptions (plan_status) WHERE plan_status != 'active';
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_helio_id ON public.user_subscriptions (helio_subscription_id) WHERE helio_subscription_id IS NOT NULL;

-- RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. user_onboarding table
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

CREATE TRIGGER trg_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_onboarding_clerk_user_id ON public.user_onboarding (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_incomplete ON public.user_onboarding (clerk_user_id) WHERE onboarding_complete = false;

-- RLS
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding"
  ON public.user_onboarding FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own onboarding"
  ON public.user_onboarding FOR INSERT
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own onboarding"
  ON public.user_onboarding FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub')
  WITH CHECK (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Service role full access on user_onboarding"
  ON public.user_onboarding FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_credentials TO authenticated;
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;
