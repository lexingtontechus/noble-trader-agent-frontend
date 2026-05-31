-- ============================================================
-- Noble Trader — Migration 12: Statistical Rigor Columns
-- Bootstrap CIs, deflated Sharpe, multiple testing, significance tests.
-- Prerequisite: Migration 04 (ta_backtest_result table)
-- ============================================================

ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS bootstrap_cis JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS deflated_sharpe_result JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS multiple_testing_results JSONB DEFAULT '{}';
ALTER TABLE ta_backtest_result ADD COLUMN IF NOT EXISTS significance_test_results JSONB DEFAULT '{}';

COMMENT ON COLUMN ta_backtest_result.bootstrap_cis IS 'Bootstrap confidence intervals for key metrics (Sharpe, win rate, profit factor, max drawdown, mean return)';
COMMENT ON COLUMN ta_backtest_result.deflated_sharpe_result IS 'Deflated Sharpe Ratio result — DSR probability, raw Sharpe, n_trials, threshold, interpretation';
COMMENT ON COLUMN ta_backtest_result.multiple_testing_results IS 'Multiple testing correction results — Bonferroni, Holm-Bonferroni, Benjamini-Hochberg FDR';
COMMENT ON COLUMN ta_backtest_result.significance_test_results IS 'Strategy significance test results — White Reality Check, Hansen SPA';
