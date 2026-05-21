-- ============================================================
-- Noble Trader — Migration 13: Execution Modeling Columns
-- Adds execution_modeling JSONB column to ta_backtest_result.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS execution_modeling JSONB DEFAULT NULL;

COMMENT ON COLUMN ta_backtest_result.execution_modeling IS 'Execution modeling summary (market impact, fill probability, borrow/financing costs)';
