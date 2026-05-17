# Noble Trader Agent — Project State

**Last Updated:** 2026-05-17
**Version:** v5.0.0 (Renko HFT Pipeline)

---

## Architecture

| Layer | Stack | Host |
|-------|-------|------|
| **Frontend** | Next.js 16 (App Router) + React 19 + DaisyUI v5 + shadcn/ui | Vercel |
| **Backend** | FastAPI + Pydantic v2 + hmmlearn + numpy + pandas | Render (Free) |
| **Auth** | Clerk JWT → BFF proxy → FastAPI JWKS verification | Clerk |
| **Broker** | Alpaca (paper trading by default) | Alpaca Markets |
| **Database** | Supabase (PostgreSQL with RLS) | Supabase |
| **Cache L1** | Upstash Redis (REST API) | Upstash |
| **Cache L2** | In-memory LRU (process-local, 100 max) | — |
| **Notifications** | Discord Webhooks + Telegram Bot (legacy) + Supabase persistence | Discord / Telegram |
| **Live Prices** | Finnhub WebSocket | Finnhub |
| **Historical Prices** | Yahoo Finance (`yahoo-finance2`) | Yahoo |

### URLs
- **Frontend:** `https://noble-trader-agent-frontend.vercel.app`
- **Backend:** `https://noble-trader-fastapi-backend.onrender.com`
- **GitHub (Frontend):** `https://github.com/lexingtontechus/noble-trader-agent-frontend`
- **GitHub (Backend):** `https://github.com/lexingtontechus/noble-trader-fastapi-backend`

---

## Renko HFT 6-Layer Pipeline

The core trading engine — processes live ticks through 6 sequential layers:

```
Tick → Brick Engine → Swing Classifier → Pattern Detector → Signal Filter → Risk Manager → Executor
```

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | **Brick Engine** | Tick → Renko brick construction (fixed/ATR/dynamic brick size) |
| 2 | **Swing Classifier** | Labels bricks as HH/HL/LH/LL + swing point detection |
| 3 | **Pattern Detector** | Detects bull_run, bear_run, reversal, double_top/bottom, consolidation_break |
| 4 | **Signal Filter** | 7-layer risk governance gate (session, lunch, trade count, daily loss, consecutive losses, cooldown, regime, velocity) |
| 5 | **Risk Manager** | Brick-denominated SL (3 bricks), TP (5 bricks), trailing stop, time stop |
| 6 | **Executor** | Alpaca bracket order submission (paper/live) |

### Key Parameters
- Brick size: $0.50 (fixed by default)
- SL: 3 bricks, TP: 5 bricks
- Trailing stop: enabled after 3 bricks profit, 2 brick trail distance
- Max trades/session: 15, Max daily loss: 10 bricks
- Regime gate: only trade when HMM regime aligns

---

## Data Persistence & Caching

### Cache Hierarchy (warmup route)

```
Redis L1 (fastest, 4h TTL) → Supabase L2 (persistent, 4h TTL) → Yahoo Finance (full warmup)
```

- **Redis keys:** `renko:snapshot:{symbol}:{brickSize}`, `renko:price:{symbol}`, `renko:regime:{symbol}`
- **Supabase table:** `ta_renko_snapshot` with upsert on conflict `(symbol, brick_size)`
- **Stale strategy:** Show old data immediately + trigger non-blocking background refresh

---

## Notification System

### Three Delivery Channels

| Channel | Purpose | Config |
|---------|---------|--------|
| **Discord Webhooks** | Primary real-time alerts | `DISCORD_WEBHOOK_SIGNALS`, `DISCORD_WEBHOOK_EXECUTIONS`, `DISCORD_WEBHOOK_STATUS` |
| **Telegram Bot** | Legacy push notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **Supabase** | Persistent alert history | `ta_telegram_notification` table (always on) |

### Discord Channel Routing

| Alert Type | Discord Channel | Content |
|------------|----------------|---------|
| `SIGNAL` | #trade-signals | Pattern, direction, price, confidence, regime |
| `TRADE` | #trade-executions | Order fill, SL/TP, P&L (red/green embeds) |
| `RISK` | #system-status | Daily loss limits, consecutive losses |
| `REGIME` | #system-status | HMM regime transitions |
| `SYSTEM` | #system-status | Warmup complete, pipeline reset, errors |

### Notification Triggers (Backend)

| Event | Discord Channel | Trigger |
|-------|----------------|---------|
| Filtered signal detected | #trade-signals + #trade-executions | `process_tick()` → `filtered` in result |
| Trade closed (SL/TP) | #trade-executions | `process_tick()` → `trade_result` in result |
| Large loss (≤ -5 bricks) | #system-status (risk alert) | `trade_result.pnl_bricks <= -5` |
| Batch warmup complete | #system-status | `tick/batch` endpoint, 50+ ticks |
| Pipeline reset | #system-status (warning) | `/renko/reset` endpoint |

---

## Backend API Endpoints

### v5.0 Renko HFT Pipeline

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/renko/tick` | POST | Process single tick through 6-layer pipeline |
| `/renko/tick/batch` | POST | Batch tick processing (backtest/warmup) |
| `/renko/state` | GET | Current pipeline state snapshot |
| `/renko/stats` | GET | Comprehensive pipeline statistics |
| `/renko/bricks` | GET | Recent Renko bricks (last 500) |
| `/renko/classified` | GET | Bricks with swing labels (HH/HL/LH/LL) |
| `/renko/signals` | GET | Pattern signals history |
| `/renko/trades` | GET | Trade journal records |
| `/renko/swing-points` | GET | Detected swing points |
| `/renko/regime` | POST | Update HMM regime for gate filter |
| `/renko/equity` | POST | Update account equity |
| `/renko/config` | POST | Update pipeline configuration (resets pipeline) |
| `/renko/reset` | POST | Reset pipeline for a symbol |
| `/renko/backtest/stats` | GET | Backtest/trading statistics from journal |
| `/health` | GET | Health check + Discord status |

### v2.x-v4.0 Regime Platform Endpoints (also deployed)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/regime/detect` | POST | HMM-based regime classification |
| `/size/kelly` | POST | Regime-gated fractional Kelly sizing |
| `/risk/analyse` | POST | VaR, CVaR, drawdown analysis |
| `/analyse/full` | POST | One-shot: regime + sizing + risk |
| `/simulate/{symbol}` | POST | Markov-chain regime simulation |
| `/portfolio` | GET | Multi-symbol aggregated regime + risk |
| `/correlation/detect` | POST | DCC-based portfolio correlation regime |
| `/optimise/full` | POST | Drawdown-controlled max-Sharpe |
| `/strategy/signal` | POST | Strategy signal generation |
| `/backtest/run` | POST | Backtest execution |
| `/tda/features` | POST | TDA feature extraction |
| `/observation/build` | POST | 24-feature HMM observation vector |
| `/stream/seed` | POST | Seed historical prices |
| `/stream/tick` | POST | Ingest single tick |
| `/stream/sessions` | GET | List active streaming sessions |
| `/ws/{symbol}` | WS | WebSocket stream |
| `/sse/{symbol}` | GET | SSE stream |
| `/gpu/capabilities` | GET | GPU HMM backend info |
| `/gpu/benchmark` | POST | HMM fit/predict latency benchmark |
| `/feeds/start` | POST | Start Alpaca/Binance/IB feed |
| `/feeds/status` | GET | Feed adapter health |

---

## Frontend BFF API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/renko/[action]` | GET/POST | Proxy to FastAPI `/renko/*` (state, bricks, signals, tick, config, reset...) |
| `/api/renko/warmup` | GET/POST | Cache-aware warmup: Redis L1 → Supabase L2 → Yahoo Finance |
| `/api/renko/signal-alert` | POST | Signal/trade/risk alert dispatch (Supabase + Discord + Telegram) |
| `/api/renko/orders` | GET/POST/DELETE | Alpaca order management with bracket orders |
| `/api/renko/tick-stream` | POST | Batch tick feeding from Finnhub WebSocket |
| `/api/alerts` | GET/POST/DELETE | Alert history from Supabase |
| `/api/clerk/alpaca-keys` | GET/POST | Alpaca API key management via Clerk `private.metadata` |
| `/api/auth/clerk-*` | GET/POST | Clerk auth bridge to FastAPI |

---

## Environment Variables

### Frontend (Vercel / `.env.local`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_FASTAPI_BASE_URL=https://noble-trader-fastapi-backend.onrender.com
FASTAPI_USER=
FASTAPI_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DISCORD_WEBHOOK_SIGNALS=
DISCORD_WEBHOOK_EXECUTIONS=
DISCORD_WEBHOOK_STATUS=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
NEXT_PUBLIC_FINNHUB_API_KEY=
```

### Backend (Render / `.env`)

```
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_BASE_URL=https://paper-api.alpaca.markets
DISCORD_WEBHOOK_SIGNALS=
DISCORD_WEBHOOK_EXECUTIONS=
DISCORD_WEBHOOK_STATUS=
REDIS_URL=
CLERK_SECRET_KEY=
```

---

## Project Rules

- **Supabase only** — never Prisma (migrated, schema.prisma is legacy)
- **DaisyUI** for theming (Tailwind CSS 4)
- **Clerk `private.metadata`** for Alpaca keys — DO NOT modify `proxy.js`
- **BFF pattern** — all backend calls go through NextJS API routes, never directly from client
- **Graceful degradation** — Redis/Telegram/Discord failures never crash the app

---

## Gap Analysis & Feature Roadmap

### Completed ✅

| # | Gap | Solution | Status |
|---|-----|----------|--------|
| 1 | Auth/Alpaca key management concerns | Clerk proxy.js already handles this | ✅ No change needed |
| 2 | Centralized notification system | Built Discord + Telegram + Supabase alerting | ✅ Implemented |
| 3 | Render performance for production | Will upgrade Render plan when moving to production | ✅ Deferred to production |
| 5 | Need structured alert delivery | Implemented 3-channel alerting with Discord | ✅ Implemented |
| 6 | Redis caching for speed | Upstash Redis L1 cache (snapshots, price, regime) | ✅ Implemented |
| 7 | Wire notifications to pipeline | Discord notifications wired into renko/router.py | ✅ Implemented |
| 8 | Notification delivery channel | Discord webhooks (3 channels: signals, executions, status) | ✅ Implemented |
| 9 | Confirmed need for alerting | Full notification system built and verified | ✅ Implemented |

### Pending 🔲

| # | Gap | Proposal | Priority |
|---|-----|----------|----------|
| 4 | **Executor not fully wired to pipeline** | See detailed proposal below | 🔴 High |
| 10 | **Session filter blocks warmup signals** | Batch warmup uses generated timestamps that fall outside 09:35-15:45 session window, so signals are detected but never filtered → no trades during warmup. Propose: add a `warmup_mode` flag to SignalFilter that bypasses session/time checks during batch warmup. | 🟡 Medium |
| 11 | **No pipeline state persistence across Render restarts** | Render free tier sleeps after 15min inactivity. On wake, all in-memory pipeline state is lost. Propose: persist pipeline snapshots to Supabase `ta_renko_snapshot` on every batch complete, restore on pipeline creation. Currently only the warmup route saves snapshots. | 🟡 Medium |
| 12 | **Health monitoring / uptime alerts** | No automated monitoring if the backend goes down or becomes unhealthy. Propose: add a cron-based health check (Vercel cron or Upstash QStash) that pings `/health` every 5 minutes and sends a Discord alert on failure. | 🟢 Low |
| 13 | **Rate limiting on BFF routes** | Frontend BFF routes have no rate limiting — a single user could spam warmup requests and exhaust Render's free tier. Propose: add IP-based or Clerk-user-based rate limiting using Upstash Redis (sliding window). | 🟡 Medium |
| 14 | **Single-symbol limitation** | Each pipeline instance is per-symbol, but there's no UI to manage multiple symbols simultaneously. Propose: add a symbol selector/manager component that tracks active pipelines and their states. | 🟢 Low |

---

## Gap #4 — Detailed Proposal: Wire Executor to Pipeline

### Problem

The `AlpacaExecutor` exists and is initialized in `RenkoPipeline`, but the actual Alpaca order submission path is **not connected** in the pipeline flow:

- `pipeline._open_position()` only calls `risk_manager.open_position()` (internal tracking)
- It does **NOT** call `executor.execute()` (actual Alpaca order)
- The executor falls back to simulation mode when `api_key` is `None`
- The pipeline has no callback to bridge signal → order → Discord notification

### Current Flow (broken)

```
PatternDetector → SignalFilter → RiskManager.open_position() → ❌ STOP
                                                ↑ internal position tracking only
                                                ❌ executor.execute() never called
```

### Proposed Flow (fixed)

```
PatternDetector → SignalFilter → RiskManager.open_position()
                                        ↓
                                  Executor.execute() → Alpaca API
                                        ↓
                                  OrderResult → Discord notification
                                        ↓
                                  RiskManager tracks SL/TP
                                        ↓
                                  Trade close → Discord notification
```

### Implementation Plan

#### Step 1: Add async execution support to pipeline

The pipeline's `process_tick()` is synchronous, but `executor.execute()` is async. We need a bridge:

```python
# In pipeline.py — _open_position method
def _open_position(self, filtered, brick):
    # 1. Open risk manager position (internal tracking)
    self.risk_manager.open_position(...)

    # 2. Submit order via executor
    if self._on_signal:  # External callback for async execution
        self._on_signal(filtered)  # Router handles async dispatch

    # 3. Fire-and-forget async execution (if event loop running)
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(self._execute_order(filtered, brick))
    except RuntimeError:
        pass  # No event loop (backtest mode)
```

#### Step 2: Router handles order execution

```python
# In router.py — enhanced tick handler
@renko_router.post("/tick")
async def process_tick(body: TickInput):
    result = pipeline.process_tick(body.price, body.timestamp)

    # If a filtered signal was produced and we have a position opened
    if result.get("filtered") and pipeline.risk_manager.has_position:
        # Get Alpaca keys from Clerk metadata (via request headers)
        # Submit the order
        order_result = await pipeline.executor.execute(
            filtered=FilteredSignal.from_dict(result["filtered"]),
            symbol=symbol,
            brick_size=pipeline.config.get_brick_size(),
        )
        result["order_result"] = order_result.to_dict()

        # Discord notification
        _notify_execution(symbol, order_result)
```

#### Step 3: Trade close triggers executor

When the Risk Manager detects SL/TP hit, the executor should close the Alpaca position:

```python
# In pipeline.py — _handle_trade_close
def _handle_trade_close(self, result):
    self.signal_filter.record_trade_result(result.pnl_bricks)
    self.journal.record(...)

    # Close Alpaca position
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(self.executor.close_position(self.config.symbol))
    except RuntimeError:
        pass
```

#### Step 4: Pass Alpaca credentials per-request

Currently, the executor is initialized with config-level credentials. For the Clerk proxy pattern:

```python
# In router.py — get pipeline with user's Alpaca keys
def _get_pipeline_with_keys(symbol, api_key, api_secret, base_url):
    config = RenkoConfig(symbol=symbol, api_key=api_key, api_secret=api_secret, base_url=base_url)
    pipeline = RenkoPipeline(config)
    _pipelines[symbol] = pipeline
    return pipeline
```

The BFF route forwards Clerk-authenticated requests with the user's Alpaca keys from `private.metadata` (same pattern as `proxy.js`).

#### Step 5: Simulation vs Live mode

- **Simulation (default):** `api_key=None` → executor returns `sim_*` order IDs, no Alpaca calls
- **Paper trading:** User's Alpaca paper keys → executor submits to `paper-api.alpaca.markets`
- **Live trading:** User's Alpaca live keys → executor submits to `api.alpaca.markets`

The mode is determined entirely by the credentials passed, not by a config flag.

### Files to Modify

| File | Changes |
|------|---------|
| `renko/pipeline.py` | Add async execution in `_open_position()` and `_handle_trade_close()` |
| `renko/router.py` | Add order execution in tick handler, pass Alpaca creds per-request |
| `renko/executor.py` | No changes needed — already supports bracket orders and simulation mode |
| `src/app/api/renko/[action]/route.js` | Pass Clerk Alpaca keys to backend in tick requests |
| `notifications/discord.py` | Already wired — will automatically notify on executions |

### Risk Considerations

- **Never execute without explicit user consent:** Add a `dry_run` flag to the pipeline config. Default `True`. Only set `False` when user explicitly enables live trading.
- **Rate limit order submissions:** Alpaca has API rate limits. Add cooldown between orders.
- **Error isolation:** Executor errors must never crash the pipeline. All exceptions are already caught.
- **Position reconciliation:** On pipeline restart, reconcile with Alpaca's actual positions.

---

## Auth Flow

1. Clerk signs in user → JWT token extracted via `auth().getToken({ template: 'server' })`
2. BFF API routes forward `Authorization: Bearer <token>` to FastAPI
3. FastAPI validates via Clerk JWKS (`get_authed_user()`)
4. Alpaca keys stored in Clerk `private.metadata` → retrieved via BFF `proxy.js`
5. **DO NOT modify `proxy.js`** — it handles Alpaca key management

---

## Test Credentials

- Email: `zai@0xdweb.com`
- Password: `zai0xdweb`

---

## File Index (download/ directory)

| File | Description |
|------|-------------|
| `PROJECT_STATE.md` | This file — project state, architecture, gap analysis |
| `BACKTESTING_UI_PROPOSAL.md` | Proposal for backtesting UI feature |
| `Noble_Trader_Agent_Project_Description.docx` | Full project description document |
| `MarketRegimeTrader_Backend_Project_Description.docx` | Backend-only project description |
| `renko_snapshot_migration.sql` | Supabase migration SQL for ta_renko_snapshot table |
| `noble-trader-project-20260507-085320.zip` | Full project snapshot archive |
