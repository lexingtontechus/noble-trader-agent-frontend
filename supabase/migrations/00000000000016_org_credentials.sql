-- ============================================================
-- Noble Trader — Migration 16: Org Credentials (Multi-Tenant)
-- Adds org_id column to credentials table for org-level credential resolution.
-- Prerequisite: Migration 08 (credentials table)
-- ============================================================

ALTER TABLE credentials ADD COLUMN IF NOT EXISTS org_id TEXT;

-- Index for fast org-level credential lookups
CREATE INDEX IF NOT EXISTS idx_credentials_org_id
ON credentials (org_id) WHERE org_id IS NOT NULL;

-- Composite index for the exact query pattern used by resolve_alpaca_credentials
CREATE INDEX IF NOT EXISTS idx_credentials_org_valid
ON credentials (org_id, is_valid, credential_type)
WHERE org_id IS NOT NULL AND is_valid = true;

-- RLS policy: org members can read org-level credentials
CREATE POLICY "Org members can read org credentials"
ON credentials FOR SELECT
USING (
  org_id IS NOT NULL
  AND auth.jwt() ->> 'org_id' = org_id
);

COMMENT ON COLUMN credentials.org_id IS
'Clerk Organization ID. When set, these credentials are resolved for all org members. Takes priority over user-level credentials.';
