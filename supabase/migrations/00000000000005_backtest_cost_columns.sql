-- ============================================================
-- Noble Trader — Migration 05: Backtest Cost Tracking Columns
-- Adds aggregate cost columns to ta_backtest_result for efficient
-- querying, sorting, and list-view display without parsing JSONB.
-- ============================================================

ALTER TABLE ta_backtest_result
    ADD COLUMN IF NOT EXISTS total_commission     FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_slippage       FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cost           FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_return         FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_drag_pct        FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_cost_per_trade   FLOAT NOT NULL DEFAULT 0;

-- Indexes for cost-based queries
CREATE INDEX IF NOT EXISTS idx_backtest_cost_drag
    ON ta_backtest_result (user_id, cost_drag_pct DESC)
    WHERE cost_drag_pct > 0;

CREATE INDEX IF NOT EXISTS idx_backtest_total_cost
    ON ta_backtest_result (user_id, total_cost DESC)
    WHERE total_cost > 0;

-- Backfill existing rows from JSONB
UPDATE ta_backtest_result
SET
    total_commission = COALESCE(
        (SELECT SUM(COALESCE((t->>'commission')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    total_slippage = COALESCE(
        (SELECT SUM(COALESCE((t->>'slippage_cost')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    total_cost = COALESCE(
        (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
         FROM jsonb_array_elements(trade_log) AS t),
        0
    ),
    gross_return = COALESCE(
        total_return + COALESCE(
            (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
             FROM jsonb_array_elements(trade_log) AS t),
            0
        ) / 100000.0,
        total_return
    ),
    cost_drag_pct = CASE
        WHEN total_return != 0 THEN
            COALESCE(
                (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
                 FROM jsonb_array_elements(trade_log) AS t),
                0
            ) / ABS(total_return * 100000.0) * 100
        ELSE 0
    END,
    avg_cost_per_trade = CASE
        WHEN n_trades > 0 THEN
            COALESCE(
                (SELECT SUM(COALESCE((t->>'total_cost')::float, 0))
                 FROM jsonb_array_elements(trade_log) AS t),
                0
            ) / n_trades
        ELSE 0
    END
WHERE total_commission = 0
  AND trade_log != '[]'::jsonb;
