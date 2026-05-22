# Noble Trader Agent — Complete Project Reference

> **Last Updated**: 2026-05-22
> **Version**: v7.0.0
> **Organization**: Lexington Tech LLC
> **License**: MIT
> **Stats**: 34 lib modules (11,973 lines) | 84 UI components across 18 directories | 93+ BFF API routes | 26 database migrations | 7 pg_cron jobs | ~70+ database tables

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Configuration & Settings](#2-database-configuration--settings)
3. [Cron & Orchestration Configuration](#3-cron--orchestration-configuration)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [Database Schema](#5-database-schema)
6. [Campaign Batch Orchestration System](#6-campaign-batch-orchestration-system)
7. [Strategy Evolution Engine](#7-strategy-evolution-engine)
8. [Credential & Auth System](#8-credential--auth-system)
9. [Error Sanitization Layer](#9-error-sanitization-layer)
10. [Rate Limiting & Throttling](#10-rate-limiting--throttling)
11. [Circuit Breaker System](#11-circuit-breaker-system)
12. [Audit Trail & Fill Verification](#12-audit-trail--fill-verification)
13. [Reconciliation Engine](#13-reconciliation-engine)
14. [Data Retention & GDPR Compliance](#14-data-retention--gdpr-compliance)
15. [Multi-Tenant Isolation](#15-multi-tenant-isolation)
16. [Broker Abstraction](#16-broker-abstraction)
17. [Smoke Test System](#17-smoke-test-system)
18. [API Routes Reference](#18-api-routes-reference)
19. [UI Components](#19-ui-components)
20. [Library Modules Reference](#20-library-modules-reference)
21. [pg_cron Jobs Reference](#21-pg_cron-jobs-reference)
22. [Deployment](#22-deployment)
23. [Project Rules](#23-project-rules)

---

## 1. Architecture Overview

### Monorepo Structure

```
/home/z/my-project/
├── noble-trader-agent-frontend/    ← Next.js v16 frontend (PRIMARY)
│   ├── src/
│   │   ├── app/                    ← Pages & 93+ BFF API routes
│   │   ├── components/             ← 84 UI components across 18 directories
│   │   ├── hooks/                  ← React hooks (useRenkoStream, useRole, usePlan, etc.)
│   │   └── lib/                    ← 34 library modules (11,973 lines)
│   ├── supabase/migrations/        ← 26 SQL migrations
│   └── .env.local                  ← Environment variables
├── noble-trader-agent-backend/     ← FastAPI Python backend (reference copy)
├── noble-trader-fastapi-backend/   ← FastAPI Python backend (ACTIVE - deployed on Render)
├── agent-ctx/                      ← Agent context / dev notes
├── db/                             ← Local SQLite (legacy, not used)
├── worklog.md                      ← Development work log
└── deploy-renko.sh                 ← Deployment script
```

### Data Flow

```
User → Next.js (Vercel) → BFF API Routes → FastAPI (Render)
                      ↘ Supabase (PostgreSQL + pg_cron + RLS)
                      ↘ Alpaca Markets API (via Broker Abstraction)
                      ↘ Upstash Redis (L1 cache + rate limiting)
                      ↘ Discord / Telegram (notifications)
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Supabase over Prisma** | Prisma Engine binary has cold-start issues on Vercel serverless; Supabase JS client is serverless-native |
| **BFF pattern** | `proxy.js` (NOT middleware.ts) routes `/api/renko/*` → backend; BFF routes call `auth().getToken()` for Clerk JWT |
| **AES-256-GCM with PBKDF2** | Application-layer encryption with proper key derivation (PBKDF2, 100k iterations) is safer than pgcrypto; key versioning supports rotation without downtime |
| **pg_cron + pg_net + Vault** | Server-driven orchestration survives browser disconnects and server restarts; no Vercel limitations; Vault for secret storage (GUC not supported on Supabase hosted) |
| **Redis-backed rate limiting** | Upstash Redis sliding window counter provides accurate, distributed rate limiting across all serverless instances with per-plan multipliers |
| **Circuit breakers pre-trade** | Pre-trade risk checks prevent catastrophic losses before execution reaches the broker; 9 default breakers with configurable actions and cooldowns |
| **Immutable audit trail** | Append-only `trade_audit_log` ensures regulatory compliance and full trade lifecycle traceability |
| **Broker abstraction layer** | `IBrokerAdapter` interface decouples trading logic from Alpaca-specific implementation, enabling future broker integrations |
| **Multi-tenant via org_id + RLS** | Defense-in-depth: application-level org_id filtering with RLS policies as safety net for direct DB access |
| **JS/JSX for components** | TypeScript only for API routes (per project rules) |

---

## 2. Database Configuration & Settings

### Supabase Connection Details

There are **two connection modes** used in this project:

#### Direct Connection (for migrations, admin tasks)

```
Host: pcvscowltlrxzgxjurcr.supabase.co
Port: 5432
Database: postgres
User: postgres
Password: *(see environment variables)*
SSL: Required

Connection string:
postgresql://postgres:<PASSWORD>@pcvscowltlrxzgxjurcr.supabase.co:5432/postgres
```

#### Pooler Connection (for serverless/Vercel — recommended)

```
Host: aws-0-us-west-1.pooler.supabase.com
Port: 6543
Database: postgres
User: postgres.pcvscowltlrxzgxjurcr
Password: <PASSWORD>
SSL: Required
Mode: Transaction (pgbouncer)

Connection string:
postgresql://postgres.pcvscowltlrxzgxjurcr:<PASSWORD>@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

**When to use which:**
- **Pooler (port 6543)**: Always use for Vercel serverless functions, API routes, and any application code. PgBouncer handles connection pooling for high-concurrency serverless environments.
- **Direct (port 5432)**: Use for migrations, one-off admin scripts, and tools that need direct PostgreSQL features (like `pg_cron` scheduling, `pg_net` calls). Supabase Dashboard SQL Editor uses this.

#### Supabase Project URLs

| Service | URL |
|---------|-----|
| **Dashboard** | `https://supabase.com/dashboard/project/pcvscowltlrxzgxjurcr` |
| **API URL** | `https://pcvscowltlrxzgxjurcr.supabase.co` |
| **REST API** | `https://pcvscowltlrxzgxjurcr.supabase.co/rest/v1/` |
| **Auth API** | `https://pcvscowltlrxzgxjurcr.supabase.co/auth/v1/` |
| **Realtime** | `wss://pcvscowltlrxzgxjurcr.supabase.co/realtime/v1/` |

### Two Supabase Clients in the Codebase

The project uses **two different Supabase clients** for different purposes:

#### 1. Service Role Client (server-side only, bypasses RLS)

Used by: `credentials.js`, `campaign-engine.js`, `audit-logger.js`, `reconciliation.js`, `retention.js`, API routes that need admin access

```javascript
// From credentials.js / campaign-engine.js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

**Key**: `SUPABASE_SERVICE_ROLE_KEY` — This is the service role key that **bypasses all Row Level Security policies**. It must **NEVER** be exposed to the browser (no `NEXT_PUBLIC_` prefix).

#### 2. Publishable/Anon Client (browser-safe, RLS enforced)

Used by: `supabase/db.js` (the Prisma-compatible wrapper)

```javascript
// From supabase/db.js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

**Key**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — This is the anon/publishable key that is **safe to expose to the browser**. Row Level Security policies are enforced with this key.

### Why Two Clients?

| Feature | Service Role Client | Publishable Client |
|---------|-------------------|-------------------|
| Bypasses RLS | Yes | No |
| Server-side only | Yes | Can be used client-side |
| Used for | Credential CRUD, campaign orchestration, admin ops, audit logging, reconciliation, retention | General data access (analysis runs, trade recommendations, etc.) |
| Env var prefix | No prefix (server-only) | `NEXT_PUBLIC_` (exposed to browser) |
| Auth mode | `autoRefreshToken: false, persistSession: false` | Same |

### Encryption Key

The `SUPABASE_ENCRYPTION_KEY` is used for AES-256-GCM encryption of Alpaca API keys in the application layer. As of v7.0.0, key derivation uses **PBKDF2** instead of simple padding:

```
Key derivation: PBKDF2 with 100,000 iterations (SHA-512)
Algorithm: AES-256-GCM
Key versioning: V1-V10 via SUPABASE_ENCRYPTION_KEY, SUPABASE_ENCRYPTION_KEY_V2, etc.
Active version: Controlled by SUPABASE_ENCRYPTION_ACTIVE_VERSION (defaults to highest available)
IV: 16 bytes random per encryption
Auth tag: 16 bytes
Encrypted data format: v{version}:{salt_base64}:{iv_base64}:{tag_base64}:{ciphertext_base64}
Auto re-encryption: On read when key version changes
PII hashing: SHA-256 + pepper (for IP addresses in rate_limit_violations)
```

---

## 3. Cron & Orchestration Configuration

### How pg_cron Works in This Project

The project uses **Supabase pg_cron + pg_net + Vault** for server-driven scheduling. The flow is:

```
pg_cron (every 60s)
  → SQL function campaign_tick()
    → vault.read_secret('cron_secret') + vault.read_secret('noble_base_url')
      → net.http_post()
        → POST https://<vercel-app>/api/campaign/tick
          → Authorization: Bearer <CRON_SECRET>
            → campaign-engine.tickCampaigns()
              → Check fills, update stats, place next trades
```

### CRON_SECRET — How It Works

The `CRON_SECRET` is a shared secret between **Supabase (pg_cron)** and **Vercel (Next.js API route)** that authenticates cron-triggered requests.

#### Where CRON_SECRET is stored:

1. **Vercel (environment variable)**: Set in Vercel Dashboard → Project → Settings → Environment Variables as `CRON_SECRET`. The API routes read it:

```javascript
// Campaign tick uses Bearer token:
const CRON_SECRET = process.env.CRON_SECRET;
const authHeader = request.headers.get("Authorization");
const isCron = authHeader && CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

// TDA scan & scheduled orders use x-cron-secret header or ?secret= param:
function verifyCronSecret(request) {
  if (!CRON_SECRET) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}
```

2. **Supabase Vault**: The same secret is stored as an encrypted secret in Supabase Vault. Cron SQL functions read it with `vault.read_secret()`:

```sql
-- In campaign_tick() function:
secret := vault.read_secret('cron_secret');

-- In inline cron schedules:
vault.read_secret('cron_secret')
```

#### Why Supabase Vault (not GUC variables)?

Supabase hosted plans **do not support** `ALTER DATABASE SET` for custom GUC variables. The recommended approach is Supabase Vault, which:
- Stores secrets **encrypted at rest** in the `vault.secrets` table
- Exposes them via `vault.read_secret(secret_name)` — a simple SQL function
- Is **enabled by default** on all Supabase projects
- Can be managed from the Dashboard (Database → Vault)
- Survives database restarts and migrations

#### Setting Up CRON_SECRET (Step by Step)

1. **Generate a strong secret** (e.g., `openssl rand -hex 32` or any long random string)

2. **Set in Vercel**: Go to Project Settings → Environment Variables → Add `CRON_SECRET` with your generated value

3. **Set in Supabase Vault**: Go to Dashboard → Database → Vault → Add Secret:
   - **Name**: `cron_secret`
   - **Value**: (same value as Vercel's CRON_SECRET)
   - **Description**: `Shared secret for pg_cron → API route authentication`

4. **Also add base URL to Vault**: Dashboard → Database → Vault → Add Secret:
   - **Name**: `noble_base_url`
   - **Value**: `https://noble-trader-agent-frontend.vercel.app`
   - **Description**: `Base URL for the Vercel deployment (used by cron jobs)`

5. **Verify secrets are accessible** (run in SQL Editor):
```sql
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);
```

6. **Verify cron jobs are working**:
```sql
SELECT * FROM cron.job_run_details
WHERE name IN ('noble-campaign-tick', 'noble-tda-scan', 'noble-schedule-execute',
               'noble-strategy-rotate', 'noble-strategy-optimize',
               'noble-portfolio-snapshot', 'noble-retention-archive')
ORDER BY start_time DESC LIMIT 20;
```

### Supabase Vault Secrets Reference

All cron jobs use **two Vault secrets**:

| Vault Secret Name | Purpose | Example Value |
|-------------------|---------|---------------|
| `cron_secret` | Shared secret for authenticating cron → API requests | (same as Vercel `CRON_SECRET`) |
| `noble_base_url` | Base URL of the Vercel deployment | `https://noble-trader-agent-frontend.vercel.app` |

**The `campaign_tick()` function** constructs the full URL by appending `/api/campaign/tick` to `noble_base_url`.

**The inline cron schedules** (TDA scan, scheduled orders, strategy rotation, optimization, portfolio snapshot, retention archive) also read from these same two Vault secrets.

### All pg_cron Jobs

| Job Name | Schedule | Vault Secrets | API Endpoint | Auth Method |
|----------|----------|---------------|-------------|-------------|
| `noble-campaign-tick` | `* 13-20 * * 1-5` (every minute during market hours) | `cron_secret`, `noble_base_url` | `POST /api/campaign/tick` | `Authorization: Bearer <secret>` |
| `noble-tda-scan` | `0 */4 * * *` (every 4 hours) | `cron_secret`, `noble_base_url` | `POST /api/tda/scan` | `x-cron-secret` header + `?secret=` param |
| `noble-schedule-execute` | `*/15 13-20 * * 1-5` (every 15 min during market hours) | `cron_secret`, `noble_base_url` | `POST /api/trading/schedule/execute` | `x-cron-secret` header + `?secret=` param |
| `noble-strategy-rotate` | `0 */6 * * *` (every 6 hours) | `cron_secret`, `noble_base_url` | `POST /api/evolution/rotate` | `x-cron-secret` header + `?secret=` param |
| `noble-strategy-optimize` | `0 22 * * 1-5` (daily 10pm UTC weekdays) | `cron_secret`, `noble_base_url` | `POST /api/evolution/optimize` | `x-cron-secret` header + `?secret=` param |
| `noble-portfolio-snapshot` | `0 20 * * *` (daily 8pm UTC) | `cron_secret`, `noble_base_url` | `POST /api/portfolio/snapshot/capture` | `x-cron-secret` header + `?secret=` param |
| `noble-retention-archive` | `0 3 * * *` (daily 3am UTC) | `cron_secret`, `noble_base_url` | `POST /api/retention` | `x-cron-secret` header + `?secret=` param |

**Utility commands** (run in Supabase SQL Editor):

```sql
-- List all cron jobs
SELECT jobid, name, schedule, command, active FROM cron.job;

-- View recent job logs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Pause a job
SELECT cron.pause('noble-campaign-tick');

-- Resume a job
SELECT cron.resume('noble-campaign-tick');

-- Delete a job
SELECT cron.unschedule('noble-campaign-tick');

-- Verify Vault secrets exist and are readable
SELECT
  name,
  CASE WHEN vault.read_secret(name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END as status
FROM (VALUES ('cron_secret'), ('noble_base_url')) AS t(name);

-- List all Vault secrets (metadata only, no values)
SELECT id, name, description, created_at FROM vault.secrets;
```

### Required Supabase Extensions

Three extensions are required:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
-- Vault is enabled by default on Supabase, but if needed:
-- CREATE EXTENSION IF NOT EXISTS vault SCHEMA vault;
```

| Extension | Purpose |
|-----------|--------|
| `pg_cron` | Scheduling mechanism — runs SQL on a cron schedule |
| `pg_net` | `net.http_post()` — allows SQL functions to make HTTP requests to API routes |
| `vault` | `vault.read_secret()` — encrypted secret storage (enabled by default) |

### Migration: GUC → Vault

If you previously set GUC variables (`app.campaign_tick_url`, `app.cron_secret`, `app.noble_base_url`, `app.noble_cron_secret`), you can clean them up after confirming Vault is working:

```sql
-- Remove old GUC variables (run after Vault migration is verified)
ALTER DATABASE postgres RESET app.campaign_tick_url;
ALTER DATABASE postgres RESET app.cron_secret;
ALTER DATABASE postgres RESET app.noble_base_url;
ALTER DATABASE postgres RESET app.noble_cron_secret;
-- Then RECONNECT for the GUC resets to take effect
```

The migration script `010_cron_vault_secrets.sql` handles re-scheduling all cron jobs with Vault-based secret reads.

---

## 4. Environment Variables Reference

### Required in Vercel (Production)

| Variable | Purpose | Example / Notes |
|----------|---------|----------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend auth | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk backend auth | `sk_test_...` |
| `NEXT_PUBLIC_FASTAPI_BASE_URL` | FastAPI backend URL | `https://noble-trader-fastapi-backend.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://pcvscowltlrxzgxjurcr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key (browser-safe) | `sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-only, bypasses RLS) | *(set in Vercel env vars)* |
| `SUPABASE_ENCRYPTION_KEY` | AES-256-GCM key for credential encryption (V1) | *(see env var)* |
| `SUPABASE_ENCRYPTION_KEY_V2` | AES-256-GCM key for credential encryption (V2) | *(for key rotation — see Section 8)* |
| `SUPABASE_ENCRYPTION_ACTIVE_VERSION` | Active encryption key version | Defaults to highest available V{N} |
| `CRON_SECRET` | Shared secret for pg_cron → API route auth | Generate with `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (cache + rate limiting) | `https://stunning-kodiak-73925.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | (configured) |
| `DISCORD_WEBHOOK_SIGNALS` | Discord channel for trade signals | `https://discord.com/api/webhooks/...` |
| `DISCORD_WEBHOOK_EXECUTIONS` | Discord channel for trade executions | `https://discord.com/api/webhooks/...` |
| `DISCORD_WEBHOOK_STATUS` | Discord channel for system status | `https://discord.com/api/webhooks/...` |

### Optional in Vercel

| Variable | Purpose | Notes |
|----------|---------|-------|
| `FASTAPI_USER` | FastAPI basic auth user | For backend API authentication |
| `FASTAPI_PASSWORD` | FastAPI basic auth password | For backend API authentication |
| `FASTAPI_API_KEY` | Alternative FastAPI auth key | X-API-Key header |
| `ALPACA_PAPER_API_KEY` | Default Alpaca paper key (cron fallback) | Used when user-specific keys unavailable |
| `ALPACA_PAPER_SECRET_KEY` | Default Alpaca paper secret (cron fallback) | Used when user-specific keys unavailable |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Legacy notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | Legacy notifications |
| `NEXT_PUBLIC_FINNHUB_API_KEY` | Finnhub live prices | Alternative price source |
| `RECONCILIATION_PRICE_TOLERANCE_PCT` | Price discrepancy threshold (percent) | Default: `0.5` (50 bps) |
| `RECONCILIATION_STALE_MINUTES` | Stale order threshold (minutes) | Default: `30` |
| `RECONCILIATION_DISCREPANCY_HALT_THRESHOLD` | Max discrepancies before auto-halt | Default: `3` |

### Server-Only Variables (NEVER expose to browser)

These must **NOT** have the `NEXT_PUBLIC_` prefix:

- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ENCRYPTION_KEY`
- `SUPABASE_ENCRYPTION_KEY_V2`
- `SUPABASE_ENCRYPTION_ACTIVE_VERSION`
- `CRON_SECRET`
- `ALPACA_PAPER_API_KEY`
- `ALPACA_PAPER_SECRET_KEY`
- `FASTAPI_USER`
- `FASTAPI_PASSWORD`
- `FASTAPI_API_KEY`
- `RECONCILIATION_PRICE_TOLERANCE_PCT`
- `RECONCILIATION_STALE_MINUTES`
- `RECONCILIATION_DISCREPANCY_HALT_THRESHOLD`

### Current .env.local Status

The local `.env.local` file has several **empty** values that are configured directly in Vercel instead:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=       # Set in Vercel
CLERK_SECRET_KEY=                        # Set in Vercel
FASTAPI_USER=                            # Set in Vercel
FASTAPI_PASSWORD=                        # Set in Vercel
NEXT_PUBLIC_SUPABASE_URL=                # Set in Vercel
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=  # Set in Vercel
TELEGRAM_BOT_TOKEN=                      # Not configured
TELEGRAM_CHAT_ID=                        # Not configured
NEXT_PUBLIC_FINNHUB_API_KEY=             # Not configured
```

**Configured locally:**
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `DISCORD_WEBHOOK_*` (all 3)
- `NEXT_PUBLIC_FASTAPI_BASE_URL`

**Additional vars set in Vercel but NOT in local .env.local:**
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ENCRYPTION_KEY`
- `SUPABASE_ENCRYPTION_KEY_V2`
- `SUPABASE_ENCRYPTION_ACTIVE_VERSION`
- `CRON_SECRET`
- `RECONCILIATION_*` variables

---

## 5. Database Schema

### Complete Table Reference

This section covers all tables from all 26 migrations.

#### Migration 01: Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_analysis_run` | Analysis pipeline run records | id, symbol, regime, strategy, status |
| `ta_trade_recommendation` | Trade recommendations with full context | id, symbol, side, regime, strategy, sizing, risk |
| `ta_scheduled_order` | Scheduled order execution | id, symbol, side, qty, execute_at, status |
| `ta_telegram_notification` | Notification store (all alert types) | id, type, channel, message |
| `ta_tda_scan_result` | Topological Data Analysis results | id, symbol, features, score |
| `ta_early_warning_alert` | TDA early warning alerts | id, symbol, alert_type, severity |

#### Migration 02: Strategy Evolution

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_strategy_variant` | Strategy parameter sets | id, name, generation, is_active, is_default, scores |
| `ta_strategy_performance` | Per-variant trade performance | id, variant_id, symbol, pnl_pct, source |
| `ta_ab_test` | A/B test assignments | id, variant_a_id, variant_b_id, status, winner_id |
| `ta_evolution_log` | Strategy parameter change history | id, from_variant_id, to_variant_id, trigger_type |

#### Migration 03: Scheduled Orders + Telegram Notifications (Enhanced)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_scheduled_order` | Enhanced with recurring schedule fields | id, symbol, side, qty, execute_at, recurrence, status |
| `ta_telegram_notification` | Enhanced with delivery tracking | id, type, channel, message, delivered_at, status |

#### Migration 04: Backtest Results

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_backtest_result` | Saved backtest results | id, symbol, equity_curve, trade_log, 30+ metrics |

#### Migration 05: Backtest Cost Columns

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_backtest_result` | Added commission/slippage cost columns | commission_total, slippage_total, net_pnl |

#### Migration 06: Renko Snapshot

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_renko_snapshot` | Renko pipeline warm-up snapshots | id, symbol, brick_size, snapshot_data |

#### Migration 07: User Credentials, Subscriptions & Onboarding

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_credentials` | AES-256-GCM encrypted Alpaca API keys | id, clerk_user_id, credential_type, api_key_encrypted, secret_key_encrypted |
| `user_subscriptions` | Plan state (free/premium/institutional) | id, clerk_user_id, plan, plan_status, helio_subscription_id |
| `user_onboarding` | Onboarding progress tracking | id, clerk_user_id, onboarding_complete, current_step |

#### Migration 08: Backend Credentials

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_credentials` | Added backend credential type support | credential_type expanded, backend_key_encrypted |

#### Migration 09: Universe Snapshot (Survivorship Bias)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_universe_snapshot` | Historical universe composition for survivorship bias correction | id, snapshot_date, symbols, source |

#### Migration 10: Corporate Actions

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_corporate_action` | Stock splits, dividends, mergers for backtest adjustment | id, symbol, action_type, ex_date, ratio, source |

#### Migration 11: Data Quality & Lineage Columns

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_analysis_run` | Added data quality and lineage tracking | data_source, data_quality_score, lineage_hash |
| `ta_backtest_result` | Added data quality columns | universe_version, data_quality_score |

#### Migration 12: Statistical Rigor Columns

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_backtest_result` | Added statistical rigor metrics | confidence_interval, p_value, sample_size, effect_size, is_statistically_significant |

#### Migration 13: Execution Modeling Columns

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_backtest_result` | Added execution modeling fields | execution_model, market_impact_bps, fill_rate, latency_ms |

#### Migration 14: Trade Audit Log (Immutable, Append-Only)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trade_audit_log` | Immutable append-only audit trail for all trade lifecycle events | id, clerk_user_id, org_id, event_type, order_id, symbol, side, qty, price, metadata, created_at |

#### Migration 15: P&L Alert Thresholds

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_pnl_alert_threshold` | Configurable P&L alert thresholds | id, clerk_user_id, threshold_type, threshold_value, is_active |

#### Migration 16: Org Credentials (Multi-Tenant)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `org_credentials` | Organization-level encrypted Alpaca keys | id, org_id, credential_type, api_key_encrypted, secret_key_encrypted |

#### Migration 17: Trade Campaign System

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trade_campaign` | Batch trade orchestration with risk guards | id, clerk_user_id, status, max_trades, max_consecutive_losses, max_drawdown_pct |
| `campaign_trades` | Individual trades within a campaign | id, campaign_id, trade_index, symbol, side, qty, status, realized_pnl |

#### Migration 18: Consolidated Cron Jobs (pg_cron scheduling)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| *(pg_cron job registration)* | Consolidates all cron job scheduling with Vault-based secrets | N/A — DDL only, no new tables |

#### Migration 19: Portfolio Snapshots

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `portfolio_snapshots` | Daily portfolio state snapshots for equity curve | id, clerk_user_id, org_id, total_value, cash, positions_json, pnl_daily, captured_at |

#### Migration 20: Notification Preferences

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_preferences` | Per-user notification channel and type preferences | id, clerk_user_id, channel, event_type, is_enabled, min_severity |

#### Migration 21: Circuit Breakers

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `circuit_breakers` | Circuit breaker definitions and state | id, name, breaker_type, threshold, action, cooldown_minutes, is_active, last_triggered_at |
| `trading_halts` | Active trading halts (global, symbol, user level) | id, halt_type, scope, symbol, clerk_user_id, reason, deactivated_at |

#### Migration 22: Reconciliation Results

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `reconciliation_results` | Expected vs actual trade comparison results | id, clerk_user_id, org_id, run_type, discrepancy_count, discrepancies_json, status, run_at |

#### Migration 23: Smoke Test Results

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `smoke_test_results` | E2E paper trading lifecycle test results | id, clerk_user_id, steps_json, passed, error_message, duration_ms, run_at |

#### Migration 24: Rate Limit Violations

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `rate_limit_violations` | Rate limit breach log with hashed IPs | id, clerk_user_id, ip_hash, route, tier, limit, current, violation_at |

#### Migration 25: Retention Archive

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trade_audit_log_archive` | Cold storage archive for trade audit log | *(same schema as trade_audit_log)* |
| `rate_limit_violations_archive` | Cold storage archive for rate limit violations | *(same schema as rate_limit_violations)* |
| `reconciliation_results_archive` | Cold storage archive for reconciliation results | *(same schema as reconciliation_results)* |
| `portfolio_snapshots_archive` | Cold storage archive for portfolio snapshots | *(same schema as portfolio_snapshots)* |
| `gdpr_erasure_log` | GDPR Article 17 erasure requests and status | id, clerk_user_id, erasure_type, tables_affected, status, requested_at, completed_at |

#### Migration 26: Multi-Tenant org_id Columns + RLS Policies

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| *(13 user-scoped tables)* | Added nullable `org_id` column + partial indexes + RLS policies | org_id, org_scope policies |

Tables receiving `org_id` in Migration 26:
1. `user_credentials`
2. `user_subscriptions`
3. `user_onboarding`
4. `trade_campaign`
5. `campaign_trades`
6. `trade_audit_log`
7. `portfolio_snapshots`
8. `notification_preferences`
9. `reconciliation_results`
10. `smoke_test_results`
11. `rate_limit_violations`
12. `ta_pnl_alert_threshold`
13. `org_credentials`

### RLS (Row Level Security) Summary

All user-scoped tables have RLS enabled with policies:

| Table | User Access | Service Role |
|-------|-------------|-------------|
| `user_credentials` | Own records only (CRUD) | Full access (bypasses RLS) |
| `user_subscriptions` | Read own only | Full access |
| `user_onboarding` | Read, insert, update own | Full access |
| `trade_campaign` | Own records only (CRUD) | Full access |
| `campaign_trades` | Own campaign trades (via parent) | Full access |
| `trade_audit_log` | Read own only (append-only, no update/delete) | Full access |
| `portfolio_snapshots` | Read own only | Full access |
| `notification_preferences` | Own records (CRUD) | Full access |
| `circuit_breakers` | Read only | Full access |
| `trading_halts` | Read only | Full access |
| `reconciliation_results` | Read own only | Full access |
| `smoke_test_results` | Read own only | Full access |
| `rate_limit_violations` | Read own only | Full access |
| `org_credentials` | Own org records only | Full access |

RLS policies use `auth.jwt() ->> 'sub'` to match `clerk_user_id` and `org_id` for multi-tenant isolation. The service role key bypasses all RLS policies.

### Helper Functions

| Function | Purpose |
|----------|---------|
| `set_updated_at()` | Auto-set `updated_at = now()` on every row update (trigger) |
| `campaign_tick()` | pg_cron callback: fires HTTP POST to the campaign tick API route |

### Migration Order

Run migrations in this order:

```
01: 00000000000001_create_tables.sql
02: 00000000000002_strategy_evolution.sql
03: 00000000000003_evolution_cron.sql
04: 00000000000004_scheduled_orders.sql
05: 00000000000005_scheduled_orders_cron.sql
06: 00000000000006_renko_snapshot.sql
07: 00000000000007_backtest_results.sql
08: 00000000000008_backtest_cost_columns.sql
09: 001_user_credentials_subscriptions.sql
10: 009_trade_campaign.sql
11: 20260511_cron_jobs.sql
12: 010_cron_vault_secrets.sql
13: Migration 09 — Universe Snapshot (survivorship bias)
14: Migration 10 — Corporate Actions
15: Migration 11 — Data Quality & Lineage Columns
16: Migration 12 — Statistical Rigor Columns
17: Migration 13 — Execution Modeling Columns
18: Migration 14 — Trade Audit Log (immutable, append-only)
19: Migration 15 — P&L Alert Thresholds
20: Migration 16 — Org Credentials (multi-tenant)
21: Migration 17 — Trade Campaign System (trade_campaign, campaign_trades, campaign_tick())
22: Migration 18 — Consolidated Cron Jobs (pg_cron scheduling)
23: Migration 19 — Portfolio Snapshots
24: Migration 20 — Notification Preferences
25: Migration 21 — Circuit Breakers (circuit_breakers, trading_halts)
26: Migration 22 — Reconciliation Results
27: Migration 23 — Smoke Test Results
28: Migration 24 — Rate Limit Violations
29: Migration 25 — Retention Archive (archive tables, gdpr_erasure_log)
30: Migration 26 — Multi-Tenant org_id columns + RLS policies
```

---

## 6. Campaign Batch Orchestration System

### Overview

The Campaign system orchestrates sequential batch trades with aggregate risk guards. The user analyzes data using HMM + Renko + Kelly + Risk, then the platform executes a batch of trades (e.g., 10 trades, 6W/4L, max 3 consecutive losses).

### State Machine

```
draft → running → completed
                  ├── stopped_loss_streak
                  ├── stopped_max_drawdown
                  ├── stopped_manual
                  └── error
       → paused → running (resume)
```

### Campaign Lifecycle

1. **Draft**: Campaign created with batch parameters and trade list. No orders placed yet.
2. **Running**: First trade placed. pg_cron ticks every 60s during market hours to check outcomes.
3. **Each Tick**:
   - Check if current trade has closed (SL/TP hit)
   - Update campaign stats (wins, losses, consecutive losses, P&L, drawdown)
   - Check stop conditions (consecutive losses, max drawdown, all trades done)
   - Place next trade if campaign should continue
4. **Completed/Stopped**: Campaign ends. Results fed to strategy evolution.

### Stop Conditions (Auto-Stop)

| Condition | Behavior |
|-----------|----------|
| `consecutive_losses >= max_consecutive_losses` | Status → `stopped_loss_streak` |
| `drawdown_pct > max_drawdown_pct` (after 2+ trades) | Status → `stopped_max_drawdown` |
| `trades_filled >= max_trades` | Status → `completed` |
| User clicks "Stop" | Status → `stopped_manual` |
| Orchestration error | Status → `error` |

### Campaign Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `max_trades` | 10 | 1-50 | Maximum trades in the batch |
| `max_consecutive_losses` | 3 | 1-10 | Auto-stop after N consecutive losses |
| `max_drawdown_pct` | 0.05 (5%) | 0.01-0.50 | Auto-stop if drawdown exceeds this % |
| `kelly_fraction` | 0.50 | 0-1 | Kelly Criterion fraction for position sizing |
| `position_sizing_mode` | `kelly` | kelly/fixed/risk_parity | How position size is determined |
| `signal_source` | `renko` | renko/analysis/manual | Where the trade signals come from |

### Campaign Engine (`src/lib/campaign-engine.js`)

Key exported functions:

| Function | Purpose | Auth Required |
|----------|---------|--------------|
| `createCampaign(params)` | Create campaign in draft status | Yes (Clerk) |
| `startCampaign(campaignId)` | Start running, place first trade | Yes (Clerk) |
| `pauseCampaign(campaignId)` | Pause a running campaign | Yes (Clerk) |
| `resumeCampaign(campaignId)` | Resume a paused campaign | Yes (Clerk) |
| `stopCampaign(campaignId)` | Stop manually | Yes (Clerk) |
| `getCampaign(campaignId)` | Get campaign details + trades | Yes (Clerk) |
| `listCampaigns({ status, limit })` | List user's campaigns | Yes (Clerk) |
| `tickCampaigns(cronSecret)` | Process all running campaigns | Cron secret or dev mode |
| `feedCampaignResults(campaignId)` | Feed results to strategy evolution | Internal |
| `getCampaignStats()` | Aggregate stats for user | Yes (Clerk) |

### Key Resolution for Campaign Trades

The campaign engine resolves Alpaca keys with a 3-level fallback:

1. **Supabase encrypted credentials** (`getCredentials("paper")`) — primary
2. **Clerk privateMetadata** (`alpaca_api_key`, `alpaca_secret_key`) — fallback
3. **Environment variables** (`ALPACA_PAPER_API_KEY`, `ALPACA_PAPER_SECRET_KEY`) — server-to-server / cron

For cron-triggered ticks (no Clerk session), the engine falls back to env vars since there's no authenticated user context for key resolution.

### Campaign Results → Strategy Evolution

When a campaign completes or stops, the `feedCampaignResults()` function posts results to `/api/evolution/feedback`:

```javascript
{
  variantId: campaign.analysis_id,
  source: "campaign",
  campaignId: campaign.id,
  totalTrades, wins, losses, winRate,
  totalPnl, maxDrawdown, kellyFraction,
  signalSource, completedAt
}
```

This creates a feedback loop where live campaign results influence strategy variant selection and optimization.

---

## 7. Strategy Evolution Engine

### Overview

The Strategy Evolution engine manages strategy variant lifecycle: creation, activation, performance tracking, A/B testing, automatic rotation, and Optuna-driven re-optimization.

### Default Variant Parameters

```javascript
{
  nHmmStates: 4,
  hmmIter: 100,
  hmmWindow: 200,
  hmmRefitEvery: 50,
  kellyFraction: 0.5,
  targetVol: 0.15,
  baseRiskLimit: 0.02,
  maxPositionPct: 0.25,
  regimeGate: true,
  riskCheck: true,
  commissionBps: 5.0,
  slippageBps: 2.0,
}
```

### Composite Score Formula

```
composite = (sharpeScore * 0.30) + (winRateScore * 0.20) + (ddScore * 0.25) + (pfScore * 0.15) + (returnScore * 0.10)
```

Where:
- `sharpeScore = clamp(sharpe / 2.0, 0, 1)`
- `winRateScore = clamp(winRate, 0, 1)`
- `ddScore = clamp(1 - maxDd / 0.50, 0, 1)`
- `pfScore = clamp(profitFactor / 2.0, 0, 1)`
- `returnScore = clamp(totalReturn / 0.20, 0, 1)`

### Auto-Rotation Thresholds

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `MIN_RECORDS_FOR_ROTATION` | 10 | Need at least 10 performance records |
| `ROTATION_SCORE_THRESHOLD` | 0.35 | Rotate if composite score below this |
| `ROTATION_MAX_DD_THRESHOLD` | 0.35 | Rotate if max drawdown exceeds 35% |
| `MAX_UNDERPERFORMANCE_PERIODS` | 3 | Rotate after 3 consecutive underperforming checks |

### A/B Test Assignment

A/B test variant assignment is **deterministic by symbol name** using a hash function, ensuring consistency across requests for the same symbol.

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `getActiveVariant()` | Get current active variant (or default) |
| `getAllVariants()` | List all variants, active first |
| `createVariant({ name, params, triggerType, parentVariantId })` | Create a new variant |
| `activateVariant(variantId, triggerType, reason)` | Activate variant, log evolution |
| `recordPerformance(perf)` | Record trade performance, update scores |
| `updateVariantScores(variantId)` | Recalculate aggregate scores |
| `createABTest({ name, variantAId, variantBId, allocationPct })` | Create A/B test |
| `getActiveABTest(symbol)` | Get active test + deterministic variant |
| `completeABTest(testId)` | Complete test, determine winner |
| `runOptunaOptimization({ symbol, prices, nTrials })` | Multi-trial backtest search |
| `checkAndRotate()` | Auto-rotate if active variant underperforms |
| `getEvolutionSummary()` | Full evolution state for UI |

---

## 8. Credential & Auth System

### Authentication Flow

1. **Clerk** signs in user
2. **BFF routes** call `getClerkJWT(sessionId)` via "server" JWT template
3. **BFF forwards** `Authorization: Bearer` token to FastAPI
4. **FastAPI validates** via Clerk JWKS (`get_authed_user`)
5. If JWT claims null, backend enriches via Clerk API (`_enrich_from_clerk_api`, 5-min cache)
6. **Alpaca keys** stored in Clerk `private.metadata` → retrieved via BFF proxy.js

### JWT Resolution Cascade (BFF → FastAPI)

The BFF route handlers (e.g., `/api/renko/[action]`) obtain a JWT via `getFastAPIAuthHeaders()` which tries methods in priority order:

1. **Clerk REST API JWT with "server" template** — Calls `POST /v1/sessions/{sessionId}/tokens` with `body: {template: "server"}`. The "server" JWT template (configured in Clerk Dashboard) injects email, first_name, last_name, username, and role claims into the JWT. This is the primary method and works reliably in serverless.

2. **Clerk REST API default JWT** — If the "server" template doesn't exist yet, falls back to `body: {}` which returns a default JWT with only sub/iss/exp claims.

3. **`auth().getToken()`** — Standard Clerk SDK method. Tries `{template: "server"}` first, then default. May return null in serverless edge cases.

4. **`__session` cookie** — Keyless/dev mode fallback.

5. **`X-API-Key`** — Service-to-service fallback for cron jobs.

### Backend Clerk API Enrichment

When the JWT doesn't contain email/name claims (i.e., the "server" template hasn't been configured), the FastAPI backend automatically calls the Clerk Backend API (`GET /v1/users/{sub}`) to fill in user profile info. Results are cached for 5 minutes per user.

### Clerk JWT Template Setup

For zero-latency claims (no backend API call needed), create a JWT template in Clerk Dashboard → Paths → JWT Templates:

- **Template name**: `server`
- **Claims**: `{"email": "{{user.primary_email_address}}", "first_name": "{{user.first_name}}", "last_name": "{{user.last_name}}", "username": "{{user.username}}", "role": "{{user.private_metadata.role}}"}}

### Role System

Roles are unified across client and server:

| Role | Access Level | Default |
|------|-------------|--------|
| `admin` | Full access — all endpoints, configuration, kill-switch | No |
| `trader` | Read + write — sizing, risk, streaming, backtests, tick ingestion | No |
| `viewer` | Read-only — state, stats, bricks, signals, trades | **Yes** (default) |

- **Client-side**: `useRole()` hook with `canAccess(role)` helper and optional server sync via `/api/auth/role`
- **Server-side**: `clerk-metadata.js` → `getRoleInfo()` returns same shape
- **RoleGate component**: `<RoleGate require="trader">` with loading state and `requireServerSync` prop for sensitive ops

### withAuth.js Middleware

`withAuth()` wraps Next.js route handlers and provides:

| Option | Purpose | Default |
|--------|---------|---------|
| `minRole` | Minimum role required (`viewer` < `trader` < `admin`) | `viewer` |
| `minPlan` | Minimum plan required (`free` < `premium` < `institutional`) | `free` |
| `skipRateLimit` | Opt out of rate limiting | `false` (rate limiting ON by default) |
| `allowCron` | Allow CRON_SECRET bypass | `false` |

```javascript
// Example usage:
export const POST = withAuth(async (request, { userId }) => {
  // handler
}, { minRole: 'trader', minPlan: 'premium' });
```

### Credential Encryption (Updated v7.0.0 — PBKDF2)

Alpaca API keys are encrypted with **AES-256-GCM** using **PBKDF2 key derivation** in the application layer before storage.

**Encryption process:**
1. Determine active key version (from `SUPABASE_ENCRYPTION_ACTIVE_VERSION`, defaults to highest available)
2. Generate 32-byte random salt
3. Derive 32-byte key via PBKDF2 (SHA-512, 100,000 iterations) using encryption key + salt
4. Generate 16-byte random IV
5. Encrypt with AES-256-GCM using derived key
6. Get 16-byte authentication tag
7. Format: `v{version}:{salt_base64}:{iv_base64}:{tag_base64}:{ciphertext_base64}`
8. Store as TEXT in `api_key_encrypted` / `secret_key_encrypted` columns

**Decryption process** (reverse):
1. Parse version from `v{version}:` prefix
2. Select corresponding key: V1 → `SUPABASE_ENCRYPTION_KEY`, V2 → `SUPABASE_ENCRYPTION_KEY_V2`, etc.
3. Decode salt, IV, tag, ciphertext from base64
4. Derive key via PBKDF2 with same parameters
5. Decrypt with AES-256-GCM, verify auth tag
6. Return plain text
7. **Auto re-encryption**: If decrypted with a non-active version, re-encrypt with the active key version and update the stored value

**PII hashing** (for IP addresses in `rate_limit_violations`):
- SHA-256 with application pepper
- One-way; not reversible
- Prevents storing raw IP addresses while allowing deduplication

### Key Versioning & Rotation

The encryption system supports up to 10 key versions (V1-V10):

| Env Var | Version | Purpose |
|---------|---------|---------|
| `SUPABASE_ENCRYPTION_KEY` | V1 | Original encryption key |
| `SUPABASE_ENCRYPTION_KEY_V2` | V2 | Rotated key |
| `SUPABASE_ENCRYPTION_KEY_V3` through `V10` | V3-V10 | Future rotations |
| `SUPABASE_ENCRYPTION_ACTIVE_VERSION` | — | Controls which version is used for new encryptions (defaults to highest available) |

**Key rotation process:**
1. Add new key version env var (e.g., `SUPABASE_ENCRYPTION_KEY_V2`)
2. Set `SUPABASE_ENCRYPTION_ACTIVE_VERSION=2`
3. Existing data is decrypted with V1 and automatically re-encrypted with V2 on next read
4. No downtime; gradual migration

### Credential Resolution Chain

When an API route needs Alpaca keys, the resolution chain is:

```
1. Supabase encrypted credentials (getCredentials("paper"|"live"))
   ↓ (if unavailable)
2. Clerk privateMetadata (alpaca_api_key, alpaca_secret_key)
   ↓ (if unavailable)
3. Environment variables (ALPACA_PAPER_API_KEY, ALPACA_PAPER_SECRET_KEY)
   ↓ (if unavailable)
   → Error: "Alpaca API keys not configured"
```

### Plan-Based Feature Gating

| Feature | Free | Premium ($49/mo) | Institutional (custom) |
|---------|------|-------------------|----------------------|
| Paper trading | Yes | Yes | Yes |
| Live trading | No | Yes | Yes |
| Backtests/day | 5 | Unlimited | Unlimited |
| Regime detection | Yes | Yes | Yes |
| Portfolio optimization | No | Yes | Yes |
| Real-time P&L | No | Yes | Yes |
| Priority execution | No | Yes | Yes |
| API access | No | No | Yes |
| Custom strategies | No | No | Yes |
| Multi-tenant | No | No | Yes |
| Dedicated support | No | No | Yes |
| Rate limit multiplier | 1x | 3x | 10x |

**Important**: Live credentials can only be saved by Premium or Institutional users. The `saveCredentials()` function gates this.

### Clerk UserButton → Settings Page

Settings page is accessible from the Clerk `UserButton` menu. This is where users manage API keys, view subscription status, etc.

### Public Routes (No Auth Required)

The following routes do not require authentication:

| Route | Purpose |
|-------|---------|
| `/api/health` | Backend health check |
| `/api/auth/clerk-config` | Clerk publishable key config |
| `/api/subscription/webhook` | Payment webhook (Helio) |
| `/api/health/cron` | Cron health status |

---

## 9. Error Sanitization Layer

### How It Works

The error sanitization system (`src/lib/error-messages.js`) ensures internal errors never leak to end users:

1. **`sanitizeError(error, { context })`** — Strips internal details, returns safe message
2. **`getErrorDisplay(code)`** — Maps error codes to UI-friendly displays with icons and actions
3. **`createApiError(error, { context })`** — Convenience wrapper returning JSON Response

### Error Code Reference

| Code | HTTP Status | User Message | Icon |
|------|-------------|-------------|------|
| `CONFIG_MISSING` | 503 | Service configuration is incomplete | wrench |
| `NO_KEYS` | 403 | Trading account not connected yet | key |
| `INVALID_KEYS` | 401 | API keys appear to be invalid | shield |
| `AUTH_REQUIRED` | 401 | Please sign in | lock |
| `PLAN_REQUIRED` | 403 | Feature requires Premium or Institutional plan | crown |
| `CONNECTION_FAILED` | 502 | Unable to reach the trading service | wifi |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | clock |
| `RATE_LIMITED` | 429 | Too many requests | hourglass |
| `INTERNAL_ERROR` | 500 | Something went wrong | alert |
| `VALIDATION_ERROR` | 400 | Invalid data provided | shield |
| `UNKNOWN` | 500 | Unexpected error occurred | alert |

### Sanitization Patterns

The system matches raw error messages against these patterns (in order):

1. **Env var leaks** (most critical): Matches `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ENCRYPTION_KEY`, `SUPABASE_ENCRYPTION_KEY_V2`, etc.
2. **Missing keys**: Matches `Missing.*KEY`, `Missing.*URL`
3. **Alpaca credential errors**: Matches `Alpaca API keys not configured`, `invalid.*api.*key`
4. **Auth errors**: Matches `not authenticated`, `unauthorized`, `clerk.*session`
5. **Plan gating**: Matches `requires a (Premium|Institutional) plan`
6. **Connection errors**: Matches `ECONNREFUSED`, `ETIMEDOUT`, `fetch failed`
7. **Rate limiting**: Matches `rate limit`, `429`
8. **DB/Supabase errors**: Matches `supabase`, `pgcrypto`, `PGRST`
9. **Circuit breaker**: Matches `circuit breaker`, `trading halt`, `halted`
10. **Reconciliation**: Matches `reconciliation`, `discrepancy`

**Any unmatched error** gets a generic context-specific message (never the raw error text).

### GracefulError Component

The `<GracefulError>` component (`src/components/shared/GracefulError.jsx`) renders polished error UI:

- **Full variant**: Icon + title + description + action button
- **Compact variant**: Inline error with icon and message
- **Contextual icons**: Different icons per error code
- **Action buttons**: "Set Up Keys", "Sign In", "Retry", "Upgrade"

---

## 10. Rate Limiting & Throttling

### Overview (P4-6A)

The rate limiting system uses **Upstash Redis** as a sliding window counter to enforce per-route, per-user request limits. Rate limiting is **ON BY DEFAULT** for all routes wrapped with `withAuth()`.

### Architecture

```
Request → withAuth() → rate-limiter.js → Upstash Redis (sliding window)
                                                ↓
                                          Check tier + plan multiplier
                                                ↓
                                    Allow → continue to handler
                                    Deny  → 429 + headers + log violation
```

### Route Tiers

10 route tiers with different rate limits:

| Tier | Limit | Window | Example Routes |
|------|-------|--------|----------------|
| `trade` | 10 | per minute | `/api/trading/execute`, `/api/trading/approve` |
| `order` | 15 | per minute | `/api/alpaca/orders/create`, `/api/renko/orders` |
| `backtest` | 5 | per 5 minutes | `/api/renko/backtest/run`, `/api/backtest/run`, `/api/backtest/optimize` |
| `ai` | 10 | per minute | `/api/commentary`, `/api/analyse` |
| `write` | 10 | per minute | `/api/campaign`, `/api/evolution/variants` |
| `data` | 60 | per minute | `/api/portfolio`, `/api/alpaca/positions`, `/api/prices` |
| `admin` | 30 | per minute | `/api/circuit-breakers`, `/api/smoke-test`, `/api/operational/*` |
| `auth` | 20 | per minute | `/api/auth/*`, `/api/clerk/*` |
| `public` | 100 | per minute | `/api/health`, `/api/auth/clerk-config` |
| `default` | 30 | per minute | All unmatched routes |

### Plan Multipliers

| Plan | Multiplier | Example (trade tier) |
|------|-----------|---------------------|
| `free` | 1x | 10 req/min |
| `premium` | 3x | 30 req/min |
| `institutional` | 10x | 100 req/min |

### Auto-Detection

Rate limit tiers are auto-detected from URL path patterns (40+ patterns). The `rate-limiter.js` module maps paths to tiers:

```javascript
// Auto-detection examples:
"/api/trading/execute"  → "trade"
"/api/renko/backtest/*" → "backtest"
"/api/campaign"         → "write"
"/api/health"           → "public"
"/api/alpaca/positions" → "data"
```

### Response Headers

All responses include rate limit headers:

| Header | Purpose |
|--------|---------|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

### 429 Response

When rate limit is exceeded:

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 45
}
```

HTTP response includes `Retry-After` header.

### Violation Logging

Rate limit violations are logged to the `rate_limit_violations` table:

| Field | Value |
|-------|-------|
| `clerk_user_id` | Authenticated user ID (if available) |
| `ip_hash` | SHA-256 + pepper hash of IP address (PII safe) |
| `route` | The route that was rate limited |
| `tier` | The rate limit tier |
| `limit` | The configured limit |
| `current` | The current request count |

### Opt-Out

Rate limiting is ON BY DEFAULT in `withAuth()`. To opt out for a specific route:

```javascript
export const GET = withAuth(async (request, { userId }) => {
  // handler
}, { skipRateLimit: true });
```

### Implementation Module

`src/lib/rate-limiter.js` — Redis-backed sliding window counter using Upstash Redis REST API.

---

## 11. Circuit Breaker System

### Overview (P3-5A)

The Circuit Breaker system provides **pre-trade risk checks** before every execution. If any breaker is triggered, the trade is rejected or trading is halted depending on the breaker's configured action.

### Architecture

```
Trade Request → circuit-breaker.js → Check all active breakers
                                               ↓
                                    All pass → proceed to execution
                                    Any fail → reject_order / halt / alert
```

### Default Circuit Breakers (9)

| Breaker Name | Type | Default Threshold | Action | Cooldown |
|--------------|------|-------------------|--------|----------|
| `max_position_size` | Position | $50,000 | `reject_order` | 0 min |
| `max_open_positions` | Portfolio | 20 | `reject_order` | 0 min |
| `daily_loss_limit` | P&L | $5,000 | `halt` | 60 min |
| `max_drawdown` | P&L | 10% | `halt` | 60 min |
| `consecutive_loss_stop` | P&L | 5 | `halt` | 30 min |
| `order_rate_limit` | Rate | 20/min | `reject_order` | 5 min |
| `single_stock_concentration` | Portfolio | 25% | `reject_order` | 0 min |
| `max_portfolio_heat` | Risk | 40% | `halt` | 30 min |
| `sector_concentration` | Portfolio | 40% | `reject_order` | 0 min |

### Breaker Actions

| Action | Behavior |
|--------|----------|
| `reject_order` | Reject the specific order; user can try again immediately |
| `halt` | Initiate a trading halt (global, symbol-level, or user-level); no new orders until deactivated |
| `alert` | Log warning and allow the order; no block |

### Trading Halts

When a breaker triggers a `halt` action, a trading halt is created:

| Halt Type | Scope | Example |
|-----------|-------|---------|
| `global` | All trading for the platform | System-wide risk event |
| `symbol` | All trading for a specific symbol | Extreme volatility on one stock |
| `user` | All trading for a specific user | User hit daily loss limit |

### Admin Deactivation

Trading halts can be deactivated by admins via:

```
POST /api/circuit-breakers/halts/deactivate
Body: { haltId, reason }
```

Requires `admin` role.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/circuit-breakers` | `GET` | List all breakers and their current state |
| `/api/circuit-breakers/check` | `POST` | Pre-trade check (internal use) |
| `/api/circuit-breakers/halts` | `GET` | List active trading halts |
| `/api/circuit-breakers/halts/deactivate` | `POST` | Deactivate a halt (admin only) |

### Implementation Module

`src/lib/circuit-breaker.js` — Breaker definitions, state management, and pre-trade evaluation.

### Database Tables

| Table | Purpose |
|-------|---------|
| `circuit_breakers` | Breaker definitions and current state (threshold, action, cooldown, last_triggered_at) |
| `trading_halts` | Active trading halts (type, scope, reason, deactivated_at) |

### UI Component

`src/components/operational/CircuitBreakerPanel.jsx` — Admin dashboard for viewing breaker states, active halts, and deactivating halts.

---

## 12. Audit Trail & Fill Verification

### Overview (P3-5B)

The Audit Trail system provides an **immutable, append-only** record of all trade lifecycle events. Combined with the fill verification poller, it ensures every order is tracked from signal to settlement.

### Audit Events

| Event | Trigger | Data Captured |
|-------|---------|---------------|
| `ORDER_SUBMITTED` | Order sent to Alpaca | symbol, side, qty, type, limit_price |
| `ORDER_ACCEPTED` | Alpaca acknowledges order | order_id, alpaca_order_id |
| `ORDER_REJECTED` | Alpaca rejects order | reason, error_code |
| `ORDER_FILLED` | Order fully or partially filled | fill_price, fill_qty, fill_time |
| `ORDER_CANCELLED` | User or system cancels order | reason, remaining_qty |
| `ORDER_EXPIRED` | Order expires unfilled | expiry_time |
| `SL_TRIGGERED` | Stop-loss price hit | trigger_price, pnl |
| `TP_TRIGGERED` | Take-profit price hit | trigger_price, pnl |
| `TRAILING_STOP_TRIGGERED` | Trailing stop activated | trigger_price, trail_pct |
| `TRAILING_STOP_UPDATED` | Trailing stop price updated | old_price, new_price |
| `TRADE_CLOSED` | Position fully closed | close_price, realized_pnl |
| `CIRCUIT_BREAKER_TRIGGERED` | Circuit breaker fires | breaker_name, action |
| `CIRCUIT_BREAKER_DEACTIVATED` | Admin deactivates halt | breaker_name, reason |
| `KILL_SWITCH_ACTIVATED` | Emergency stop activated | reason, activated_by |
| `KILL_SWITCH_DEACTIVATED` | Emergency stop cleared | reason, deactivated_by |
| `RECONCILIATION_RUN` | Reconciliation executed | discrepancy_count, status |
| `SMOKE_TEST_RUN` | E2E smoke test executed | passed, steps |

### Database Table

The `trade_audit_log` table is **immutable and append-only**:

```sql
CREATE TABLE trade_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  org_id        TEXT,
  event_type    TEXT NOT NULL,
  order_id      TEXT,
  symbol        TEXT,
  side          TEXT,
  qty           NUMERIC,
  price         NUMERIC,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No UPDATE or DELETE permissions — INSERT and SELECT only
REVOKE UPDATE, DELETE ON trade_audit_log FROM PUBLIC;
```

### Implementation Modules

| Module | Purpose |
|--------|---------|
| `src/lib/audit-logger.js` | `logAuditEvent(eventType, data)` — writes to `trade_audit_log` |
| `src/lib/fill-poller.js` | Polls Alpaca for fill updates and logs `ORDER_FILLED` events |

### Fill Poller

The `fill-poller.js` module periodically checks Alpaca for order fill status:

1. Queries Alpaca for recent order activities
2. Compares against known submitted orders
3. Logs `ORDER_FILLED` events to `trade_audit_log`
4. Updates campaign trade statuses if applicable

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/compliance/audit-log` | `GET` | Query audit log with filters |
| `/api/compliance/audit-log/export` | `GET` | Export audit log as CSV |
| `/api/fills/poll` | `POST` | Trigger fill poll manually |

### UI Component

`src/components/operational/AuditLogViewer.jsx` — Filterable, paginated audit log viewer with export capability.

---

## 13. Reconciliation Engine

### Overview (P3-5C)

The Reconciliation Engine compares **expected vs actual** trade outcomes to detect discrepancies. It acts as a safety net after trade execution to catch missing fills, phantom fills, price discrepancies, and stale orders.

### Architecture

```
Reconciliation Trigger → reconciliation.js → Compare expected vs actual
                                               ↓
                                    Discrepancies found?
                                      Yes → Log + Auto-halt if threshold exceeded
                                      No  → Log clean reconciliation
```

### Discrepancy Types

| Type | Description | Detection Method |
|------|-------------|-----------------|
| `missing_fill` | Expected fill not received | Order submitted but no fill after stale threshold |
| `phantom_fill` | Fill received for unknown order | Fill references unknown order_id |
| `price_discrepancy` | Fill price differs from expected | Actual price vs expected price > tolerance |
| `quantity_mismatch` | Fill quantity differs from submitted | Actual qty != submitted qty |
| `stale_order` | Order open beyond threshold | `now() - submitted_at > stale_minutes` |

### Configuration

| Parameter | Default | Env Var | Description |
|-----------|---------|---------|-------------|
| Price tolerance | 0.5% (50 bps) | `RECONCILIATION_PRICE_TOLERANCE_PCT` | Max allowed price deviation |
| Stale threshold | 30 minutes | `RECONCILIATION_STALE_MINUTES` | Time before order is considered stale |
| Auto-halt threshold | 3 discrepancies | `RECONCILIATION_DISCREPANCY_HALT_THRESHOLD` | Triggers trading halt when exceeded |

### Auto-Halt Behavior

When discrepancy count exceeds the configured threshold:

1. A `global` trading halt is created
2. `CIRCUIT_BREAKER_TRIGGERED` audit event is logged
3. All pending orders are frozen
4. Admin must deactivate the halt via `/api/circuit-breakers/halts/deactivate`

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/reconciliation/run` | `POST` | Run reconciliation manually |
| `/api/reconciliation/auto` | `POST` | Auto-reconciliation (cron-triggered) |
| `/api/reconciliation/history` | `GET` | View past reconciliation runs |

### Database Table

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `reconciliation_results` | Expected vs actual comparison results | id, clerk_user_id, org_id, run_type, discrepancy_count, discrepancies_json, status, run_at |

### Implementation Module

`src/lib/reconciliation.js` — `runReconciliation(options)`, `getReconciliationHistory(filters)`

### UI Component

`src/components/operational/ReconciliationPanel.jsx` — Reconciliation run history, discrepancy details, and manual trigger.

---

## 14. Data Retention & GDPR Compliance

### Overview (P4-6C)

The Retention System manages data lifecycle with configurable retention policies per table, cold-storage archive tables, and GDPR Article 17 compliance for per-user data erasure.

### Retention Policies

| Table | Active Retention | Archive Retention | Archive Table |
|-------|-----------------|-------------------|---------------|
| `trade_audit_log` | 90 days | 365 days | `trade_audit_log_archive` |
| `rate_limit_violations` | 30 days | 90 days | `rate_limit_violations_archive` |
| `reconciliation_results` | 90 days | 365 days | `reconciliation_results_archive` |
| `portfolio_snapshots` | 365 days | 5 years | `portfolio_snapshots_archive` |

### Archive Process

1. Records past the active retention period are moved to the corresponding `_archive` table
2. Archive tables have the same schema as the source table
3. Archived data is read-only (no updates, no deletes except by admin)
4. After archive retention expires, records are permanently deleted

### pg_cron Job

`noble-retention-archive` runs daily at 3 AM UTC:

```
0 3 * * * → POST /api/retention
```

The `/api/retention` endpoint:
1. Identifies records past active retention
2. Moves them to archive tables
3. Deletes original records
4. Permanently deletes expired archive records
5. Logs the run

### GDPR Article 17 Erasure

Per-user data purge with full audit trail:

| Step | Action |
|------|--------|
| 1 | Request received via `/api/retention` with `{ action: 'gdpr_erase', clerk_user_id }` |
| 2 | All user-scoped data is deleted from active tables |
| 3 | All user data in archive tables is deleted |
| 4 | A record is inserted into `gdpr_erasure_log` |
| 5 | Erasure is irreversible and fully auditable |

### GDPR Erasure Log

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `gdpr_erasure_log` | GDPR Article 17 erasure requests and status | id, clerk_user_id, erasure_type, tables_affected, status, requested_at, completed_at |

### Implementation Module

`src/lib/retention.js` — `runRetentionPolicies()`, `gdprErase(clerkUserId)`, `getRetentionStatus()`

### API Route

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/retention` | `GET` | View retention policy status |
| `/api/retention` | `POST` | Run retention policies / GDPR erasure (admin) |

### UI Component

`src/components/operational/RetentionPanel.jsx` — Retention policy dashboard, archive stats, GDPR erasure log viewer.

---

## 15. Multi-Tenant Isolation

### Overview (P4-6D)

Multi-tenant isolation uses a **defense-in-depth** approach: application-level `org_id` filtering as the primary mechanism, with Row Level Security (RLS) policies as a safety net for direct database access.

### org_id Column

13 user-scoped tables received a nullable `org_id` column in Migration 26:

1. `user_credentials`
2. `user_subscriptions`
3. `user_onboarding`
4. `trade_campaign`
5. `campaign_trades`
6. `trade_audit_log`
7. `portfolio_snapshots`
8. `notification_preferences`
9. `reconciliation_results`
10. `smoke_test_results`
11. `rate_limit_violations`
12. `ta_pnl_alert_threshold`
13. `org_credentials`

**Nullable for backward compatibility** — rows with `org_id = NULL` are accessible to all users (legacy behavior). Rows with a set `org_id` are restricted to users in that organization.

### Partial Indexes

Each `org_id` column has a partial index for query performance:

```sql
CREATE INDEX idx_{table}_org_id ON {table} (org_id) WHERE org_id IS NOT NULL;
```

### RLS Policies

RLS policies enforce org-level isolation for direct DB access:

```sql
-- Example policy: users can only see rows for their org or org-less rows
CREATE POLICY org_isolation ON {table}
  FOR SELECT USING (
    org_id IS NULL
    OR org_id = current_setting('request.jwt.claims')::json->>'org_id'
  );
```

The **service role key** bypasses RLS, so application-level filtering is the primary enforcement mechanism.

### org-scope.js Utility

`src/lib/org-scope.js` provides two helper functions:

```javascript
// Adds org_id filter to Supabase queries
orgScope(supabase, orgId)
// Returns: supabase client with org_id filter applied

// Returns org_id payload for inserts/updates
orgPayload(orgId)
// Returns: { org_id: orgId } or {} if no org
```

### Application-Level Filtering

All BFF routes that query user-scoped tables should apply org_id filtering:

```javascript
import { orgScope, orgPayload } from '@/lib/org-scope';

// Query with org scope
const { data } = await orgScope(supabase, userOrgId)
  .from('trade_campaign')
  .select('*');

// Insert with org payload
const { data } = await supabase
  .from('trade_campaign')
  .insert({ ...campaignData, ...orgPayload(userOrgId) });
```

### Institutional Plan Requirement

Multi-tenant features require an **Institutional** plan. The `PlanGate` component enforces this:

```jsx
<PlanGate require="institutional">
  <OrgSettings />
</PlanGate>
```

---

## 16. Broker Abstraction

### Overview (P2)

The Broker Abstraction layer decouples trading logic from broker-specific implementation. Currently supports Alpaca as the primary broker, with the architecture designed for future broker integrations.

### Architecture

```
Trading Logic → brokers/broker-factory.js → IBrokerAdapter implementation
                                                  ↓
                                          brokers/alpaca-adapter.js
                                                  ↓
                                          Alpaca Markets API
```

### IBrokerAdapter Interface

Defined in `src/lib/brokers/index.js`:

```javascript
class IBrokerAdapter {
  async getAccount()           // Account info (balance, status)
  async getPositions()         // Open positions
  async placeOrder(order)      // Submit order
  async cancelOrder(orderId)   // Cancel order
  async getOrder(orderId)      // Order status
  async getOrders(filters)     // Order history
  async getActivities(filters) // Account activities
  async getPortfolioHistory()  // Portfolio equity curve
  async getQuote(symbol)       // Current quote
}
```

### Alpaca Adapter

`src/lib/brokers/alpaca-adapter.js` implements `IBrokerAdapter` for Alpaca Markets:

- Uses `alpaca-client.js` for API communication
- Supports paper and live trading
- Handles credential resolution from Supabase / Clerk / env vars
- Implements retry with exponential backoff for transient failures

### Broker Factory

`src/lib/brokers/broker-factory.js` provides broker instantiation:

```javascript
import { createBroker } from '@/lib/brokers/broker-factory';

// Default: creates Alpaca adapter with resolved credentials
const broker = await createBroker({ type: 'paper', userId });

// Custom: pass explicit credentials
const broker = createBroker({ type: 'live', apiKey, secretKey });
```

### BFF Route

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/broker/[action]` | `GET/POST` | Proxy to broker adapter (action = account, positions, orders, etc.) |

### Adding a New Broker

1. Create `src/lib/brokers/{broker}-adapter.js` implementing `IBrokerAdapter`
2. Register in `broker-factory.js`
3. Add credential type in `user_credentials.credential_type`
4. Add UI for credential setup

---

## 17. Smoke Test System

### Overview (P3-5E)

The Smoke Test is an E2E paper trading lifecycle test that validates the entire trade execution pipeline from signal to cleanup. It uses paper trading to verify the system works end-to-end without risking real capital.

### Test Steps (6)

| Step | Action | Verification |
|------|--------|-------------|
| 1. Signal | Generate trade signal | Signal received with valid symbol, side, qty |
| 2. Order | Submit paper order | Order accepted by Alpaca, order_id returned |
| 3. Fill | Wait for fill | Fill confirmed with price and quantity |
| 4. P&L | Check P&L update | Position shows in portfolio with correct P&L |
| 5. Close | Close the position | Position closed, realized P&L recorded |
| 6. Cleanup | Remove test artifacts | All test orders, positions, and audit records cleaned up |

### Execution

```bash
# Via API
POST /api/smoke-test

# Via operational page (UI)
OperationalPage → SmokeTestPanel → "Run Smoke Test"
```

### Results Storage

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `smoke_test_results` | E2E test results | id, clerk_user_id, steps_json, passed, error_message, duration_ms, run_at |

### Implementation Module

`src/lib/smoke-test.js` — `runSmokeTest()`, `getSmokeTestHistory()`

### UI Component

`src/components/operational/SmokeTestPanel.jsx` — Run button, step-by-step progress, pass/fail indicator, error details.

---

## 18. API Routes Reference

**Note**: All BFF routes wrapped with `withAuth()` include rate limiting ON BY DEFAULT (opt-out with `skipRateLimit: true`). All `/api/renko/*` BFF routes forward the Clerk JWT to the FastAPI backend. The backend enforces role-based access:
- Read endpoints (state, stats, bricks, etc.): any authenticated role
- Write endpoints (tick, backtest, regime, equity): requires `admin` or `trader` role
- Admin endpoints (config, reset, circuit breakers): requires `admin` role

### Alerts & Notifications

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/alerts` | `GET` | Alert history | Clerk |
| `/api/notifications/preferences` | `GET` | Get notification preferences | Clerk |
| `/api/notifications/preferences` | `PUT` | Update notification preferences | Clerk |

### Alpaca Proxy

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/alpaca/account` | `GET` | Alpaca account info | Clerk |
| `/api/alpaca/activities` | `GET` | Account activities | Clerk |
| `/api/alpaca/orders` | `GET` | Order list | Clerk |
| `/api/alpaca/orders/create` | `POST` | Create order | Clerk (trader+) |
| `/api/alpaca/portfolio/history` | `GET` | Portfolio equity curve | Clerk |
| `/api/alpaca/positions` | `GET` | Open positions | Clerk |

### Analysis

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/analyse` | `POST` | Full analysis pipeline | Clerk |
| `/api/commentary` | `POST` | AI market commentary | Clerk |
| `/api/observation/build` | `POST` | 24-feature observation vector | Clerk |

### Authentication

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/auth/clerk-config` | `GET` | Clerk publishable key config | **Public** |
| `/api/auth/clerk-me` | `GET` | Current Clerk user info | Clerk |
| `/api/auth/clerk-token` | `GET` | Get Clerk JWT | Clerk |
| `/api/auth/clerk-verify` | `POST` | Verify Clerk session | Clerk |
| `/api/auth/fastapi-token` | `GET` | Get FastAPI auth token | Clerk |
| `/api/auth/jwt-test` | `GET` | JWT test endpoint | Clerk |
| `/api/auth/role` | `GET/PUT` | Get/set user role | Clerk |

### Backtest

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/backtest/compare` | `POST` | Compare backtest results | Clerk |
| `/api/backtest/detail/[id]` | `GET` | Backtest detail | Clerk |
| `/api/backtest/export` | `GET` | Export backtest data | Clerk |
| `/api/backtest/history` | `GET` | Backtest history list | Clerk |
| `/api/backtest/optimize` | `POST` | Backtest optimization | Clerk (trader+) |
| `/api/backtest/run` | `POST` | Run backtest | Clerk (trader+) |

### Broker

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/broker/[action]` | `GET/POST` | Broker adapter proxy | Clerk |

### Campaign

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/campaign` | `POST` | Create campaign (draft) | Clerk |
| `/api/campaign` | `GET` | List user's campaigns | Clerk |
| `/api/campaign/[id]` | `GET` | Get campaign details + trades | Clerk |
| `/api/campaign/[id]` | `PATCH` | Start/pause/resume/stop campaign | Clerk |
| `/api/campaign/[id]` | `DELETE` | Delete draft campaign | Clerk |
| `/api/campaign/tick` | `POST` | Campaign orchestrator tick | CRON_SECRET or dev |
| `/api/campaign/tick` | `GET` | Same as POST (testing) | CRON_SECRET or dev |

### Circuit Breakers

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/circuit-breakers` | `GET` | List all breakers and state | Clerk (admin) |
| `/api/circuit-breakers/check` | `POST` | Pre-trade check | Internal |
| `/api/circuit-breakers/halts` | `GET` | List active trading halts | Clerk (admin) |
| `/api/circuit-breakers/halts/deactivate` | `POST` | Deactivate a halt | Clerk (admin) |

### Clerk Credential Proxy

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/clerk/alpaca-keys` | `GET/POST` | Clerk metadata keys (legacy) | Clerk |
| `/api/clerk/alpaca-keys-status` | `GET` | Key status check | Clerk |

### Compliance

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/compliance/audit-log` | `GET` | Query audit log | Clerk (admin) |
| `/api/compliance/audit-log/export` | `GET` | Export audit log as CSV | Clerk (admin) |
| `/api/compliance/journal` | `GET/POST` | Trading journal | Clerk |
| `/api/compliance/report` | `GET` | Compliance report | Clerk (admin) |

### Correlation

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/correlation/detect` | `POST` | Cross-asset correlation | Clerk |

### Credentials

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/credentials/[type]` | `GET` | Check if credentials exist | Clerk |
| `/api/credentials/[type]` | `POST` | Save credentials (encrypted) | Clerk |
| `/api/credentials/[type]` | `DELETE` | Delete credentials | Clerk |

### Evolution

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/evolution/summary` | `GET` | Evolution state summary | Clerk |
| `/api/evolution/variants` | `GET/POST` | List/create variants | Clerk |
| `/api/evolution/feedback` | `POST` | Record feedback | Clerk / Internal |
| `/api/evolution/ab-test` | `GET/POST/DELETE` | A/B test management | Clerk (trader+) |
| `/api/evolution/optimize` | `POST` | Optuna optimization | CRON_SECRET |
| `/api/evolution/performance` | `GET` | Performance records | Clerk |
| `/api/evolution/rotate` | `POST` | Strategy rotation check | CRON_SECRET |

### Fills

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/fills/poll` | `POST` | Trigger fill poll manually | Clerk (trader+) |
| `/api/googl-fill` | `POST` | Test fill endpoint (debug) | Clerk (admin) |

### Health

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/health` | `GET` | Backend health check | **Public** |
| `/api/health/cron` | `GET` | Cron health status | **Public** |
| `/api/health/detailed` | `GET` | Detailed system health | Clerk (admin) |

### Onboarding

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/onboarding` | `GET/POST/PUT` | Onboarding status and updates | Clerk |

### Operational

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/operational/[action]` | `GET/POST` | Operational dashboard actions | Clerk (admin) |
| `/api/operational/rate-limit-violations` | `GET` | Rate limit violation history | Clerk (admin) |

### Optimization

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/optimise/full` | `POST` | Full optimization pipeline | Clerk (trader+) |

### P&L

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/pnl/alerts` | `GET` | P&L alert list | Clerk |
| `/api/pnl/export` | `GET` | Export P&L data | Clerk |
| `/api/pnl/history` | `GET` | P&L history | Clerk |
| `/api/pnl/intraday` | `GET` | Intraday P&L | Clerk |

### Portfolio

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/portfolio` | `GET` | Portfolio data | Clerk |
| `/api/portfolio/correlation` | `GET` | Correlation matrix | Clerk |
| `/api/portfolio/optimizer` | `GET` | Portfolio optimization | Clerk (premium+) |
| `/api/portfolio/snapshot` | `GET` | Portfolio snapshots | Clerk |
| `/api/portfolio/snapshot/capture` | `POST` | Capture portfolio snapshot | CRON_SECRET |

### Prices

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/prices` | `POST` | Yahoo Finance prices | Clerk |

### Reconciliation

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/reconciliation/auto` | `POST` | Auto-reconciliation (cron) | CRON_SECRET |
| `/api/reconciliation/history` | `GET` | Reconciliation run history | Clerk (admin) |
| `/api/reconciliation/run` | `POST` | Manual reconciliation | Clerk (admin) |

### Renko

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/renko/[action]` | `GET/POST` | Generic Renko BFF proxy | Clerk |
| `/api/renko/backtest/compare` | `POST` | Compare backtest results | Clerk |
| `/api/renko/backtest/monte-carlo` | `POST` | Monte Carlo simulation | Clerk |
| `/api/renko/backtest/optimize` | `POST` | Backtest parameter optimization | Clerk (trader+) |
| `/api/renko/backtest/run` | `POST` | Run Renko backtest | Clerk (trader+) |
| `/api/renko/backtest/run/stream` | `POST` | Streamed backtest results | Clerk (trader+) |
| `/api/renko/backtest/walk-forward` | `POST` | Walk-forward analysis | Clerk |
| `/api/renko/orders` | `POST` | Place Renko-based order | Clerk (trader+) |
| `/api/renko/signal-alert` | `POST` | Signal alert notification | Clerk |
| `/api/renko/tick-stream` | `GET` | Tick stream endpoint | Clerk |
| `/api/renko/warmup` | `POST` | Pipeline warm-up | Clerk |

### Retention

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/retention` | `GET` | Retention policy status | Clerk (admin) |
| `/api/retention` | `POST` | Run retention / GDPR erase | CRON_SECRET / Admin |

### Risk

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/risk/dashboard` | `GET` | Risk dashboard data | Clerk |

### Simulation

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/simulate` | `POST` | Monte Carlo simulation | Clerk |

### Smoke Test

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/smoke-test` | `POST` | Run E2E smoke test | Clerk (admin) |

### Streaming

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/stream/latest-price` | `GET` | Latest cached price | Clerk |
| `/api/stream/pnl` | `GET` | Stream P&L updates | Clerk (premium+) |
| `/api/stream/seed` | `POST` | Seed stream data | Clerk |
| `/api/stream/session` | `GET` | Stream session info | Clerk |
| `/api/stream/sse` | `GET` | SSE price ticks | Clerk |
| `/api/stream/tick` | `POST` | Ingest price tick | Clerk |

### Subscription

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/subscription/request-upgrade` | `POST` | Request plan upgrade | Clerk |
| `/api/subscription/status` | `GET` | Subscription status | Clerk |
| `/api/subscription/webhook` | `POST` | Payment webhook (Helio) | **Public** |

### TDA

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/tda/alerts` | `GET` | TDA alerts | Clerk |
| `/api/tda/scan` | `POST` | TDA scan | CRON_SECRET |

### Telegram

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/telegram/chat-id` | `GET` | Get Telegram chat ID | Clerk |
| `/api/telegram/report` | `POST` | Send Telegram report | Clerk |

### Trading

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/trading/analyze` | `POST` | Trading analysis with active variant | Clerk (trader+) |
| `/api/trading/approve` | `POST` | Approve trade recommendation | Clerk (trader+) |
| `/api/trading/approve-all` | `POST` | Bulk approve recommendations | Clerk (trader+) |
| `/api/trading/execute` | `POST` | Execute via Alpaca | Clerk (trader+) |
| `/api/trading/ping` | `GET` | Trading service ping | Clerk |
| `/api/trading/recommendations` | `GET` | Recommendations list | Clerk |
| `/api/trading/schedule` | `POST/GET` | Scheduled orders | Clerk (trader+) |
| `/api/trading/schedule/execute` | `POST` | Execute scheduled order | CRON_SECRET |
| `/api/trading/status` | `GET` | Trade recommendations status | Clerk |
| `/api/trading/validate` | `POST` | Walk-forward validation | Clerk (trader+) |

---

## 19. UI Components

### Component Hierarchy

```
page.js (SPA with view switching)
├── Footer.jsx                       — Global footer
├── Navbar.jsx                       — Navigation bar with role/plan indicators
├── admin/
│   └── AdminPage.jsx                — Admin dashboard
├── analysis/
│   ├── CommentaryCard.jsx           — AI market commentary display
│   ├── ObservationFeatures.jsx      — 24-feature observation vector
│   ├── PriceChart.jsx               — Price charting
│   ├── RecommendationsCard.jsx      — Trade recommendations
│   ├── RegimeCard.jsx               — HMM regime detection card
│   └── RiskCard.jsx                 — Risk metrics display
├── auth/
│   └── ClerkAuthPanel.jsx           — Clerk sign-in/sign-up panel
├── campaign/
│   ├── BatchConfigModal.jsx         — Campaign configuration modal
│   ├── CampaignList.jsx             — Campaign list view
│   ├── CampaignPanel.jsx            — Campaign panel container
│   └── CampaignRunner.jsx           — Live campaign progress (5s polling)
├── dashboard/
│   ├── ComparisonTable.jsx          — Multi-symbol comparison
│   ├── Dashboard.jsx                — Main dashboard
│   ├── RegimeSummaryBanner.jsx      — Regime status banner
│   └── TickerCard.jsx               — Symbol ticker card
├── evolution/
│   └── EvolutionPanel.jsx           — Strategy evolution dashboard
├── onboarding/
│   └── OnboardingWizard.jsx         — 3-step guided setup
├── operational/
│   ├── AuditLogViewer.jsx           — Audit log viewer with filters
│   ├── CircuitBreakerPanel.jsx      — Circuit breaker admin
│   ├── ComplianceReport.jsx         — Compliance report viewer
│   ├── HistoricalEquityCurve.jsx    — Historical equity curve chart
│   ├── KillSwitchPanel.jsx          — Emergency kill switch
│   ├── LivePnLDashboard.jsx         — Real-time P&L dashboard
│   ├── ModeToggle.jsx               — Trading mode toggle (paper/live)
│   ├── OperationalPage.jsx          — Operational tools page
│   ├── RateLimitDashboard.jsx       — Rate limit monitoring
│   ├── ReconciliationPanel.jsx      — Reconciliation run panel
│   ├── RetentionPanel.jsx           — Retention policy dashboard
│   ├── SmokeTestPanel.jsx           — E2E smoke test runner
│   └── SystemHealthDashboard.jsx    — System health overview
├── orders/
│   ├── AccountSummary.jsx           — Account summary card
│   ├── AlpacaKeySetup.jsx           — Key setup (uses /api/credentials/paper)
│   ├── OpenPositions.jsx            — Open positions table
│   ├── OrderHistory.jsx             — Order history with filters
│   ├── OrderModal.jsx               — Order placement modal
│   ├── OrdersPage.jsx               — Order management page
│   ├── PortfolioAnalysis.jsx        — Portfolio analysis view
│   └── PortfolioAnalysisCard.jsx    — Portfolio analysis summary card
├── portfolio/
│   ├── CorrelationCard.jsx          — Correlation matrix card
│   ├── OptimizerCard.jsx            — Portfolio optimization card
│   ├── PortfolioOverview.jsx        — Portfolio overview
│   └── PortfolioPage.jsx            — Portfolio page container
├── renko/
│   ├── BacktestComparison.jsx       — Backtest A/B comparison
│   ├── BacktestPanel.jsx            — Backtest configuration panel
│   ├── BacktestResults.jsx          — Backtest results display
│   ├── BrickChart.jsx               — Renko brick chart visualization
│   ├── ConfigPanel.jsx              — Renko configuration
│   ├── ExecutionModelingPanel.jsx   — Execution modeling settings
│   ├── MonteCarloResults.jsx        — Monte Carlo simulation results
│   ├── NotificationCenter.jsx       — In-app notification center
│   ├── OrderTracker.jsx             — Order tracking component
│   ├── ParameterSweep.jsx           — Parameter sweep configuration
│   ├── RenkoPage.jsx                — Renko page container
│   ├── RiskDashboard.jsx            — Risk dashboard
│   ├── SignalsPanel.jsx             — Signal display panel
│   ├── StatisticalRigorPanel.jsx    — Statistical rigor metrics
│   ├── TradesPanel.jsx              — Trades list panel
│   └── WalkForwardResults.jsx       — Walk-forward analysis results
├── search/
│   ├── SearchPage.jsx               — Symbol search page
│   └── SearchResults.jsx            — Search results list
├── settings/
│   ├── CredentialCard.jsx           — "Your keys are encrypted..." card
│   ├── NotificationPreferences.jsx  — Notification channel config
│   ├── PlanCard.jsx                 — Subscription plan card
│   └── SettingsPage.jsx             — Settings page container
├── shared/
│   ├── AccessGate.jsx               — General access control
│   ├── EmptyState.jsx               — Empty state placeholder
│   ├── ErrorState.jsx               — Error state display
│   ├── GracefulError.jsx            — Polished error UI (full/compact)
│   ├── LoadingSkeleton.jsx          — Loading skeleton placeholder
│   ├── NotificationToast.jsx        — Toast notification component
│   ├── PlanGate.jsx                 — Plan-based access control
│   ├── RoleGate.jsx                 — Role-based access control
│   ├── ThemeSwitcher.jsx            — Light/dark theme toggle
│   └── TradingModeToggle.jsx        — Paper/live mode switch
├── simulation/
│   ├── PriceFanChart.jsx            — Price fan chart visualization
│   ├── SimulatePage.jsx             — Simulation page container
│   └── SimulationPanel.jsx          — Monte Carlo simulation panel
├── streaming/
│   ├── AlertHistory.jsx             — Streaming alert history
│   ├── LiveBadge.jsx                — Live connection indicator
│   └── StreamStatusPanel.jsx        — Stream connection status
└── trading/
    └── TradingWorkflow.jsx          — Full trading workflow component
```

### Component Count by Directory

| Directory | Count | Components |
|-----------|-------|-----------|
| `renko/` | 16 | BacktestComparison, BacktestPanel, BacktestResults, BrickChart, ConfigPanel, ExecutionModelingPanel, MonteCarloResults, NotificationCenter, OrderTracker, ParameterSweep, RenkoPage, RiskDashboard, SignalsPanel, StatisticalRigorPanel, TradesPanel, WalkForwardResults |
| `operational/` | 12 | AuditLogViewer, CircuitBreakerPanel, ComplianceReport, HistoricalEquityCurve, KillSwitchPanel, LivePnLDashboard, ModeToggle, OperationalPage, RateLimitDashboard, ReconciliationPanel, RetentionPanel, SmokeTestPanel, SystemHealthDashboard |
| `orders/` | 8 | AccountSummary, AlpacaKeySetup, OpenPositions, OrderHistory, OrderModal, OrdersPage, PortfolioAnalysis, PortfolioAnalysisCard |
| `shared/` | 10 | AccessGate, EmptyState, ErrorState, GracefulError, LoadingSkeleton, NotificationToast, PlanGate, RoleGate, ThemeSwitcher, TradingModeToggle |
| `analysis/` | 6 | CommentaryCard, ObservationFeatures, PriceChart, RecommendationsCard, RegimeCard, RiskCard |
| `campaign/` | 4 | BatchConfigModal, CampaignList, CampaignPanel, CampaignRunner |
| `dashboard/` | 4 | ComparisonTable, Dashboard, RegimeSummaryBanner, TickerCard |
| `settings/` | 4 | CredentialCard, NotificationPreferences, PlanCard, SettingsPage |
| `portfolio/` | 4 | CorrelationCard, OptimizerCard, PortfolioOverview, PortfolioPage |
| `search/` | 2 | SearchPage, SearchResults |
| `simulation/` | 3 | PriceFanChart, SimulatePage, SimulationPanel |
| `streaming/` | 3 | AlertHistory, LiveBadge, StreamStatusPanel |
| `admin/` | 1 | AdminPage |
| `auth/` | 1 | ClerkAuthPanel |
| `evolution/` | 1 | EvolutionPanel |
| `onboarding/` | 1 | OnboardingWizard |
| `trading/` | 1 | TradingWorkflow |
| root | 2 | Footer, Navbar |
| **Total** | **84** | |

### Key Component Details

#### CampaignRunner
Real-time campaign progress dashboard with:
- 5-second polling while campaign is running
- Win/loss stats, consecutive loss indicator
- P&L display, max drawdown tracker
- Pause/Resume/Stop controls
- Trade table with fill price, exit price, P&L per trade

#### BatchConfigModal
Campaign configuration modal with:
- Max trades slider (1-50)
- Max consecutive losses (1-10)
- Max drawdown % (1%-50%)
- Kelly fraction slider
- Position sizing mode selector
- Trade list preview from analysis signals
- Creates campaign via `POST /api/campaign`, starts via `PATCH /api/campaign/[id]`

#### OnboardingWizard (3 Steps)

| Step | Content |
|------|---------|
| 0 | Welcome + platform overview |
| 1 | Connect paper trading account (Alpaca keys via `/api/credentials/paper`) |
| 2 | Go Live (Premium CTA or live key setup) |

#### GracefulError
Polished error UI with two variants:
- **Full**: Icon + title + description + action button
- **Compact**: Inline error with icon and message

---

## 20. Library Modules Reference

All 34 library modules in `src/lib/`:

### Core Infrastructure

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `config.js` | ~50 | Application configuration constants and feature flags |
| `db.js` | ~30 | Database client factory (Supabase wrapper) |
| `redis.js` | ~80 | Upstash Redis client initialization and helper functions |
| `cache.js` | ~120 | L1 Redis caching layer with TTL support; graceful degradation when Redis unavailable |
| `utils.ts` | ~100 | Shared utility functions (formatting, math, date helpers) |

### Authentication & Authorization

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `withAuth.js` | ~200 | Route handler wrapper: Clerk auth check, role/plan gating, rate limiting, CRON_SECRET bypass |
| `fastapi-auth.js` | ~150 | JWT resolution cascade for BFF → FastAPI communication |
| `fastapi-client.js` | ~200 | HTTP client for FastAPI backend with retry, cold-start handling, timeout config |
| `clerk-metadata.js` | ~100 | Clerk user metadata access (role, plan, Alpaca keys from privateMetadata) |
| `org-scope.js` | ~60 | Multi-tenant org_id filtering utilities: `orgScope()`, `orgPayload()` |

### Encryption & Credentials

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `encryption.js` | ~180 | AES-256-GCM encryption with PBKDF2 key derivation, key versioning (V1-V10), auto re-encryption |
| `credentials.js` | ~200 | Credential resolution chain: Supabase → Clerk → env vars; save/get/delete with encryption |
| `alpaca-credentials.js` | ~80 | Alpaca-specific credential helpers |

### Trading & Broker

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `alpaca-client.js` | ~250 | Alpaca Markets API client (account, orders, positions, portfolio) |
| `brokers/index.js` | ~50 | `IBrokerAdapter` interface definition |
| `brokers/alpaca-adapter.js` | ~200 | Alpaca implementation of `IBrokerAdapter` |
| `brokers/broker-factory.js` | ~60 | Broker instantiation factory (`createBroker()`) |
| `trade-validation.js` | ~100 | Pre-trade validation logic (order type, qty, price sanity checks) |
| `order-tracker.js` | ~120 | Order lifecycle tracking and status management |

### Campaign & Strategy

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `campaign-engine.js` | ~400 | Campaign batch orchestration: create, start, tick, stop, feed results |
| `strategy-evolution.js` | ~350 | Strategy variant lifecycle: create, activate, A/B test, rotate, Optuna optimize |

### Risk & Compliance

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `circuit-breaker.js` | ~200 | 9 pre-trade risk breakers with configurable actions and cooldowns |
| `audit-logger.js` | ~150 | Immutable append-only audit trail logging to `trade_audit_log` |
| `fill-poller.js` | ~120 | Alpaca fill verification poller; logs `ORDER_FILLED` audit events |
| `reconciliation.js` | ~180 | Expected vs actual trade comparison; auto-halt on threshold breach |
| `rate-limiter.js` | ~200 | Redis-backed sliding window counter; 10 tiers, plan multipliers, 40+ path patterns |

### Data & Notifications

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `renko-client.js` | ~100 | Renko pipeline BFF client for FastAPI communication |
| `price-poll-coordinator.js` | ~80 | Coordinates price polling across symbols to avoid redundant requests |
| `yahoo-prices.js` | ~80 | Yahoo Finance price data fetcher |
| `symbol-utils.js` | ~60 | Symbol normalization (Yahoo → Alpaca mapping, FOREX handling) |
| `notifications.js` | ~150 | Discord webhook + Telegram notification dispatch |
| `alerting.js` | ~120 | Alert management: create, filter, dispatch to configured channels |
| `plans.js` | ~80 | Plan tier definitions and feature gating logic |

### Data Lifecycle

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `retention.js` | ~200 | Retention policy enforcement, archive migration, GDPR erasure |
| `smoke-test.js` | ~150 | E2E paper trading lifecycle test (signal → order → fill → P&L → close → cleanup) |

### Supabase Client Layer

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `supabase/client.js` | ~40 | Browser-safe Supabase client (anon key, RLS enforced) |
| `supabase/db.js` | ~60 | Server-side Supabase client factory with Prisma-compatible wrapper |
| `supabase/server.js` | ~50 | Server-side Supabase client (service role, bypasses RLS) |

### Error Handling

| Module | Lines (approx) | Description |
|--------|----------------|-------------|
| `error-messages.js` | ~120 | Error sanitization layer: pattern matching, error codes, UI display mapping |

**Total**: 34 modules, approximately 11,973 lines

---

## 21. pg_cron Jobs Reference

### Job Details

| Job | Schedule | Cron Expression | What It Does |
|-----|----------|----------------|-------------|
| `noble-campaign-tick` | Every minute during US market hours (Mon-Fri) | `* 13-20 * * 1-5` | Checks running campaigns, updates stats, places next trades |
| `noble-tda-scan` | Every 4 hours | `0 */4 * * *` | Runs TDA early warning scan |
| `noble-schedule-execute` | Every 15 min during market hours | `*/15 13-20 * * 1-5` | Executes scheduled orders |
| `noble-strategy-rotate` | Every 6 hours | `0 */6 * * *` | Checks if active strategy variant is underperforming, rotates if better one exists |
| `noble-strategy-optimize` | Daily at 10pm UTC, Mon-Fri | `0 22 * * 1-5` | Runs Optuna-style optimization for most traded symbol |
| `noble-portfolio-snapshot` | Daily at 8pm UTC | `0 20 * * *` | Captures portfolio state snapshot for equity curve |
| `noble-retention-archive` | Daily at 3am UTC | `0 3 * * *` | Runs retention policies: archive old data, expire archives, GDPR erasure |

### Market Hours

US market hours are **9:30 AM - 4:00 PM ET** which is **13:30 - 20:00 UTC** during standard time, or **13:00 - 19:30 UTC** during daylight saving time. The cron expressions use the 13-20 UTC range for simplicity.

### Architecture Decision: Why pg_cron + pg_net + Vault?

The user explicitly chose Supabase cron + functions over Vercel because:
1. **Vercel serverless functions have a 60-second timeout** on Hobby plan, 300s on Pro
2. **Vercel cron is limited** — only 1 cron job per deployment on Hobby, 2 on Pro
3. **pg_cron runs in the database** — no timeout, survives browser disconnects and server restarts
4. **pg_net makes HTTP requests from SQL** — fires POST to API routes
5. **State is persisted in DB** — the orchestrator is stateless; even if the API route crashes, the next tick picks up where it left off
6. **Vault stores secrets securely** — no GUC variables needed; Supabase hosted plans don't support custom GUCs anyway

---

## 22. Deployment

### Infrastructure

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | `noble-trader-agent-frontend.vercel.app` |
| Backend | Render | `noble-trader-fastapi-backend.onrender.com` |
| Database | Supabase | `pcvscowltlrxzgxjurcr.supabase.co` |
| Cache | Upstash Redis | `stunning-kodiak-73925.upstash.io` |
| Auth | Clerk | `large-shark-21.clerk.accounts.dev` |
| Payments | Helio | (webhook placeholder, not fully integrated) |

### GitHub Repos

| Repo | Purpose |
|------|---------|
| `lexingtontechus/noble-trader-agent-frontend` | Frontend + BFF API routes |
| `0x596173736972/MarketRegimeTrader` | FastAPI backend |

### Deployment Runbook

For detailed deployment procedures, see `docs/DEPLOYMENT-RUNBOOK.md` (current as of P4-6E).

### Deployment Script

`deploy-renko.sh` pushes both repos with the GitHub PAT:

```bash
# Pattern: cd /path && git add . && git commit && git push
```

### Render Cold Start Handling

The FastAPI backend on Render spins down after inactivity. The BFF client (`fastapi-client.js`) handles this with:
- **Retry with exponential backoff** (up to 3 retries)
- **HTML response detection** (Render returns HTML splash while spinning up)
- **Configurable timeout** (120s default for backtests)

### Redis Cache Keys

| Pattern | TTL | Purpose |
|---------|-----|---------|
| `renko:snapshot:{symbol}:{brickSize}` | 4 hours | Renko pipeline warm-up snapshots |
| `renko:price:{symbol}` | 15 seconds | Latest cached price |
| `renko:regime:{symbol}` | 5 minutes | HMM regime detection result |
| `renko:backtest:{symbol}:{hash}` | 1 hour | Backtest result cache |
| `ratelimit:{tier}:{userId}` | 60 seconds | Rate limit sliding window counter |

Redis gracefully degrades when unavailable — all reads fall through to the data source, all writes are silently skipped.

---

## 23. Project Rules

1. **Always use Supabase** for database — NO Prisma
2. **Clerk `private.metadata`** stores Alpaca keys (being migrated to Supabase encrypted storage)
3. **Do NOT delete** `proxy.js` — it's Clerk middleware for NextJS v16
4. **Do NOT delete** `.env.local` — contains all API keys
5. **Yahoo Finance != Alpaca symbols** — Alpaca does NOT support FOREX or GOLD; use `symbol-utils.js` for mapping
6. **JS/JSX for components/pages** — TypeScript only for API routes
7. **Use `cd /path && command`** pattern in Bash
8. **All generated files** must be saved to `/home/z/my-project/download/`
9. **File operations** restricted to `/home/z/my-project/` directory
10. **Never expose PII in logs** — IP addresses must be hashed (SHA-256 + pepper); no raw API keys, tokens, or personal data in log output
11. **Always use `withAuth` for API routes** — All BFF route handlers must use `withAuth()` wrapper; never implement custom auth checks
12. **Rate limiting is ON by default** — Rate limiting is enforced on all `withAuth()`-wrapped routes; opt out only with `skipRateLimit: true` when there is a documented reason
13. **Circuit breakers before execution** — All trade executions must pass through `circuit-breaker.js` pre-trade checks before reaching the broker
14. **Audit every trade event** — All trade lifecycle events must be logged to `trade_audit_log` via `audit-logger.js`
15. **Encryption key rotation** — When adding a new encryption key version, update `SUPABASE_ENCRYPTION_ACTIVE_VERSION` and verify auto re-encryption works

---

## Quick Reference: Key Values

### Supabase

| Item | Value |
|------|-------|
| Project ID | `pcvscowltlrxzgxjurcr` |
| URL | `https://pcvscowltlrxzgxjurcr.supabase.co` |
| Anon/Publishable Key | `sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa` |
| Service Role Key | *(set in Vercel env vars)* |
| Encryption Key (V1) | *(see SUPABASE_ENCRYPTION_KEY env var)* |
| Encryption Key (V2) | *(see SUPABASE_ENCRYPTION_KEY_V2 env var)* |
| Direct DB | `postgresql://postgres:<PASSWORD>@pcvscowltlrxzgxjurcr.supabase.co:5432/postgres` |
| Pooler DB | `postgresql://postgres.pcvscowltlrxzgxjurcr:<PASSWORD>@aws-0-us-west-1.pooler.supabase.com:6543/postgres` |

### Clerk

| Item | Value |
|------|-------|
| Instance | `large-shark-21.clerk.accounts.dev` |
| JWT Template | `server` (injects email, first_name, last_name, username, role) |
| Default Role | `viewer` |

### Upstash Redis

| Item | Value |
|------|-------|
| REST URL | `https://stunning-kodiak-73925.upstash.io` |
| Connection | `redis://default:<TOKEN>@stunning-kodiak-73925.upstash.io:6379` |
| Use Cases | L1 cache, rate limiting sliding window |

### GitHub

| Item | Value |
|------|-------|
| Org | `lexingtontechus/` |
| PAT | *(stored locally, not committed — set via environment or credential manager)* |
