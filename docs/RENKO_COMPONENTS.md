# Renko HFT Pipeline — Noble Trader Agent

## Overview

The Renko HFT Pipeline is a 6-layer event-driven trading system that converts real-time tick data into disciplined, risk-managed trades via Alpaca paper trading.

**Pipeline Flow:**
```
Tick → Brick Engine → Swing Classifier → Pattern Detector → Signal Filter → Risk Manager → Order Executor
```

## Access

- **Frontend Tab**: Click the 🧱 **Renko** tab in the navigation bar, or press **Ctrl+7**
- **Backend API**: `https://noble-trader-fastapi-backend.onrender.com/renko/`

## UI Tabs

### 🧱 Brick Chart
- Visual Renko brick chart (last 50 bricks)
- Color coding: **green** = UP brick, **red** = DOWN brick
- Swing labels shown as badges: HH (Higher High), HL (Higher Low), LH (Lower High), LL (Lower Low)
- Brick velocity indicator (bricks per minute)
- Horizontal scroll on mobile

### 📊 Signals & Patterns
- **Active Position Card**: Entry price, direction, P&L in bricks/$, SL/TP levels
- **Recent Signals Table**: Direction, pattern type, price, confidence, velocity, brick count
- **Signal Filters Status**: Session window, regime gate, cooldown, daily loss limit, max consecutive losses, max trades
- **Kelly Fraction Estimate**: Recommended position sizing from trade journal

### 💰 Trades & Journal
- **Session Stats**: Trades taken, win rate, daily P&L, max drawdown
- **Equity Curve**: SVG visualization of cumulative P&L in bricks
- **Cumulative Stats**: Total trades, total P&L ($), total P&L (bricks), avg P&L per trade
- **Trade History Table**: Symbol, direction, entry/exit price, P&L, status, close reason

### ⚙️ Configuration
- **Brick Engine**: brick_size, brick_size_mode (fixed/ATR/adaptive), reversal_bricks
- **Pattern Detection**: bull_trigger_n, bear_trigger_n
- **Risk Management**: sl_bricks, tp_bricks, trailing_stop, trail_after_bricks, trail_distance_bricks
- **Signal Filter**: max_trades_per_session, max_daily_loss_bricks, max_consecutive_losses, cooldown_seconds, regime_gate, symbol

> ⚠️ Changing configuration **resets the pipeline** — all bricks, trades, and state are cleared.

## Backend API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/renko/tick` | POST | Process single tick `{price, timestamp?, symbol?}` |
| `/renko/tick/batch` | POST | Batch ticks for backtest `{prices, timestamps?, regimes?}` |
| `/renko/state` | GET | Current pipeline state |
| `/renko/stats` | GET | Comprehensive stats (config, state, session, journal) |
| `/renko/bricks` | GET | Recent bricks `?symbol=SPY&last_n=100` |
| `/renko/classified` | GET | Classified bricks with swing labels |
| `/renko/signals` | GET | Pattern signals |
| `/renko/trades` | GET | Trade records |
| `/renko/swing-points` | GET | Detected swing points |
| `/renko/regime` | POST | Update HMM regime `{regime}` |
| `/renko/equity` | POST | Update account equity `{equity}` |
| `/renko/config` | POST | Update config (resets pipeline) |
| `/renko/reset` | POST | Reset pipeline for symbol |
| `/renko/backtest/stats` | GET | Backtest/trading statistics |

### Backtest Endpoints (Isolated — Never Affect Live Pipeline)

These endpoints create standalone `RenkoPipeline` instances for each request. They never read from or write to the live pipeline registry, making them safe for experimentation and parameter tuning.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/renko/backtest/run` | POST | Run a full Renko pipeline backtest on historical prices |
| `/renko/backtest/compare` | POST | Compare 2–10 Renko configs side-by-side on the same price data |
| `/renko/backtest/optimize` | POST | Grid-search parameter sweep for Renko pipeline optimisation (max 50 combos) |

All three endpoints are rate-limited and require authentication. Backtest runs execute in thread pools on the backend to avoid blocking the event loop.

## BFF Backtest Routes

The frontend Next.js app provides BFF (Backend-For-Frontend) routes that proxy to the backend Renko backtest endpoints with auth header forwarding, cold-start retry, and error handling:

| BFF Route | Method | Proxies To |
|-----------|--------|------------|
| `/api/renko/backtest/run` | POST | `POST /renko/backtest/run` |
| `/api/renko/backtest/compare` | POST | `POST /renko/backtest/compare` |
| `/api/renko/backtest/optimize` | POST | `POST /renko/backtest/optimize` |

### BFF Route Details

**POST /api/renko/backtest/run**

Proxies to the backend's isolated Renko backtest runner. Accepts `RenkoBacktestRequest` body (prices + pipeline config) and returns `RenkoBacktestResponse` with stats and trade records.

**POST /api/renko/backtest/compare**

Proxies to the backend's config comparison endpoint. Accepts `RenkoBacktestCompareRequest` body (prices + 2–10 labelled configs) and returns `RenkoBacktestCompareResponse` with per-config results and a diff summary.

**POST /api/renko/backtest/optimize**

Proxies to the backend's grid-search optimizer. Accepts `RenkoBacktestOptimizeRequest` body (prices + param_grid + fixed defaults) and returns `RenkoBacktestOptimizeResponse` with results per combination and best-by highlights.

## Client Helpers

The `src/lib/renko-client.js` module provides typed async functions for calling the Renko backtest BFF routes:

### `runRenkoBacktest(params)`

Run a full isolated Renko pipeline backtest.

```javascript
import { runRenkoBacktest } from '@/lib/renko-client';

const result = await runRenkoBacktest({
  prices: [450.10, 451.20, 449.80, ...],
  symbol: 'SPY',
  brick_size: 0.50,
  sl_bricks: 3,
  tp_bricks: 5,
  trailing_stop: true,
  regime_gate: true,
  // ... other RenkoConfig params
  timestamps: [1709500000, 1709500060, ...],  // optional
  regimes: ['low_vol_bull', 'low_vol_bull', ...],  // optional
  signal_confidence_min: 0.5,  // optional
});

// result: { symbol, total_ticks, total_bricks, config_used, stats, trades }
```

### `compareRenkoBacktests(params)`

Compare multiple Renko pipeline configurations side-by-side.

```javascript
import { compareRenkoBacktests } from '@/lib/renko-client';

const result = await compareRenkoBacktests({
  prices: [450.10, 451.20, 449.80, ...],
  symbol: 'SPY',
  configs: [
    {
      label: 'conservative',
      brick_size: 0.50,
      sl_bricks: 4,
      tp_bricks: 6,
      regime_gate: true,
    },
    {
      label: 'aggressive',
      brick_size: 0.25,
      sl_bricks: 2,
      tp_bricks: 4,
      regime_gate: false,
    },
  ],
  timestamps: [1709500000, 1709500060, ...],  // optional
  regimes: ['low_vol_bull', 'low_vol_bull', ...],  // optional
});

// result: { comparisons: [...RenkoBacktestResponse], diff: {...} }
```

### `optimizeRenkoBacktest(params)`

Grid-search parameter sweep for Renko pipeline optimisation.

```javascript
import { optimizeRenkoBacktest } from '@/lib/renko-client';

const result = await optimizeRenkoBacktest({
  prices: [450.10, 451.20, 449.80, ...],
  symbol: 'SPY',
  param_grid: {
    brick_size: [0.25, 0.50, 1.00],
    sl_bricks: [2, 3],
    tp_bricks: [4, 5, 6],
  },
  // Fixed defaults for params not in the grid:
  brick_size: 0.50,  // overridden by grid for those combos
  trailing_stop: true,
  regime_gate: true,
  // ... other fixed params
  timestamps: [1709500000, 1709500060, ...],  // optional
  regimes: ['low_vol_bull', 'low_vol_bull', ...],  // optional
});

// result: { results: [...], best_by_sharpe: {...}, best_by_return: {...}, n_combinations: 18 }
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `brick_size` | 0.50 | Price movement per brick in dollars |
| `reversal_bricks` | 2 | Classic Renko: 2× brick_size for reversal |
| `bull_trigger_n` | 3 | Consecutive HH/HL bricks for bull signal |
| `bear_trigger_n` | 3 | Consecutive LL/LH bricks for bear signal |
| `sl_bricks` | 3 | Stop-loss distance in bricks |
| `tp_bricks` | 5 | Take-profit distance in bricks |
| `trailing_stop` | true | Enable trailing stop |
| `trail_after_bricks` | 3 | Start trailing after N bricks profit |
| `trail_distance_bricks` | 2 | Trail distance in bricks behind peak |
| `max_trades_per_session` | 15 | Hard cap on daily trades |
| `max_daily_loss_bricks` | 10 | Stop trading after N bricks lost |
| `max_consecutive_losses` | 3 | Pause after N consecutive losses |
| `cooldown_seconds` | 30 | Min seconds between trades |
| `regime_gate` | true | Only trade with HMM regime alignment |

## Risk Math

- **R:R Ratio**: SL=3, TP=5 → 1:1.67
- **Breakeven Win Rate**: 37.5% (3/8)
- **Positive Expectancy**: At 55% WR → +0.40 bricks/trade
- **Kelly Fraction**: Dynamically estimated from trade journal (last 50 trades)

## Frontend Architecture

```
src/
├── lib/
│   ├── renko-client.js              # API client with retry/backoff
│   └── supabase/db.js               # Prisma-like Supabase wrapper (with upsert)
├── app/api/renko/
│   ├── [action]/route.js            # BFF proxy route (auth, cold-start retry)
│   └── warmup/route.js              # BFF warm-up (Yahoo Finance + Supabase upsert)
└── components/renko/
    ├── RenkoPage.jsx                # Main orchestrator (4 sub-tabs, cache logic)
    ├── BrickChart.jsx               # CSS Renko brick chart
    ├── SignalsPanel.jsx             # Signals, filters, active position
    ├── TradesPanel.jsx              # Trade journal, equity curve
    └── ConfigPanel.jsx              # Pipeline configuration form
```

## Data Persistence & Freshness

### Supabase Cache (`ta_renko_snapshot`)

Warm-up results are persisted to Supabase so returning visitors see data instantly without re-warming. Each row is keyed by `(symbol, brick_size)` and stores:

| Column | Type | Contents |
|--------|------|----------|
| `bricks` | JSONB | Full Renko brick array |
| `classified` | JSONB | Bricks with swing labels (HH/HL/LH/LL) |
| `signals` | JSONB | Pattern signals |
| `trades` | JSONB | Trade records |
| `stats` | JSONB | Pipeline statistics |
| `config` | JSONB | Pipeline configuration |
| `price_range` | JSONB | Min/max prices from warm-up data |
| `updated_at` | TIMESTAMPTZ | Last refresh timestamp |

The Supabase write is handled by the BFF warm-up endpoint at `/api/renko/warmup`, which uses a native **upsert** on `(symbol, brick_size)` — a single atomic operation that inserts or updates without a separate find-first query.

### Cache TTL: 4 Hours

Staleness is calculated as `age = now - updated_at`. Data older than 4 hours is considered **stale**. The BFF GET endpoint returns `{ cached: true, stale: true/false, ... }` so the frontend can decide whether to trigger a background refresh.

### Data Flow Decision Tree

```
+---------------------------------------------------+
|              Load Renko Data                       |
|  (Page load / Symbol switch / Manual Warm Up)     |
+------------------------+--------------------------+
                         |
                         v
              +----------------------+
              | Supabase Cache Check |
              | GET /api/renko/warmup|
              +----------+-----------+
                         |
              +----------+----------+
              |         |           |
              v         v           v
           FRESH       STALE     MISSING
           (<4h)       (>4h)     (no row)
              |         |           |
              v         v           v
        Show instantly  Show old    Backend fetch
        DONE            data NOW   /renko/state
                        + fire         |
                        background     v
                        warmup    +-----------+
                       (non-      | Has data? |
                        blocking) +-----+-----+
                                        |
                                 +------+------+
                                 v             v
                                YES           NO
                                 |             |
                                 v             v
                           Show from      Auto-warmup
                           pipeline       (Yahoo Finance
                           DONE           -> feed pipeline
                                          -> save Supabase)
```

### Trigger Behavior Matrix

| Trigger | Fresh Cache (<4h) | Stale Cache (>4h) | No Cache |
|---------|-------------------|-------------------|----------|
| **Page Load** | Instant from Supabase | Old data shown + background refresh | Backend fetch -> auto-warm if empty |
| **Symbol Switch** | Instant from Supabase | Old data shown + background refresh | Backend fetch -> auto-warm if empty |
| **Warm Up Button** | Returns cached (skips Yahoo fetch) | Re-feeds Yahoo -> saves new snapshot | Feeds Yahoo -> saves snapshot |
| **5s Auto-refresh** | Polls backend pipeline directly (bypasses Supabase) | Same | Same |

### Key Design Choice: Stale = Show Now + Refresh Later

When cached data is stale (>4 hours old), the UI does **not** block with a loading spinner. Instead:

1. **Immediately** renders the stale Supabase snapshot so the user sees bricks, signals, and trades right away
2. **Fires a background warm-up** request that re-fetches 6 months of Yahoo Finance data, feeds it through the pipeline, and upserts the new snapshot to Supabase
3. When the warm-up completes, the UI **updates in place** with fresh data

This avoids a blank screen during the 10-30 second warm-up process and provides the best user experience for returning visitors.

## Warm-up Process

The warm-up flow feeds 6 months of historical Yahoo Finance data through the pipeline so it has enough bricks to detect patterns and generate signals.

### BFF Warm-up Endpoint (`/api/renko/warmup`)

**POST** — Warm up pipeline + save to Supabase:
1. Check Supabase for fresh cache (<4h) — if found, return it directly
2. Fetch historical prices from Yahoo Finance (`yahoo-finance2`)
3. Reset the backend pipeline for the target symbol
4. Set regime to `low_vol_bull` (enables signal generation during warm-up)
5. Feed prices in chunks of 150 via `POST /renko/tick/batch` (avoids Render timeout)
6. Fetch full pipeline state (bricks, classified, signals, trades, stats)
7. Upsert snapshot to Supabase `ta_renko_snapshot` on `(symbol, brick_size)`

**GET** — Load cached snapshot:
1. Query Supabase by `(symbol, brick_size)`
2. Return `{ cached: true, stale: true/false, ... }` or `{ cached: false }`

### Auto-warm-up Triggers

Warm-up is automatically triggered when:
- Page loads and no Supabase cache exists for the symbol
- Page loads and Supabase cache is stale (>4h old) — background refresh
- User switches to a new symbol with no cached data and empty backend pipeline
- User clicks the **🔥 Warm Up** button manually

## Data Flow

1. **Auto-refresh** polls `/renko/state` every 5 seconds when enabled
2. **BFF proxy** at `/api/renko/[action]` forwards to FastAPI backend with auth headers
3. **Parallel fetching**: state, bricks, classified, signals, trades, stats all fetched simultaneously
4. **Visibility API**: pauses polling when tab is hidden, resumes on focus
5. **Render cold-start handling**: retry with exponential backoff, HTML response detection

## Integration with Existing Modules

| Module | Integration Point |
|--------|-------------------|
| **HMM Regime Detection** | Signal filter regime gate — only trade in favorable regimes |
| **Kelly Sizing** | Per-pattern Kelly fraction from trade journal stats |
| **Risk Analysis** | Brick count → dollar risk conversion, VaR/CVaR |
| **Walk-Forward Validation** | Backtest patterns with historical data via `/tick/batch` |
| **TDA Early Warning** | Pause executor on regime shift detected by topological features |
| **Strategy Evolution** | GA optimize `brick_size`, `bull_trigger_n`, `sl_bricks`, `tp_bricks` |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Dashboard |
| `Ctrl+2` | Orders |
| `Ctrl+3` | Trade |
| `Ctrl+4` | Simulate |
| `Ctrl+5` | Portfolio |
| `Ctrl+6` | Search |
| **`Ctrl+7`** | **Renko HFT** |
| `Ctrl+8` | Admin |

## Getting Started

1. Sign in to Noble Trader Agent
2. Click the 🧱 **Renko** tab
3. Select a symbol (SPY, AAPL, TSLA, etc.)
4. Enable auto-refresh to start polling
5. Use the **⚡ Tick** button to manually push price ticks
6. Monitor bricks, signals, and trades in real-time
7. Adjust configuration in the ⚙️ Config tab

## Troubleshooting

- **"Backend Unavailable"**: The FastAPI backend may be spinning up (30s cold start on free Render plan). Wait and retry.
- **No bricks appearing**: Feed ticks via the ⚡ Tick button or connect a real-time price stream.
- **Signals rejected**: Check the Signal Filters panel — regime gate, session window, daily loss limits may be blocking.
- **Config changes lost**: Changing config resets the pipeline. This is by design — the pipeline state is tied to the configuration parameters.
