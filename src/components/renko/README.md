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
├── lib/renko-client.js              # API client with retry/backoff
├── app/api/renko/[action]/route.js  # BFF proxy route
└── components/renko/
    ├── RenkoPage.jsx                # Main orchestrator (4 sub-tabs)
    ├── BrickChart.jsx               # CSS Renko brick chart
    ├── SignalsPanel.jsx             # Signals, filters, active position
    ├── TradesPanel.jsx              # Trade journal, equity curve
    └── ConfigPanel.jsx              # Pipeline configuration form
```

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
