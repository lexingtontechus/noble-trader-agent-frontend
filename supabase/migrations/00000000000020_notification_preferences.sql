-- ============================================================
-- Noble Trader — Migration 20: Notification Preferences
-- User-configurable notification preferences for channel routing,
-- alert type filtering, quiet hours, and digest settings.
-- ============================================================

-- 1. Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE,
    channels        JSONB NOT NULL DEFAULT '{"in_app": true, "discord": false, "email": false}',
    alert_types     JSONB NOT NULL DEFAULT '{
        "trade_filled": true,
        "trade_rejected": true,
        "order_submitted": true,
        "risk_breach": true,
        "kill_switch": true,
        "mode_change": true,
        "pnl_threshold": true,
        "regime_change": false,
        "strategy_signal": false,
        "campaign_complete": true,
        "reconciliation": true
    }',
    quiet_hours     JSONB DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00", "timezone": "America/New_York"}',
    digest_settings JSONB DEFAULT '{"enabled": false, "frequency": "daily", "time": "18:00"}',
    discord_webhook_url TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 3. Service role policy (full access for BFF routes using SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access on notification_preferences" ON notification_preferences
    FOR ALL USING (true) WITH CHECK (true);

-- 4. User read own preferences
CREATE POLICY "Users can read own notification preferences" ON notification_preferences
    FOR SELECT USING (user_id = auth.jwt() ->> 'sub');

-- 5. User update own preferences
CREATE POLICY "Users can update own notification preferences" ON notification_preferences
    FOR UPDATE USING (user_id = auth.jwt() ->> 'sub');

-- 6. User insert own preferences
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences
    FOR INSERT WITH CHECK (user_id = auth.jwt() ->> 'sub');

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences (user_id);

-- 8. Updated_at trigger
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trigger_update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- 9. Table comment
COMMENT ON TABLE notification_preferences IS 'User-configurable notification preferences for channel routing, alert type filtering, quiet hours, and digest settings.';
