-- ============================================================
-- Noble Trader — Migration 30: Price Alerts
-- User-defined price alerts that trigger on real-time WebSocket ticks.
-- Supports above/below/crosses directions with cooldown.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_price_alerts (
    id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id           VARCHAR(255) NOT NULL,
    symbol            VARCHAR(30) NOT NULL,
    target_price      DOUBLE PRECISION NOT NULL,
    direction         VARCHAR(10) NOT NULL DEFAULT 'above',  -- 'above' | 'below' | 'crosses'
    severity          VARCHAR(10) NOT NULL DEFAULT 'info',    -- 'info' | 'warning' | 'error'
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    triggered         BOOLEAN NOT NULL DEFAULT FALSE,
    triggered_at      TIMESTAMPTZ,
    cooldown_minutes  INTEGER NOT NULL DEFAULT 15,
    last_triggered    TIMESTAMPTZ,
    trigger_count     INTEGER NOT NULL DEFAULT 0,
    label             VARCHAR(100),                           -- optional user label
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE ta_price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ta_price_alerts
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON ta_price_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_enabled ON ta_price_alerts (user_id, enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON ta_price_alerts (symbol);
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON ta_price_alerts (user_id, triggered) WHERE triggered = TRUE AND enabled = TRUE;

COMMENT ON TABLE ta_price_alerts IS 'User-defined price alerts triggered by real-time WebSocket price feed. Supports above/below/crosses directions with cooldown to prevent spam.';
