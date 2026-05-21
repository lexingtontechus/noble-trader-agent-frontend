-- Migration 25: Audit Log Archive Tables + GDPR Erasure Log
-- Creates archive tables for hot/cold storage and GDPR compliance tracking.

-- ── Archive Tables (same schema as originals + archived_at) ──────────────────

-- Trade Audit Log Archive
CREATE TABLE IF NOT EXISTS trade_audit_log_archive (
  id            BIGINT PRIMARY KEY,
  event_type    VARCHAR,
  user_id       VARCHAR,
  org_id        VARCHAR,
  symbol        VARCHAR,
  order_id      VARCHAR,
  direction     VARCHAR,
  quantity      NUMERIC,
  price         NUMERIC,
  order_type    VARCHAR,
  regime        VARCHAR,
  strategy      VARCHAR,
  signal_score  NUMERIC,
  risk_metrics  JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tala_archived_at ON trade_audit_log_archive (archived_at DESC);
CREATE INDEX idx_tala_user_id ON trade_audit_log_archive (user_id);

-- Rate Limit Violations Archive
CREATE TABLE IF NOT EXISTS rate_limit_violations_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  identifier      TEXT,
  identifier_type TEXT,
  tier            TEXT,
  pathname        TEXT,
  limit_max       INT,
  window_ms       INT,
  current_count   INT,
  user_agent      TEXT,
  ip_address      TEXT,
  plan            TEXT,
  role            TEXT,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rlva_archived_at ON rate_limit_violations_archive (archived_at DESC);

-- Reconciliation Results Archive
CREATE TABLE IF NOT EXISTS reconciliation_results_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  user_id         VARCHAR,
  status          VARCHAR,
  total_orders    INT,
  matched_count   INT,
  mismatch_count  INT,
  missing_count   INT,
  details         JSONB,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rra_archived_at ON reconciliation_results_archive (archived_at DESC);

-- Portfolio Snapshots Archive
CREATE TABLE IF NOT EXISTS portfolio_snapshots_archive (
  id              UUID PRIMARY KEY,
  created_at      TIMESTAMPTZ,
  user_id         VARCHAR,
  total_value     NUMERIC,
  total_pnl       NUMERIC,
  positions       JSONB,
  metadata        JSONB,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_psa_archived_at ON portfolio_snapshots_archive (archived_at DESC);
CREATE INDEX idx_psa_user_id ON portfolio_snapshots_archive (user_id);

-- ── GDPR Erasure Log ────────────────────────────────────────────────────────
-- Required by GDPR Article 17: must keep a record that erasure occurred.

CREATE TABLE IF NOT EXISTS gdpr_erasure_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL,
  reason                TEXT NOT NULL DEFAULT 'gdpr_request',
  tables_affected       TEXT[] NOT NULL DEFAULT '{}',
  total_records_purged  INT NOT NULL DEFAULT 0,
  purged_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gel_user_id ON gdpr_erasure_log (user_id);
CREATE INDEX idx_gel_purged_at ON gdpr_erasure_log (purged_at DESC);

ALTER TABLE gdpr_erasure_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to gdpr_erasure_log"
  ON gdpr_erasure_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── pg_cron: Daily Retention Job ────────────────────────────────────────────
-- Runs at 3 AM UTC to archive old records and purge expired archives.

SELECT cron.schedule(
  'noble-retention-archive',
  '0 3 * * *',
  $$
  -- Archive trade_audit_log records older than 90 days
  INSERT INTO trade_audit_log_archive
  SELECT *, now() as archived_at FROM trade_audit_log
  WHERE created_at < now() - interval '90 days'
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM trade_audit_log
  WHERE created_at < now() - interval '90 days'
  AND id IN (SELECT id FROM trade_audit_log_archive);

  -- Archive rate_limit_violations older than 30 days
  INSERT INTO rate_limit_violations_archive
  SELECT *, now() as archived_at FROM rate_limit_violations
  WHERE created_at < now() - interval '30 days'
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM rate_limit_violations
  WHERE created_at < now() - interval '30 days'
  AND id IN (SELECT id FROM rate_limit_violations_archive);

  -- Purge archive tables older than their retention period
  DELETE FROM rate_limit_violations_archive
  WHERE archived_at < now() - interval '90 days';

  DELETE FROM trade_audit_log_archive
  WHERE archived_at < now() - interval '365 days';
  $$
);
