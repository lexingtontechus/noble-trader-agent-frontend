-- ============================================================
-- Noble Trader — Migration 09: Universe Snapshot (Survivorship Bias)
-- Point-in-time index constituent changes for bias-free backtests.
-- ============================================================

CREATE TABLE IF NOT EXISTS nt_universe_snapshot (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker      TEXT    NOT NULL,
    index_name  TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    action_date DATE    NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one action per ticker per index per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_unique
    ON nt_universe_snapshot (ticker, index_name, action_date, action);

-- Fast lookup: what was in the index on date X?
CREATE INDEX IF NOT EXISTS idx_universe_lookup
    ON nt_universe_snapshot (index_name, action_date);

-- Fast lookup: when was ticker X added/removed?
CREATE INDEX IF NOT EXISTS idx_universe_ticker
    ON nt_universe_snapshot (ticker, index_name);

-- RLS
ALTER TABLE nt_universe_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can do everything" ON nt_universe_snapshot
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE nt_universe_snapshot IS
    'Point-in-time index constituent changes for survivorship-bias-free backtests';
