# Backtesting UI Proposal — Noble Trader Agent

## Overview

The Renko HFT pipeline has a backend `/renko/backtest/stats` endpoint that returns backtest statistics, but there's no visual UI to run backtests, compare strategies, or visualize results. This proposal outlines a comprehensive Backtesting UI.

---

## Architecture

### Data Flow

```
User Config → BFF Route → FastAPI /renko/backtest/* → Results → Charts + Tables
```

### Key Principle: Reuse the existing pipeline

The Renko pipeline already processes historical data during warmup. A backtest simply runs the same pipeline with different parameters over a historical period and measures performance — no new backend logic needed.

---

## Backend Endpoints Needed

### 1. `POST /renko/backtest/run` — Run a full backtest

Request:
```json
{
  "symbol": "SPY",
  "brick_size": 0.5,
  "period": "1y",
  "regime": "low_vol_bull",
  "sl_bricks": 3,
  "tp_bricks": 5,
  "max_trades_per_session": 10,
  "signal_confidence_min": 0.5
}
```

Response:
```json
{
  "trades": [...],
  "equity_curve": [...],
  "stats": {
    "total_trades": 42,
    "win_rate": 0.595,
    "profit_factor": 1.67,
    "max_drawdown_bricks": 8.5,
    "sharpe_ratio": 1.23,
    "avg_win_bricks": 4.2,
    "avg_loss_bricks": -2.8,
    "total_pnl_bricks": 38.5,
    "kelly_fraction": 0.185
  },
  "config_used": {...}
}
```

### 2. `GET /renko/backtest/compare` — Compare multiple configs

Query params: `symbol`, configs as JSON array of config objects.

### 3. `POST /renko/backtest/optimize` — Parameter sweep

Run backtests across a grid of parameter values and return results for each combination.

---

## Frontend Components

### 1. `BacktestPanel.jsx` — Main backtest tab (7th Renko tab)

Sections:
- **Configuration Form**: All tunable parameters with sliders/inputs
- **Run Button**: Triggers backtest via BFF route
- **Results Dashboard**: Shows after completion

### 2. `BacktestResults.jsx` — Results visualization

Charts (recharts):
- **Equity Curve**: Cumulative P&L over trades
- **Drawdown Underwater Plot**: Same as RiskDashboard
- **Monthly Returns Heatmap**: Calendar-style grid
- **Parameter Sensitivity**: How P&L changes with each parameter

Tables:
- **Trade Log**: All trades with entry/exit, P&L, pattern type
- **Statistics Summary**: Win rate, Sharpe, max DD, profit factor

### 3. `BacktestComparison.jsx` — Side-by-side comparison

- Run backtest with Config A vs Config B
- Overlay equity curves
- Show delta metrics (improvement %)

### 4. `ParameterSweep.jsx` — Optimization grid

- 2D heatmap: X axis = one param, Y axis = another, color = P&L or Sharpe
- Sliders to select parameter ranges
- "Find Optimal" button (uses Optuna on backend if available)

---

## BFF Routes

### `POST /api/renko/backtest/run`
- Accepts backtest config
- Proxies to FastAPI `/renko/backtest/run`
- Optionally caches results in Supabase/Redis

### `POST /api/renko/backtest/compare`
- Runs multiple backtests in parallel
- Returns comparison data

### `POST /api/renko/backtest/optimize`
- Parameter sweep with grid search
- Returns matrix of results

---

## Implementation Steps

1. **Add backend backtest endpoint** (FastAPI `renko/router.py`)
   - Accept config + historical data
   - Run pipeline in isolation (don't affect live pipeline)
   - Return comprehensive stats

2. **Create BFF routes** (`/api/renko/backtest/*`)
   - Proxy to FastAPI
   - Add caching for backtest results

3. **Build BacktestPanel component**
   - Configuration form with all parameters
   - Results display with charts

4. **Add comparison view**
   - Side-by-side equity curves
   - Delta metrics table

5. **Add parameter sweep**
   - 2D heatmap visualization
   - Optimal parameter suggestion

---

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Backend backtest endpoint | 2-3 hours |
| BFF routes | 1 hour |
| BacktestPanel + Results | 3-4 hours |
| Comparison view | 2 hours |
| Parameter sweep | 2-3 hours |
| **Total** | **10-13 hours** |

---

## Key Design Decisions

1. **Isolation**: Backtests should NOT affect the live pipeline. Use a separate pipeline instance.
2. **Caching**: Backtest results for the same config+period should be cached (Redis 1h TTL).
3. **Progressive loading**: Show partial results as chunks are processed.
4. **Export**: Allow downloading backtest results as CSV/JSON for external analysis.
