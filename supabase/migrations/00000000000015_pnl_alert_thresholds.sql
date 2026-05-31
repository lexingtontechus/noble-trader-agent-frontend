-- ============================================================
-- Noble Trader — Migration 15: P&L Alert Thresholds
-- Per-user P&L alert rules. Persists across server restarts.
-- ============================================================

CREATE TABLE IF NOT EXISTS pnl_alert_thresholds (
    id                VARCHAR(36) PRIMARY KEY,
    user_id           VARCHAR(255) NOT NULL,
    metric            VARCHAR(30) NOT NULL,
    operator          VARCHAR(20) NOT NULL,
    value             DOUBLE PRECISION NOT NULL,
    severity          VARCHAR(10) NOT NULL DEFAULT 'warning',
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes  INTEGER NOT NULL DEFAULT 15,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered    TIMESTAMPTZ
);

-- RLS
ALTER TABLE pnl_alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pnl_alert_thresholds
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pnl_alert_user_id ON pnl_alert_thresholds (user_id);
CREATE INDEX IF NOT EXISTS idx_pnl_alert_enabled ON pnl_alert_thresholds (user_id, enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_pnl_alert_metric ON pnl_alert_thresholds (metric);

COMMENT ON TABLE pnl_alert_thresholds IS 'P&L alert thresholds for real-time risk monitoring. Persists across server restarts.';
