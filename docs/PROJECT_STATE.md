# Noble Trader Agent — Project State

**Last Updated:** 2026-05-21
**Version:** v7.0.0 (Renko HFT Pipeline + Live Execution + State Persistence + Rate Limiting + Health Monitoring + Multi-Pipeline UI)

---

## Architecture

| Layer | Stack | Host |
|-------|-------|------|
| **Frontend** | Next.js 16 (App Router) + React 19 + DaisyUI v5 + Tailwind CSS 4 | Vercel |
| **Backend** | FastAPI + Pydantic v2 + hmmlearn + numpy + pandas | Render (Starter) |
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

| Endpoint | Method | Description | Auth Level |
|----------|--------|-------------|------------|
| `/renko/tick` | POST | Process single tick through 6-layer pipeline | admin/trader |
| `/renko/tick/batch` | POST | Batch tick processing (backtest/warmup) | admin/trader |
| `/renko/state` | GET | Current pipeline state snapshot | any role |
| `/renko/stats` | GET | Comprehensive pipeline statistics | any role |
| `/renko/bricks` | GET | Recent Renko bricks (last 500) | any role |
| `/renko/classified` | GET | Bricks with swing labels (HH/HL/LH/LL) | any role |
| `/renko/signals` | GET | Pattern signals history | any role |
| `/renko/trades` | GET | Trade journal records | any role |
| `/renko/swing-points` | GET | Detected swing points | any role |
| `/renko/regime` | POST | Update HMM regime for gate filter | admin/trader |
| `/renko/equity` | POST | Update account equity | admin/trader |
| `/renko/config` | POST | Update pipeline configuration (resets pipeline) | admin |
| `/renko/reset` | POST | Reset pipeline for a symbol | admin |
| `/renko/backtest/stats` | GET | Backtest/trading statistics from journal | any role |
| `/renko/backtest/run/stream` | POST | SSE streaming backtest with progressive chunked results | admin/trader |
| `/health` | GET | Health check + Discord status | any role |

### v2.x-v4.0 Regime Platform Endpoints (also deployed)

| Endpoint | Method | Description | Auth Level |
|----------|--------|-------------|------------|
| `/regime/detect` | POST | HMM-based regime classification | admin/trader |
| `/size/kelly` | POST | Regime-gated fractional Kelly sizing | admin/trader |
| `/risk/analyse` | POST | VaR, CVaR, drawdown analysis | admin/trader |
| `/analyse/full` | POST | One-shot: regime + sizing + risk | admin/trader |
| `/simulate/{symbol}` | POST | Markov-chain regime simulation | admin/trader |
| `/portfolio` | GET | Multi-symbol aggregated regime + risk | any role |
| `/correlation/detect` | POST | DCC-based portfolio correlation regime | admin/trader |
| `/optimise/full` | POST | Drawdown-controlled max-Sharpe | admin/trader |
| `/strategy/signal` | POST | Strategy signal generation | admin/trader |
| `/backtest/run` | POST | Backtest execution | admin/trader |
| `/backtest/history` | GET | Paginated list of saved backtest results | any role |
| `/backtest/{id}` | GET | Full backtest result by ID | any role |
| `/backtest/compare` | POST | Side-by-side comparison of saved results | admin/trader |
| `/backtest/optimize` | POST | Parameter grid sweep (max 50 combos) | admin/trader |
| `/backtest/export` | POST | Export result as CSV/JSON | admin/trader |
| `/backtest/{id}` | DELETE | Delete a saved backtest result | admin |
| `/tda/features` | POST | TDA feature extraction | admin/trader |
| `/observation/build` | POST | 24-feature HMM observation vector | admin/trader |
| `/stream/seed` | POST | Seed historical prices | admin/trader |
| `/stream/tick` | POST | Ingest single tick | admin/trader |
| `/stream/sessions` | GET | List active streaming sessions | any role |
| `/ws/{symbol}` | WS | WebSocket stream | any role |
| `/sse/{symbol}` | GET | SSE stream (auth required) | any role |
| `/sse/alerts` | GET | Global SSE alert stream | any role |
| `/gpu/capabilities` | GET | GPU HMM backend info | any role |
| `/gpu/benchmark` | POST | HMM fit/predict latency benchmark | admin/trader |
| `/feeds/start` | POST | Start Alpaca/Binance/IB feed | admin/trader |
| `/feeds/status` | GET | Feed adapter health | any role |

---

## Frontend BFF API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/renko/[action]` | GET/POST | Proxy to FastAPI `/renko/*` (state, bricks, signals, tick, config, reset...) |
| `/api/renko/warmup` | GET/POST | Cache-aware warmup: Redis L1 → Supabase L2 → Yahoo Finance |
| `/api/renko/backtest/run/stream` | POST | SSE streaming backtest with progressive chunked results (pipes FastAPI stream) |
| `/api/renko/signal-alert` | POST | Signal/trade/risk alert dispatch (Supabase + Discord + Telegram) |
| `/api/renko/orders` | GET/POST/DELETE | Alpaca order management with bracket orders |
| `/api/renko/tick-stream` | POST | Batch tick feeding from Finnhub WebSocket |
| `/api/alerts` | GET/POST/DELETE | Alert history from Supabase |
| `/api/clerk/alpaca-keys` | GET/POST | Alpaca API key management via Clerk `private.metadata` |
| `/api/auth/clerk-*` | GET/POST | Clerk auth bridge to FastAPI |
| `/api/backtest/run` | POST | Run walk-forward backtest (30+ metrics) |
| `/api/backtest/history` | GET | Paginated list of saved backtest results |
| `/api/backtest/detail/[id]` | GET/DELETE | Fetch or delete a backtest result |
| `/api/backtest/compare` | POST | Side-by-side comparison of saved results |
| `/api/backtest/optimize` | POST | Parameter grid sweep |
| `/api/backtest/export` | POST | Export result as CSV/JSON |

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
| 15 | **Missing backtest endpoints** | Added /backtest/optimize (grid sweep), /backtest/export (CSV/JSON) | ✅ Implemented |
| 16 | **Missing backtest BFF routes** | Added /api/backtest/optimize and /api/backtest/export BFF proxies | ✅ Implemented |
| 17 | **Missing backtest client helpers** | Added 6 functions to fastapi-client.js (history, detail, compare, delete, optimize, export) | ✅ Implemented |
| 18 | **SSE endpoints had no auth** | Added `get_authed_user` dependency to `/sse/{symbol}` and `/sse/alerts` | ✅ Fixed |
| 19 | **Renko write ops allowed viewers** | Upgraded tick/batch/backtest endpoints from `get_authed_user` to `require_write` | ✅ Fixed |
| 20 | **JWT claims were null** | Added "server" JWT template support + Clerk API enrichment fallback | ✅ Fixed |
| 21 | **Role system inconsistent** | Unified default to "viewer", added `useRole().canAccess()`, server sync | ✅ Fixed |

### Pending 🔲

| # | Gap | Proposal | Priority |
|---|-----|----------|----------|
| 4 | **Executor not wired to pipeline** | Router-level async bridge with per-request executor, dry_run/live_enabled flags, admin toggle | ✅ Implemented |
| 10 | **Session filter blocks warmup signals** | Added `warmup_mode` flag to SignalFilter — bypasses session/cooldown during backtest/warmup | ✅ Implemented |
| 11 | **No pipeline state persistence across restarts** | Upgraded to Render Starter (no sleep) + Supabase snapshot save/restore every 100 bricks | ✅ Implemented |
| 12 | **Health monitoring / uptime alerts** | Vercel Cron every 5 min → Discord alerts on 2+ consecutive failures, recovery notifications | ✅ Implemented |
| 13 | **Rate limiting on BFF routes** | IP-based rate limiting on all Renko and P&L BFF routes (heavy: 10/min, write: 30/min, read: 60/min) | ✅ Implemented |
| 14 | **Single-symbol limitation** | Multi-pipeline status bar showing all 8 symbols with position/P&L indicators | ✅ Implemented |

---

## Gap #4 — Implementation (Completed)

The executor is now fully wired via a **router-level async bridge**:

```
Pipeline (sync) → process_tick() → _pending_execution payload
Router (async) → consume_pending_execution() → resolve user credentials → executor.execute() → Alpaca API
Router (async) → consume_pending_close() → executor.close_position() → Alpaca API
```

Key design decisions:
- **Pipeline stays synchronous** — deterministic backtesting preserved
- **Per-request executors** — user credentials never cached in pipelines
- **Two-gate safety** — both `dry_run=False` AND `live_enabled=True` required for real orders
- **Admin toggle** — `POST /renko/live/toggle` with Discord notification
- **Default safe** — `dry_run=True`, `live_enabled=False` by default

New endpoints:
- `GET /renko/live/status` — check execution mode
- `POST /renko/live/toggle` — enable/disable live execution (admin only)
- `POST /renko/snapshot/restore` — restore pipeline from Supabase snapshot

---

## Auth Flow

1. Clerk signs in user → session ID available via `auth().sessionId`
2. BFF routes call `getClerkJWT(sessionId)` which tries "server" JWT template first, then default JWT
3. BFF forwards `Authorization: Bearer <token>` to FastAPI backend
4. FastAPI validates via Clerk JWKS (`get_authed_user()`)
5. If JWT claims are null (no template), backend enriches via Clerk API (`_enrich_from_clerk_api()`, 5-min cache)
6. All 57 backend endpoints now require auth (SSE endpoints fixed, renko write ops upgraded)
7. Alpaca keys stored in Clerk `private.metadata` → retrieved via BFF `proxy.js`
8. **DO NOT modify `proxy.js`** — it handles Alpaca key management

### Role System

| Role | Access | Default |
|------|--------|----------|
| `admin` | Full access (config, reset, kill-switch, all write ops) | No |
| `trader` | Read + write (tick ingestion, backtests, regime, equity) | No |
| `viewer` | Read-only (state, stats, bricks, signals, trades) | **Yes** |

- Client: `useRole()` hook with `canAccess(role)` + server sync via `/api/auth/role`
- Server: `clerk-metadata.js` → `getRoleInfo()`
- UI: `<RoleGate require="trader">` with loading + `requireServerSync`

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
| `00000000000007_backtest_results.sql` | Supabase migration for ta_backtest_result table |
