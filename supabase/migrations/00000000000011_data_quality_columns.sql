-- ============================================================
-- Noble Trader — Migration 11: Data Quality & Lineage Columns
-- Adds data_hash, data_source, price_adjustment, universe_mode,
-- and look_ahead_audit columns to ta_backtest_result.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS data_hash TEXT;
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS data_source JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS price_adjustment TEXT DEFAULT 'raw';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS universe_mode TEXT DEFAULT 'current_constituents';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS look_ahead_audit JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_backtest_data_hash
    ON ta_backtest_result (data_hash) WHERE data_hash IS NOT NULL;

COMMENT ON COLUMN ta_backtest_result.data_hash IS 'SHA-256 hash of input price data for reproducibility verification';
COMMENT ON COLUMN ta_backtest_result.data_source IS 'Provenance metadata: source, fetch_date, adjustment_level';
COMMENT ON COLUMN ta_backtest_result.price_adjustment IS 'Price adjustment mode: raw, split_adjusted, fully_adjusted';
COMMENT ON COLUMN ta_backtest_result.universe_mode IS 'Universe filtering mode: current_constituents or pit_constituents';
COMMENT ON COLUMN ta_backtest_result.look_ahead_audit IS 'Look-ahead bias audit results: warnings or clean status';
