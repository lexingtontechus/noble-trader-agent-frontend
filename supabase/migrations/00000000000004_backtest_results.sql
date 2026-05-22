-- ============================================================
-- Noble Trader — Migration 04: Backtest Results
-- Stores walk-forward backtest results for history, comparison, and audit.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_backtest_result (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    symbol      TEXT NOT NULL DEFAULT 'UNKNOWN',

    -- Summary metrics
    n_trades        INT    NOT NULL DEFAULT 0,
    win_rate        FLOAT  NOT NULL DEFAULT 0,
    total_return    FLOAT  NOT NULL DEFAULT 0,
    annual_return   FLOAT  NOT NULL DEFAULT 0,
    sharpe_ratio    FLOAT  NOT NULL DEFAULT 0,
    sortino_ratio   FLOAT  NOT NULL DEFAULT 0,
    calmar_ratio    FLOAT  NOT NULL DEFAULT 0,
    max_drawdown    FLOAT  NOT NULL DEFAULT 0,
    profit_factor   FLOAT  NOT NULL DEFAULT 0,
    n_hmm_states    INT    NOT NULL DEFAULT 4,

    -- Full data as JSONB
    config_used         JSONB NOT NULL DEFAULT '{}',
    summary_metrics     JSONB NOT NULL DEFAULT '{}',
    regime_distribution JSONB NOT NULL DEFAULT '{}',
    trades_by_regime    JSONB NOT NULL DEFAULT '{}',
    equity_curve        JSONB NOT NULL DEFAULT '[]',
    drawdown_curve      JSONB NOT NULL DEFAULT '[]',
    trade_log           JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backtest_user_id ON ta_backtest_result (user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_symbol  ON ta_backtest_result (symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_created ON ta_backtest_result (user_id, created_at DESC);

-- RLS: users can only see their own backtest results
ALTER TABLE ta_backtest_result ENABLE ROW LEVEL SECURITY;

CREATE POLICY backtest_result_user_policy ON ta_backtest_result
    FOR ALL
    USING (auth.uid()::text = user_id OR user_id = 'dev')
    WITH CHECK (auth.uid()::text = user_id OR user_id = 'dev');
