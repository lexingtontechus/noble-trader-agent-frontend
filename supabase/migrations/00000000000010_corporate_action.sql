-- ============================================================
-- Noble Trader — Migration 10: Corporate Actions
-- Stock splits, dividends, spinoffs for price adjustment in backtests.
-- ============================================================

CREATE TABLE IF NOT EXISTS nt_corporate_action (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker      TEXT    NOT NULL,
    action_type TEXT    NOT NULL,
    ex_date     DATE    NOT NULL,
    record_date DATE,
    factor      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    amount      DOUBLE PRECISION,
    description TEXT,
    source      TEXT    NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one action per ticker per type per ex-date
CREATE UNIQUE INDEX IF NOT EXISTS idx_corp_action_unique
    ON nt_corporate_action (ticker, action_type, ex_date);

-- Fast lookup: what actions happened on or before date X?
CREATE INDEX IF NOT EXISTS idx_corp_action_lookup
    ON nt_corporate_action (ticker, ex_date);

-- RLS
ALTER TABLE nt_corporate_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can do everything" ON nt_corporate_action
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE nt_corporate_action IS
    'Corporate actions (splits, dividends, spinoffs) for price adjustment in backtests';
