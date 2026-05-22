# Noble Trader Agent — Project State

**Last Updated:** 2026-05-22
**Version:** v7.0.0 (Production-Grade Institutional Trading Platform)
**Current Phase:** P5 — MCP Integration + API Key System

---

## Architecture

| Layer | Stack | Host |
|-------|-------|------|
| **Frontend** | Next.js 16 (App Router) + React 19 + DaisyUI v5 + Tailwind CSS 4 | Vercel |
| **Backend** | FastAPI + Pydantic v2 + hmmlearn + numpy + pandas | Render (Starter) |
| **Auth** | Clerk JWT → BFF proxy → FastAPI JWKS verification | Clerk |
| **Broker** | Alpaca (paper trading by default) | Alpaca Markets |
| **Database** | Supabase (PostgreSQL with RLS + pg_cron + Vault) | Supabase |
| **Cache L1** | Upstash Redis (REST API, sliding window rate limits) | Upstash |
| **Cache L2** | In-memory LRU (process-local, 100 max) | — |
| **Notifications** | Discord Webhooks (3 channels) + Telegram Bot (legacy) + Supabase persistence | Discord / Telegram |
| **Live Prices** | Finnhub WebSocket | Finnhub |
| **Historical Prices** | Yahoo Finance (`yahoo-finance2`) | Yahoo |
| **Encryption** | AES-256-GCM + PBKDF2 (100k iterations) + key versioning | App-layer |
| **MCP Server** | fastapi-mcp at `/mcp` (HTTP+SSE transport, 40-45 tools, 19 excluded) | Render |
| **API Keys** | SaaS API key system (`nt_live_...`) with SHA-256+pepper hash, plan-gated | Supabase |

### URLs
- **Frontend:** `https://noble-trader-agent-frontend.vercel.app`
- **Backend:** `https://noble-trader-fastapi-backend.onrender.com`
- **GitHub (Frontend):** `https://github.com/lexingtontechus/noble-trader-agent-frontend`
- **GitHub (Backend):** `https://github.com/lexingtontechus/noble-trader-fastapi-backend`

### Stats
- **34 lib modules** (11,973 lines) | **85 UI components** across 18 dirs | **96+ BFF API routes** | **29 DB migrations** | **9 pg_cron jobs** | **~70+ tables**

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

---

## Data Persistence & Caching

### Cache Hierarchy (warmup route)

```
Redis L1 (fastest, 4h TTL) → Supabase L2 (persistent, 4h TTL) → Yahoo Finance (full warmup)
```

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

---

## Production Readiness Features (P3-P4)

### Rate Limiting (P4-6A)
- Redis-backed sliding window counter via Upstash
- 10 route tiers: trade, order, backtest, ai, write, data, admin, auth, public, default
- Plan multipliers: free=1x, premium=3x, institutional=10x
- Rate limit headers on ALL responses (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- 429 with Retry-After header when exceeded
- Violation logging to `rate_limit_violations` table (IP hashed with SHA-256 + pepper)

### Circuit Breaker System (P3-5A)
- Pre-trade risk checks before every execution
- 9 default breakers: max_position_size, max_open_positions, daily_loss_limit, max_drawdown, consecutive_loss_stop, order_rate_limit, single_stock_concentration, max_portfolio_heat, sector_concentration
- Actions: reject_order, halt, alert
- Trading halts: global, symbol-level, user-level
- Admin deactivation via BFF routes

### Audit Trail (P3-5B)
- Immutable append-only `trade_audit_log` table
- 17 event types from ORDER_SUBMITTED to SMOKE_TEST_RUN
- Fill poller for Alpaca fill verification

### Reconciliation Engine (P3-5C)
- Compares expected vs actual trade outcomes
- Detects: missing fills, phantom fills, price discrepancies, quantity mismatches, stale orders
- Auto-halts if discrepancy count exceeds threshold (default 3)

### Data Encryption at Rest (P4-6B)
- AES-256-GCM with PBKDF2 key derivation (100,000 iterations)
- Key versioning (V1-V10) for rotation without data loss
- Auto re-encryption on read when key version changes
- PII hashing (SHA-256 + pepper) for IP addresses

### Data Retention & GDPR (P4-6C)
- Configurable retention policies per table
- Archive tables for cold storage
- GDPR Article 17 per-user data purge with compliance log
- pg_cron daily archival job at 3 AM UTC

### Multi-Tenant Isolation (P4-6D)
- `org_id` column on 13 user-scoped tables (nullable, backward-compatible)
- RLS policies as defense-in-depth for direct DB access
- Application-level org_id filtering

### Smoke Test (P3-5E)
- E2E paper trading lifecycle test (6 steps: signal → order → fill → P&L → close → cleanup)

### Broker Abstraction (P2)
- Interface → Alpaca adapter → factory pattern → `/api/broker/[action]` route

---

## Backend API Endpoints

### Renko HFT Pipeline

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

### Regime Platform Endpoints

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
| `/health` | GET | Health check + Discord status | public |

---

## Frontend BFF API Routes (93+)

### Renko Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/renko/[action]` | GET/POST | Proxy to FastAPI `/renko/*` |
| `/api/renko/warmup` | GET/POST | Cache-aware warmup: Redis L1 → Supabase L2 → Yahoo |
| `/api/renko/backtest/run/stream` | POST | SSE streaming backtest |
| `/api/renko/backtest/run` | POST | Run backtest |
| `/api/renko/backtest/compare` | POST | Compare backtests |
| `/api/renko/backtest/optimize` | POST | Parameter sweep |
| `/api/renko/backtest/monte-carlo` | POST | Monte Carlo simulation |
| `/api/renko/backtest/walk-forward` | POST | Walk-forward analysis |
| `/api/renko/signal-alert` | POST | Signal alert dispatch |
| `/api/renko/orders` | GET/POST/DELETE | Alpaca order management |
| `/api/renko/tick-stream` | POST | Batch tick feeding from Finnhub |

### Alpaca Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/alpaca/account` | GET | Account info |
| `/api/alpaca/activities` | GET | Account activities |
| `/api/alpaca/orders` | GET | List orders |
| `/api/alpaca/orders/create` | POST | Create order |
| `/api/alpaca/portfolio/history` | GET | Portfolio history |
| `/api/alpaca/positions` | GET | Open positions |

### Campaign Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/campaign` | GET/POST | List/create campaigns |
| `/api/campaign/[id]` | GET/PATCH/DELETE | Campaign CRUD |
| `/api/campaign/tick` | GET/POST | Campaign tick (CRON_SECRET) |

### Trading Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/trading/analyze` | POST | Trading analysis |
| `/api/trading/validate` | POST | Walk-forward validation |
| `/api/trading/approve` | POST | Approve recommendation |
| `/api/trading/approve-all` | POST | Bulk approve |
| `/api/trading/execute` | POST | Execute via Alpaca |
| `/api/trading/status` | GET | Recommendations status |
| `/api/trading/recommendations` | GET | Recommendations list |
| `/api/trading/schedule` | GET/POST | Scheduled orders |
| `/api/trading/schedule/execute` | POST | Execute scheduled order |
| `/api/trading/ping` | GET | Health check |

### Credential Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/credentials/[type]` | GET/POST/DELETE | Credential CRUD (encrypted) |
| `/api/clerk/alpaca-keys` | GET/POST | Clerk metadata keys (legacy) |
| `/api/clerk/alpaca-keys-status` | GET | Key status check |

### Broker Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/broker/[action]` | GET/POST | Broker abstraction layer |

### Circuit Breaker Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/circuit-breakers` | GET | List breakers |
| `/api/circuit-breakers/check` | POST | Pre-trade check |
| `/api/circuit-breakers/halts` | GET | List active halts |
| `/api/circuit-breakers/halts/deactivate` | POST | Deactivate halt (admin) |

### Compliance Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/compliance/report` | GET | Compliance report |
| `/api/compliance/journal` | GET | Trade journal |
| `/api/compliance/audit-log` | GET | Audit log |
| `/api/compliance/audit-log/export` | GET | Export audit log |

### Reconciliation Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/reconciliation/run` | POST | Run reconciliation |
| `/api/reconciliation/history` | GET | Past reconciliation runs |
| `/api/reconciliation/auto` | POST | Auto-reconciliation |

### P&L Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/pnl/intraday` | GET | Intraday P&L |
| `/api/pnl/history` | GET | P&L history |
| `/api/pnl/alerts` | GET/POST | P&L alert thresholds |
| `/api/pnl/export` | GET | Export P&L data |

### Portfolio Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/portfolio` | GET | Portfolio data |
| `/api/portfolio/correlation` | GET | Correlation matrix |
| `/api/portfolio/optimizer` | GET | Portfolio optimization |
| `/api/portfolio/snapshot` | GET | Historical snapshots |
| `/api/portfolio/snapshot/capture` | POST | Capture snapshot |

### Operational Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/operational/[action]` | GET/POST | Kill switch, mode toggle |
| `/api/operational/rate-limit-violations` | GET | Rate limit violation log |
| `/api/smoke-test` | POST | Run E2E smoke test |

### Retention Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/retention` | GET/POST | Retention status & actions (admin) |

### Health Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/health` | GET | Backend health check |
| `/api/health/detailed` | GET | Full system health (auth required) |
| `/api/health/cron` | GET | Cron health check (CRON_SECRET) |

### Notification Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/notifications/preferences` | GET/POST | Notification preferences |
| `/api/alerts` | GET/POST/DELETE | Alert history |

### Auth Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/auth/clerk-config` | GET | Clerk config (public) |
| `/api/auth/clerk-me` | GET | Current user profile |
| `/api/auth/clerk-token` | GET | Clerk JWT token |
| `/api/auth/clerk-verify` | GET | Verify Clerk session |
| `/api/auth/fastapi-token` | GET | FastAPI auth token |
| `/api/auth/jwt-test` | GET | JWT test endpoint |
| `/api/auth/role` | GET/POST | Role management |

### MCP Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/mcp` | GET/POST/DELETE | Root MCP proxy (SSE + JSON-RPC) |
| `/api/mcp/[...path]` | GET/POST/DELETE | Catch-all MCP proxy with Clerk JWT injection |
| `/api/mcp/tools` | GET | Tool discovery + plan-filtered list + connection config |

### API Key Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/api-keys` | GET/POST | List/create API keys |
| `/api/api-keys` | DELETE | Revoke API key |

### Other Routes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/analyse` | POST | Full analysis pipeline |
| `/api/backtest/run` | POST | Walk-forward backtest |
| `/api/backtest/history` | GET | Backtest history |
| `/api/backtest/detail/[id]` | GET/DELETE | Backtest detail |
| `/api/backtest/compare` | POST | Compare backtests |
| `/api/backtest/optimize` | POST | Parameter sweep |
| `/api/backtest/export` | POST | Export backtest |
| `/api/commentary` | POST | AI market commentary |
| `/api/correlation/detect` | POST | Cross-asset correlation |
| `/api/evolution/summary` | GET | Evolution state |
| `/api/evolution/variants` | GET/POST | Variant management |
| `/api/evolution/feedback` | POST | Record feedback |
| `/api/evolution/ab-test` | GET/POST/DELETE | A/B test management |
| `/api/evolution/optimize` | POST | Optuna optimization |
| `/api/evolution/rotate` | POST | Strategy rotation |
| `/api/evolution/performance` | GET | Performance records |
| `/api/fills/poll` | POST | Poll Alpaca fills |
| `/api/observation/build` | POST | 24-feature observation vector |
| `/api/onboarding` | GET/POST/PUT | Onboarding status |
| `/api/optimise/full` | POST | Full optimization |
| `/api/prices` | POST | Yahoo Finance prices |
| `/api/risk/dashboard` | GET | Risk dashboard data |
| `/api/simulate` | POST | Monte Carlo simulation |
| `/api/stream/sse` | GET | SSE price ticks |
| `/api/stream/latest-price` | GET | Latest price |
| `/api/stream/pnl` | GET | SSE P&L stream |
| `/api/stream/seed` | POST | Seed stream data |
| `/api/stream/session` | GET | Stream session |
| `/api/stream/tick` | POST | Push tick |
| `/api/subscription/status` | GET | Subscription status |
| `/api/subscription/webhook` | POST | Payment webhook (Helio) |
| `/api/subscription/request-upgrade` | POST | Request plan upgrade |
| `/api/tda/scan` | POST | TDA scan |
| `/api/tda/alerts` | GET | TDA alerts |
| `/api/telegram/chat-id` | GET | Telegram chat ID |
| `/api/telegram/report` | POST | Telegram report |

---

## Environment Variables

### Frontend (Vercel / `.env.local`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_FASTAPI_BASE_URL=https://noble-trader-fastapi-backend.onrender.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ENCRYPTION_KEY=
SUPABASE_ENCRYPTION_KEY_V2=              # Key rotation (P4-6B)
SUPABASE_ENCRYPTION_ACTIVE_VERSION=       # Active key version (default: highest)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
DISCORD_WEBHOOK_SIGNALS=
DISCORD_WEBHOOK_EXECUTIONS=
DISCORD_WEBHOOK_STATUS=
ALPACA_PAPER_API_KEY=                    # Cron fallback
ALPACA_PAPER_SECRET_KEY=                 # Cron fallback
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
PORT=8000
```

---

## Project Rules

- **Supabase only** — never Prisma (migrated, schema.prisma is legacy)
- **DaisyUI** for theming (Tailwind CSS 4)
- **Clerk `private.metadata`** for Alpaca keys — DO NOT modify `proxy.js`
- **BFF pattern** — all backend calls go through NextJS API routes, never directly from client
- **Graceful degradation** — Redis/Telegram/Discord failures never crash the app
- **Rate limiting ON by default** — all withAuth() routes have rate limiting; opt-out with `skipRateLimit:true`
- **Circuit breakers before every trade** — `checkCircuitBreakers()` called before order submission
- **Audit logging for all trade events** — immutable `trade_audit_log` records
- **PII never logged in plaintext** — IP addresses hashed with SHA-256 + pepper
- **Key rotation support** — add V2 env var + set active version for transparent rotation
- **4 public routes only** — `/api/health`, `/api/auth/clerk-config`, `/api/subscription/webhook`, `/api/health/cron`

---

## MCP Integration (P5)

### Backend MCP Server

- **Transport:** HTTP+SSE via `fastapi-mcp` mounted at `/mcp`
- **Auth:** `Depends(get_authed_user)` — unified chain: Clerk JWT → local JWT → X-API-Key
- **Tool exposure:** 40-45 tools auto-exposed from FastAPI routes
- **Excluded operations:** 19 dangerous ops (auth endpoints, feed control, renko writes, backtest delete, etc.)
- **Config:** `MCP_AUTH_ENABLED=true` (default), `MCP_ISSUER` optional
- **Header forwarding:** `Authorization` + `X-API-Key` passed through to underlying REST endpoints

### Frontend MCP BFF Proxy

| Route | Purpose |
|-------|--------|
| `/api/mcp` | Root MCP proxy — handles SSE streams + JSON-RPC |
| `/api/mcp/[...path]` | Catch-all proxy — injects Clerk JWT, forwards X-API-Key, 30s timeout |
| `/api/mcp/tools` | Tool discovery — calls `tools/list`, filters by plan, returns connection config |

**Auth patterns:**
- **Browser clients:** Clerk JWT injected via `auth().getToken({ template: "fastapi" })`
- **External clients:** `X-API-Key: nt_live_...` header passthrough
- **SSE streaming:** Content-type detection, proper SSE headers forwarded
- **Error handling:** JSON-RPC `-32603` errors on upstream failure

### Plan-Gated Tool Access

| Plan | Tool Access |
|------|-------------|
| **Free** | Read-only: regime, sizing, risk, portfolio, backtest history, renko state, operational status |
| **Premium** | + Write tools: strategy signals, backtest runs/compare/optimize/export, correlation, TDA features |
| **Institutional** | + Full access: optimization, GPU benchmarks, reconciliation, executor status |

### MCP Settings UI

- **Tab:** Settings → MCP (🤖 icon)
- **Features:** Connection URLs, API key display, tool list with expand/collapse, filter (all/available/locked), test connection button, Claude Desktop + Cursor config snippets, plan upgrade prompt
- **Component:** `McpIntegrationPanel.jsx`

## API Key System (P5)

### SaaS API Key Architecture

- **Format:** `nt_live_` prefix + 32-char base62 random token
- **Storage:** SHA-256 + pepper hash in Supabase `api_keys` table (plaintext never stored)
- **Lookup:** `get_authed_user` dependency checks `X-API-Key` header → hash → Supabase query → 60s cache
- **Key inheritance:** API keys inherit the creator's role and plan
- **Limits:** Free=2 keys, Premium=5 keys, Institutional=unlimited
- **Expiry:** Keys can optionally expire; `expire_stale_api_keys()` cron runs daily at 3 AM UTC
- **Revocation:** DELETE `/api/api-keys` endpoint with audit logging
- **Security:** Rate-limited, 429 on violation, key ID logged (not key value)

### pg_cron Jobs (9 total)

| Job | Schedule | Purpose |
|-----|----------|--------|
| Health check + portfolio snapshot | Every 5 min | `00000000000028_pg_cron_health_check.sql` |
| Expire stale API keys | Daily 3 AM UTC | `00000000000029_api_keys_cron.sql` |
| Data retention + archival | Daily 3 AM UTC | `00000000000025_retention.sql` |
| + 6 additional scheduled jobs | Various | Health checks, cleanup, notifications |

---

## Phase Completion History

| Phase | Description | Status | Key Deliverables |
|-------|-------------|--------|-----------------|
| **P0** | Live Trading Blockers | ✅ Complete | Kill switch, mode toggle, operational page |
| **P1** | Server-Side Auth + Per-Feature RBAC | ✅ Complete | withAuth() middleware, RoleGate, PlanGate, AccessGate |
| **P2** | Feature Delivery | ✅ Complete | Compliance, Broker Abstraction, Equity Curve, Notifications |
| **P3** | Institutional Hardening | ✅ Complete | Circuit Breakers, Audit Trail, Reconciliation, System Health, Smoke Test |
| **P4** | Production Readiness | ✅ Complete | Rate Limiting, Encryption, Retention, Multi-Tenant, Deployment Runbook |
| **P5** | MCP Integration + API Keys | ✅ Complete | MCP BFF proxy, tool discovery, McpIntegrationPanel, API key system, auto-expire cron, pg_cron migration |
