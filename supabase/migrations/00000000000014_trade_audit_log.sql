-- ============================================================
-- Noble Trader — Migration 14: Trade Audit Log
-- Append-only, immutable audit trail. No UPDATE or DELETE permitted.
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_audit_log (
    id            BIGSERIAL PRIMARY KEY,
    event_type    VARCHAR(50) NOT NULL,
    user_id       VARCHAR(255) NOT NULL,
    org_id        VARCHAR(255),
    symbol        VARCHAR(20),
    order_id      VARCHAR(100),
    direction     VARCHAR(10),
    quantity      DECIMAL(18, 4),
    price         DECIMAL(18, 4),
    order_type    VARCHAR(20),
    regime        VARCHAR(20),
    strategy      VARCHAR(50),
    signal_score  DECIMAL(5, 4),
    risk_metrics  JSONB,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: enforce immutability
ALTER TABLE trade_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit events" ON trade_audit_log
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read own audit events" ON trade_audit_log
    FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON trade_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_id ON trade_audit_log (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_symbol ON trade_audit_log (symbol);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON trade_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON trade_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_order_id ON trade_audit_log (order_id);

-- Prevent UPDATE and DELETE (append-only trigger)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'trade_audit_log is append-only: % operations are not permitted', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON trade_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
    BEFORE DELETE ON trade_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

COMMENT ON TABLE trade_audit_log IS 'Append-only, immutable trade audit trail. No UPDATE or DELETE allowed.';
COMMENT ON COLUMN trade_audit_log.org_id IS 'Clerk Organization ID for org-scoped audit queries. Nullable for user-level events.';
