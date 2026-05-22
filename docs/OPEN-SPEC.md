# Noble Trader Agent — Open Specification

> **Version:** 7.0.0  
> **Last Updated:** 2026-05-22  
> **Status:** Production-Ready  
> **Organization:** Lexington Tech LLC

---

## 1. System Identity

**Name:** Noble Trader Agent  
**Type:** Institutional-grade algorithmic trading platform  
**Tagline:** Renko HFT pipeline with regime-aware risk management

The Noble Trader Agent is a full-stack web application that combines a 6-layer Renko brick processing pipeline with Hidden Markov Model regime detection, Kelly Criterion position sizing, and real-time risk management. It supports paper and live trading through Alpaca Markets, with institutional features including circuit breakers, immutable audit trails, reconciliation engines, and multi-tenant isolation.

---

## 2. System Architecture

### 2.1 Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  Next.js 16 SPA · React 19 · DaisyUI v5 · Clerk Auth Widget    │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────────┐
│                   VERCEL (Edge/Serverless)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              BFF Layer (93+ API Routes)                  │   │
│  │  withAuth() → Clerk JWT → Role/Plan/Rate Limit Check    │   │
│  │  /api/renko/*  /api/campaign/*  /api/trading/*          │   │
│  │  /api/circuit-breakers/*  /api/reconciliation/*         │   │
│  │  /api/compliance/*  /api/retention/*  /api/health/*     │   │
│  └──────────┬──────────────────┬──────────────────┬────────┘   │
│             │                  │                  │             │
│    ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐   │
│    │  Upstash Redis  │ │  Supabase   │ │ FastAPI Backend  │   │
│    │  Rate Limits    │ │  PostgreSQL │ │   (Render)       │   │
│    │  Cache L1       │ │  RLS+Vault  │ │  Renko Pipeline  │   │
│    └─────────────────┘ └──────┬──────┘ │  Regime Platform │   │
│                               │        └────────┬─────────┘   │
└───────────────────────────────┼─────────────────┼─────────────┘
                                │                 │
                    ┌───────────▼──────┐  ┌───────▼──────────┐
                    │   Supabase DB    │  │  Alpaca Markets  │
                    │   70+ Tables     │  │  Paper/Live API  │
                    │   7 pg_cron Jobs │  │  Bracket Orders  │
                    │   Vault Secrets  │  │  Fill Polling    │
                    └──────────────────┘  └──────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend Framework | Next.js (App Router) | 16 | SSR + BFF API routes |
| UI Library | React + DaisyUI v5 | 19 | Component rendering + theming |
| CSS | Tailwind CSS | 4 | Utility-first styling |
| Auth | Clerk | 7 | JWT + user management + RBAC |
| Backend Framework | FastAPI + Pydantic v2 | Latest | REST API + SSE + WebSocket |
| ML Engine | hmmlearn + numpy + pandas | Latest | HMM regime detection |
| Database | Supabase (PostgreSQL) | 15 | Persistence + RLS + pg_cron |
| Cache | Upstash Redis | Latest | Rate limiting + L1 cache |
| Broker | Alpaca Markets SDK | Latest | Order execution + fill polling |
| Notifications | Discord Webhooks | — | Real-time trade/system alerts |
| Encryption | Node.js crypto (AES-256-GCM + PBKDF2) | — | Credential + PII encryption |

---

## 3. Core Pipeline Specification

### 3.1 Renko HFT 6-Layer Pipeline

```
Input: Live price tick
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Layer 1: Brick Engine                                │
│ • Converts price ticks → Renko bricks                │
│ • Supports fixed / ATR / dynamic brick sizing        │
│ • Default: $0.50 fixed brick size                    │
│ Output: Renko brick (direction, open, close, index)  │
├─────────────────────────────────────────────────────┤
│ Layer 2: Swing Classifier                            │
│ • Labels each brick: HH, HL, LH, LL                 │
│ • Detects swing highs and swing lows                 │
│ Output: Classified bricks + swing points             │
├─────────────────────────────────────────────────────┤
│ Layer 3: Pattern Detector                            │
│ • Detects: bull_run, bear_run, reversal,             │
│   double_top, double_bottom, consolidation_break     │
│ • Minimum N consecutive direction for trigger        │
│ Output: Pattern signal (type, direction, strength)   │
├─────────────────────────────────────────────────────┤
│ Layer 4: Signal Filter (7-Layer Risk Gate)           │
│ • Session filter (market hours only)                 │
│ • Lunch filter (skip 12:00-13:00 ET)                │
│ • Trade count filter (max 15/session)                │
│ • Daily loss filter (max 10 bricks)                  │
│ • Consecutive loss filter (max 3, then cooldown)     │
│ • Cooldown filter (30s between trades)               │
│ • Regime gate (only trade with HMM alignment)        │
│ Output: Filtered signal or rejection reason          │
├─────────────────────────────────────────────────────┤
│ Layer 5: Risk Manager                                │
│ • Stop-loss: 3 bricks from entry                     │
│ • Take-profit: 5 bricks from entry                   │
│ • Trailing stop: after 3 bricks profit, 2 brick trail│
│ • Time stop: optional max holding period             │
│ Output: Trade parameters (entry, SL, TP, trail)      │
├─────────────────────────────────────────────────────┤
│ Layer 6: Executor                                    │
│ • Alpaca bracket order submission                    │
│ • Two-gate safety: dry_run=False AND live_enabled    │
│ • Per-request executor (no credential caching)       │
│ Output: Order confirmation or dry-run result         │
└─────────────────────────────────────────────────────┘
```

### 3.2 HMM Regime Detection

The platform uses dual Gaussian Hidden Markov Models to classify market conditions:

**Volatility Regime (4 states):**
- `low` → risk_multiplier = 1.50
- `med_low` → risk_multiplier = 1.25
- `med_high` → risk_multiplier = 0.75
- `high` → risk_multiplier = 0.50

**Trend Regime (4 states):**
- `strong_bear` → risk_multiplier reduction
- `bear` → slight reduction
- `bull` → slight increase
- `strong_bull` → risk_multiplier increase

**Combined regime labels:** `low_vol_bull`, `high_vol_bear`, etc.

---

## 4. Security Specification

### 4.1 Authentication

| Mechanism | Implementation | Scope |
|-----------|---------------|-------|
| User Auth | Clerk JWT (7-day sessions) | All BFF routes |
| Service Auth | CRON_SECRET (Bearer token) | Cron-triggered routes |
| Backend Auth | Clerk JWKS verification | All FastAPI endpoints |
| API Keys | Alpaca API keys (per-user, encrypted) | Broker operations |

### 4.2 Authorization (RBAC + PBAC)

**Role Hierarchy:** `viewer` < `trader` < `admin`

| Role | Capabilities |
|------|-------------|
| `viewer` | Read-only: state, stats, bricks, signals, trades, P&L |
| `trader` | All viewer + tick ingestion, backtests, regime updates, order submission |
| `admin` | All trader + config changes, pipeline reset, kill switch, circuit breakers, retention |

**Plan Hierarchy:** `free` < `premium` < `institutional`

| Plan | Rate Limit Multiplier | Features |
|------|----------------------|----------|
| `free` | 1x | Paper trading, 5 backtests/day |
| `premium` | 3x | + Live trading, unlimited backtests, real-time P&L |
| `institutional` | 10x | + Multi-tenant, API access, custom strategies |

### 4.3 Encryption

| Data Type | Algorithm | Key Derivation | Storage Format |
|-----------|-----------|---------------|----------------|
| Alpaca API keys | AES-256-GCM | PBKDF2 (100k iterations) | `v{ver}:{salt}:{iv}:{tag}:{ct}` |
| Discord webhooks | AES-256-GCM | PBKDF2 (100k iterations) | Same format |
| IP addresses | SHA-256 + pepper | One-way hash | Hex digest |
| Clerk metadata | Passthrough | — | Plain text in Clerk |

### 4.4 Rate Limiting

| Tier | Free | Premium | Institutional |
|------|------|---------|---------------|
| Trade execution | 10/min | 30/min | 100/min |
| Order management | 15/min | 45/min | 150/min |
| Backtesting | 5/5min | 15/5min | 50/5min |
| Data access | 60/min | 180/min | 600/min |
| Admin operations | 30/min | 90/min | 300/min |

---

## 5. Data Specification

### 5.1 Database (26 Migrations, ~70+ Tables)

**Core Tables:** `ta_analysis_run`, `ta_trade_recommendation`, `ta_scheduled_order`, `ta_telegram_notification`, `ta_tda_scan_result`, `ta_early_warning_alert`

**Evolution Tables:** `ta_strategy_variant`, `ta_strategy_performance`, `ta_ab_test`, `ta_evolution_log`

**Renko/Backtest Tables:** `ta_renko_snapshot`, `ta_backtest_result`

**User Management:** `user_credentials`, `user_subscriptions`, `user_onboarding`

**Campaign Tables:** `trade_campaign`, `campaign_trades`

**Institutional (P3-P4):** `trade_audit_log`, `circuit_breakers`, `trading_halts`, `reconciliation_results`, `smoke_test_results`, `rate_limit_violations`, `notification_preferences`, `portfolio_snapshots`

**Multi-Tenant:** `credentials`, `org_credentials` (with `org_id` columns on 13 tables)

**Retention:** `*_archive` tables (4), `gdpr_erasure_log`

**Helper Functions:** `set_updated_at()`, `campaign_tick()`, `get_vault_secret()`

### 5.2 pg_cron Jobs (7)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `noble-campaign-tick` | Every 1 min (market hours) | Campaign trade processing |
| `noble-tda-scan` | Every 4 hours | TDA signal scanning |
| `noble-schedule-execute` | Every 15 min (market hours) | Scheduled order execution |
| `noble-strategy-rotate` | Every 6 hours | Strategy variant rotation |
| `noble-strategy-optimize` | Daily 10pm UTC | Strategy optimization |
| `noble-portfolio-snapshot` | Daily 8pm UTC | Portfolio snapshot capture |
| `noble-retention-archive` | Daily 3am UTC | Data archival + cleanup |

---

## 6. API Specification

### 6.1 BFF Routes (93+)

All BFF routes go through `withAuth()` middleware which provides:
- Clerk authentication check
- Role-based access control (`minRole` option)
- Plan-based access control (`minPlan` option)
- Redis-backed rate limiting (on by default)
- CRON_SECRET bypass (`allowCron` option)
- Rate limit violation logging

**Public routes (no auth):** `/api/health`, `/api/auth/clerk-config`, `/api/subscription/webhook`, `/api/health/cron`

### 6.2 Backend Routes (40+)

See `docs/openapi.yaml` in the backend repository for the full OpenAPI 3.1 specification.

### 6.3 Response Patterns

| Scenario | HTTP Code | Response Body |
|----------|-----------|---------------|
| Success | 200 | `{ data: ... }` |
| Created | 201 | `{ id: ..., ... }` |
| Bad Request | 400 | `{ error: "VALIDATION_ERROR", message: "..." }` |
| Unauthorized | 401 | `{ error: "AUTH_REQUIRED", message: "..." }` |
| Forbidden | 403 | `{ error: "PLAN_REQUIRED" or "NO_KEYS", message: "..." }` |
| Rate Limited | 429 | `{ error: "RATE_LIMITED", retryAfter: 30 }` + headers |
| Server Error | 500 | `{ error: "INTERNAL_ERROR", message: "..." }` |

---

## 7. Operational Specification

### 7.1 Monitoring

| Check | Endpoint | Frequency | Alert Channel |
|-------|----------|-----------|---------------|
| Frontend health | `GET /api/health` | 5 min (Vercel Cron) | Discord #system-status |
| Backend health | `GET /health` | 5 min | Discord #system-status |
| Detailed health | `GET /api/health/detailed` | On demand | Dashboard |
| Rate limit violations | `GET /api/operational/rate-limit-violations` | On demand | Dashboard |
| Circuit breaker status | `GET /api/circuit-breakers` | On demand | Dashboard |

### 7.2 Incident Response

| Severity | Response Time | Examples |
|----------|--------------|----------|
| P0 — Trading halted/data loss | < 15 min | Kill switch activated, DB corruption |
| P1 — Feature degraded | < 1 hour | Backend down, rate limits failing |
| P2 — Non-critical issue | < 4 hours | Dashboard slow, webhook failures |
| P3 — Minor inconvenience | Next business day | UI glitch, non-critical bug |

See `docs/DEPLOYMENT-RUNBOOK.md` for complete procedures.

### 7.3 Key Rotation

| Key Type | Rotation Method | Downtime |
|----------|----------------|----------|
| Encryption key | Add V2 env var + set active version | Zero (auto re-encrypt on read) |
| Alpaca API keys | Update via Settings page | Zero (upsert in user_credentials) |
| Discord webhooks | Update Vercel env vars + redeploy | ~2 min (Vercel build) |
| CRON_SECRET | Update Vercel + Supabase Vault | ~5 min (propagation) |

---

## 8. Compliance Specification

### 8.1 Audit Trail

- **Immutability:** `trade_audit_log` is append-only (no UPDATE or DELETE)
- **17 event types** covering the full order lifecycle
- **Retention:** 90 days active, 365 days archive, then cold storage
- **Export:** CSV/JSON via `/api/compliance/audit-log/export`

### 8.2 Data Retention

| Table | Active Period | Archive Period | Total |
|-------|--------------|----------------|-------|
| `trade_audit_log` | 90 days | 365 days | 455 days |
| `rate_limit_violations` | 30 days | 90 days | 120 days |
| `reconciliation_results` | 90 days | 365 days | 455 days |
| `portfolio_snapshots` | 365 days | 5 years | ~6 years |

### 8.3 GDPR Compliance

- **Right to erasure:** `/api/retention` with `action: gdpr_purge`
- **Erasure log:** `gdpr_erasure_log` table records all purge operations
- **Scope:** All user-scoped data across all tables (credentials, campaigns, audit logs, preferences, etc.)

---

## 9. Development Specification

### 9.1 Project Rules

1. **Supabase only** — never Prisma
2. **DaisyUI** for all UI components
3. **BFF pattern** — all backend calls through Next.js API routes
4. **withAuth()** mandatory for all authenticated BFF routes
5. **Rate limiting** on by default; opt-out only for webhooks/cron
6. **Circuit breakers** checked before every trade execution
7. **Audit logging** for all trade lifecycle events
8. **PII never logged in plaintext** — hash with SHA-256 + pepper
9. **Graceful degradation** — Redis/Discord/Telegram failures never crash the app
10. **DO NOT modify `proxy.js`** — it handles Alpaca key management

### 9.2 File Conventions

- Components: `.jsx` (TypeScript only for API route files `.ts`)
- Library modules: `.js` (CommonJS + ESM compatible)
- Migrations: Sequential `000000000000XX_name.sql`
- Config: `src/lib/config.js` (single source of truth for APP_VERSION)

### 9.3 Test Credentials

- Email: `zai@0xdweb.com`
- Password: `zai0xdweb`
