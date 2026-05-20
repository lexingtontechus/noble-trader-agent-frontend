# Phase 4 Frontend Update - Work Record

## Summary
Updated the noble-trader-agent-frontend project to support Phase 4 of the backtest enhancement roadmap. All changes are frontend-only; backend was already done.

## Changes Made

### 1. New BFF Routes
- **`/src/app/api/renko/backtest/walk-forward/route.ts`** — POST handler proxying to FastAPI `/renko/backtest/walk-forward`. Accepts prices, symbol, config params, trainWindow, testWindow, minTradesForStats. Converts camelCase→snake_case. Redis cache with `renko:walk-forward` prefix.
- **`/src/app/api/renko/backtest/monte-carlo/route.ts`** — POST handler proxying to FastAPI `/renko/backtest/monte-carlo`. Accepts prices, symbol, config params, nSimulations. Converts camelCase→snake_case. Redis cache with `renko:monte-carlo` prefix.

### 2. Updated BFF Routes (initial_capital)
- **`/src/app/api/renko/backtest/run/route.ts`** — Added `initialCapital = 100000.0` destructuring and `initial_capital: initialCapital` in payload.
- **`/src/app/api/renko/backtest/run/stream/route.ts`** — Same changes as run route.

### 3. Updated BacktestPanel.jsx
- Added `initial_capital: 100000.0` to DEFAULT_CONFIG
- Added `walk_forward` and `monte_carlo` modes to MODES array
- Added state: `walkForwardResult`, `monteCarloResult`, `wfConfig`, `mcConfig`
- Added `WalkForwardConfig` and `MonteCarloConfig` sub-components
- Added `handleWalkForward` and `handleMonteCarlo` handlers
- Added `initial_capital` input to ConfigForm
- Renders WalkForwardResults and MonteCarloResults in appropriate mode sections
- Dynamic mode handler and label helpers

### 4. Updated BacktestResults.jsx
- **BUG FIX**: Changed `t.status === "closed"` to `t.status?.startsWith("closed")` to match all closed variants (closed_tp, closed_sl, etc.)
- Added **Dollar P&L Metrics** section displaying data from `stats.dollar_stats`: Total P&L ($), Return %, Dollar Sharpe, Dollar Max DD, Avg P&L/Trade ($), Dollar Profit Factor
- Added **Regime-Conditional Performance** section (Phase 4D): table with Regime/Trades/Win Rate/P&L ($)/Return %/Avg P&L ($)/Cost ($), plus a BarChart showing P&L by regime

### 5. Created WalkForwardResults.jsx
- Aggregate summary cards: Total Windows, Avg OOS P&L, Degradation Ratio, Avg OOS Sharpe, Avg OOS Win Rate
- Degradation analysis with interpretation
- IS vs OOS comparison bar chart (recharts)
- Per-window results table
- Config used section

### 6. Created MonteCarloResults.jsx
- Summary cards: P(Profitable), P(Beat Original), P5/P95 P&L range, Mean P&L, Simulations
- Statistical significance interpretation section
- Confidence band chart using recharts AreaChart with p5-p95 and p25-p75 shaded areas, p50 median, original bold line
- Original backtest summary section

## Build & Test Results
- `next build`: ✅ Success, all routes including walk-forward and monte-carlo
- `vitest run`: ✅ All 45 tests pass (6 test files)
