# Noble Trader Agent — Complete Project Reference

> **Last Updated**: 2026-05-21  
> **Version**: v3.2  
> **Organization**: Lexington Tech LLC  
> **License**: MIT  

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
10. [API Routes Reference](#10-api-routes-reference)
11. [UI Components](#11-ui-components)
12. [pg_cron Jobs Reference](#12-pg_cron-jobs-reference)
13. [Deployment](#13-deployment)
14. [Project Rules](#14-project-rules)
15. [Known Issues & Pending Work](#15-known-issues--pending-work)

---

## 1. Architecture Overview

### Monorepo Structure

```
/home/z/my-project/
├── noble-trader-agent-frontend/    ← Next.js v16 frontend (PRIMARY)
│   ├── src/
│   │   ├── app/                    ← Pages & 30+ BFF API routes
│   │   ├── components/             ← 40+ UI components across 14 dirs
│   │   ├── hooks/                  ← React hooks (useRenkoStream, useRole, usePlan, etc.)
│   │   └── lib/                    ← 20+ library modules
│   ├── supabase/migrations/        ← 12 SQL migrations
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
                      ↘ Supabase (PostgreSQL + pg_cron)
                      ↘ Alpaca Markets API
                      ↘ Upstash Redis (L1 cache)
                      ↘ Discord / Telegram (notifications)
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Supabase over Prisma** | Prisma Engine binary has cold-start issues on Vercel serverless; Supabase JS client is serverless-native |
| **BFF pattern** | `proxy.js` (NOT middleware.ts) routes `/api/renko/*` → backend; BFF routes call `auth().getToken()` for Clerk JWT |
| **AES-256-GCM in app layer** | Application-layer encryption is safer and faster than pgcrypto; no dependency on DB-level settings |
| **pg_cron + pg_net + Vault** | Server-driven orchestration survives browser disconnects and server restarts; no Vercel limitations; Vault for secret storage (GUC not supported on Supabase hosted) |
| **JS/JSX for components** | TypeScript only for API routes (per project rules) |
| **DaisyUI** | Required UI framework for all components |

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

**Note**: The direct connection has a typo in the previously used string (the `db.` before the host is incorrect). The correct direct connection string is:

```
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

Used by: `credentials.js`, `campaign-engine.js`, API routes that need admin access

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
| Used for | Credential CRUD, campaign orchestration, admin ops | General data access (analysis runs, trade recommendations, etc.) |
| Env var prefix | No prefix (server-only) | `NEXT_PUBLIC_` (exposed to browser) |
| Auth mode | `autoRefreshToken: false, persistSession: false` | Same |

### Encryption Key

The `SUPABASE_ENCRYPTION_KEY` is used for AES-256-GCM encryption of Alpaca API keys in the application layer:

```
Key: *(see SUPABASE_ENCRYPTION_KEY env var)*
Algorithm: AES-256-GCM
Key derivation: Padded/truncated to 32 bytes (UTF-8)
IV: 16 bytes random per encryption
Auth tag: 16 bytes
Storage format: base64(iv + tag + ciphertext) as TEXT column
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
WHERE name IN ('noble-campaign-tick', 'noble-tda-scan', 'noble-schedule-execute')
ORDER BY start_time DESC LIMIT 10;
```

### Supabase Vault Secrets Reference

All cron jobs now use **two Vault secrets**:

| Vault Secret Name | Purpose | Example Value |
|-------------------|---------|---------------|
| `cron_secret` | Shared secret for authenticating cron → API requests | (same as Vercel `CRON_SECRET`) |
| `noble_base_url` | Base URL of the Vercel deployment | `https://noble-trader-agent-frontend.vercel.app` |

**The `campaign_tick()` function** constructs the full URL by appending `/api/campaign/tick` to `noble_base_url`.

**The inline cron schedules** (TDA scan, scheduled orders) also read from these same two Vault secrets.

### All pg_cron Jobs

| Job Name | Schedule | Vault Secrets | API Endpoint | Auth Method |
|----------|----------|---------------|-------------|-------------|
| `noble-campaign-tick` | `* 13-20 * * 1-5` (every minute during market hours) | `cron_secret`, `noble_base_url` | `POST /api/campaign/tick` | `Authorization: Bearer <secret>` |
| `noble-tda-scan` | `0 */4 * * *` (every 4 hours) | `cron_secret`, `noble_base_url` | `POST /api/tda/scan` | `x-cron-secret` header + `?secret=` param |
| `noble-schedule-execute` | `*/15 13-20 * * 1-5` (every 15 min during market hours) | `cron_secret`, `noble_base_url` | `POST /api/trading/schedule/execute` | `x-cron-secret` header + `?secret=` param |
| `noble-strategy-rotate` | `0 */6 * * *` (every 6 hours) | `cron_secret`, `noble_base_url` | `POST /api/evolution/rotate` | `x-cron-secret` header + `?secret=` param |
| `noble-strategy-optimize` | `0 22 * * 1-5` (daily 10pm UTC) | `cron_secret`, `noble_base_url` | `POST /api/evolution/optimize` | `x-cron-secret` header + `?secret=` param |

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
| `SUPABASE_ENCRYPTION_KEY` | AES-256-GCM key for credential encryption | `*(see SUPABASE_ENCRYPTION_KEY env var)*` |
| `CRON_SECRET` | Shared secret for pg_cron → API route auth | Generate with `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://stunning-kodiak-73925.upstash.io` |
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

### Server-Only Variables (NEVER expose to browser)

These must **NOT** have the `NEXT_PUBLIC_` prefix:

- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ENCRYPTION_KEY`
- `CRON_SECRET`
- `ALPACA_PAPER_API_KEY`
- `ALPACA_PAPER_SECRET_KEY`
- `FASTAPI_USER`
- `FASTAPI_PASSWORD`
- `FASTAPI_API_KEY`

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
- `CRON_SECRET`

---

## 5. Database Schema

### Complete Table Reference

#### Core Analysis Tables (ta_ prefix)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_analysis_run` | Analysis pipeline run records | id, symbol, regime, strategy, status |
| `ta_trade_recommendation` | Trade recommendations with full context | id, symbol, side, regime, strategy, sizing, risk |
| `ta_scheduled_order` | Scheduled order execution | id, symbol, side, qty, execute_at, status |
| `ta_telegram_notification` | Notification store (all alert types) | id, type, channel, message |
| `ta_tda_scan_result` | Topological Data Analysis results | id, symbol, features, score |
| `ta_early_warning_alert` | TDA early warning alerts | id, symbol, alert_type, severity |

#### Strategy Evolution Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_strategy_variant` | Strategy parameter sets | id, name, generation, is_active, is_default, scores |
| `ta_strategy_performance` | Per-variant trade performance | id, variant_id, symbol, pnl_pct, source |
| `ta_ab_test` | A/B test assignments | id, variant_a_id, variant_b_id, status, winner_id |
| `ta_evolution_log` | Strategy parameter change history | id, from_variant_id, to_variant_id, trigger_type |

#### Renko & Backtest Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ta_renko_snapshot` | Renko pipeline warm-up snapshots | id, symbol, brick_size, snapshot_data |
| `ta_backtest_result` | Saved backtest results | id, symbol, equity_curve, trade_log, 30+ metrics |

#### User Management Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_credentials` | AES-256-GCM encrypted Alpaca API keys | id, clerk_user_id, credential_type, api_key_encrypted, secret_key_encrypted |
| `user_subscriptions` | Plan state (free/premium/institutional) | id, clerk_user_id, plan, plan_status, helio_subscription_id |
| `user_onboarding` | Onboarding progress tracking | id, clerk_user_id, onboarding_complete, current_step |

#### Campaign Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trade_campaign` | Batch trade orchestration with risk guards | id, clerk_user_id, status, max_trades, max_consecutive_losses, max_drawdown_pct |
| `campaign_trades` | Individual trades within a campaign | id, campaign_id, trade_index, symbol, side, qty, status, realized_pnl |

### RLS (Row Level Security) Summary

All user-scoped tables have RLS enabled with policies:

| Table | User Access | Service Role |
|-------|-------------|-------------|
| `user_credentials` | Own records only (CRUD) | Full access (bypasses RLS) |
| `user_subscriptions` | Read own only | Full access |
| `user_onboarding` | Read, insert, update own | Full access |
| `trade_campaign` | Own records only (CRUD) | Full access |
| `campaign_trades` | Own campaign trades (via parent) | Full access |

RLS policies use `auth.jwt() ->> 'sub'` to match `clerk_user_id`. The service role key bypasses all RLS policies.

### Helper Functions

| Function | Purpose |
|----------|---------|
| `set_updated_at()` | Auto-set `updated_at = now()` on every row update (trigger) |
| `campaign_tick()` | pg_cron callback: fires HTTP POST to the campaign tick API route |

### Migration Order

Run migrations in this order:

```
00000000000001_create_tables.sql
00000000000002_strategy_evolution.sql
00000000000003_evolution_cron.sql
00000000000004_scheduled_orders.sql
00000000000005_scheduled_orders_cron.sql
00000000000006_renko_snapshot.sql
00000000000007_backtest_results.sql
00000000000008_backtest_cost_columns.sql
001_user_credentials_subscriptions.sql
009_trade_campaign.sql
20260511_cron_jobs.sql
010_cron_vault_secrets.sql   ← Migrates GUC → Vault for all cron secrets
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

1. **Clerk** handles user authentication (sign-up, sign-in, session management)
2. **Clerk JWT** is obtained via REST API with "server" template, then forwarded to FastAPI backend via BFF routes
3. **Supabase RLS** uses `auth.jwt() ->> 'sub'` for user-scoped data access
4. **Service role key** bypasses RLS for server-side operations (credential CRUD, campaign orchestration)

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
- **Claims**: `{"email": "{{user.primary_email_address}}", "first_name": "{{user.first_name}}", "last_name": "{{user.last_name}}", "username": "{{user.username}}", "role": "{{user.private_metadata.role}}"}`

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

### Credential Encryption

Alpaca API keys are encrypted with **AES-256-GCM** in the application layer before storage:

```
Plain text → AES-256-GCM encrypt (random IV + key) → base64(iv + tag + ciphertext) → TEXT column
```

**Encryption process:**
1. Generate 16-byte random IV
2. Encrypt with AES-256-GCM using `SUPABASE_ENCRYPTION_KEY` (padded/truncated to 32 bytes)
3. Get 16-byte authentication tag
4. Combine: `iv (16 bytes) + tag (16 bytes) + ciphertext`
5. Base64 encode the combined buffer
6. Store as TEXT in `api_key_encrypted` / `secret_key_encrypted` columns

**Decryption process** (reverse):
1. Base64 decode → combined buffer
2. Extract: `iv (first 16 bytes) + tag (next 16 bytes) + ciphertext (remainder)`
3. Decrypt with AES-256-GCM, verify auth tag
4. Return plain text

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

**Important**: Live credentials can only be saved by Premium or Institutional users. The `saveCredentials()` function gates this.

### Clerk UserButton → Settings Page

Settings page is accessible from the Clerk `UserButton` menu. This is where users manage API keys, view subscription status, etc.

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

1. **Env var leaks** (most critical): Matches `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ENCRYPTION_KEY`, etc.
2. **Missing keys**: Matches `Missing.*KEY`, `Missing.*URL`
3. **Alpaca credential errors**: Matches `Alpaca API keys not configured`, `invalid.*api.*key`
4. **Auth errors**: Matches `not authenticated`, `unauthorized`, `clerk.*session`
5. **Plan gating**: Matches `requires a (Premium|Institutional) plan`
6. **Connection errors**: Matches `ECONNREFUSED`, `ETIMEDOUT`, `fetch failed`
7. **Rate limiting**: Matches `rate limit`, `429`
8. **DB/Supabase errors**: Matches `supabase`, `pgcrypto`, `PGRST`

**Any unmatched error** gets a generic context-specific message (never the raw error text).

### GracefulError Component

The `<GracefulError>` component (`src/components/shared/GracefulError.jsx`) renders polished error UI:

- **Full variant**: Icon + title + description + action button
- **Compact variant**: Inline error with icon and message
- **Contextual icons**: Different icons per error code
- **Action buttons**: "Set Up Keys", "Sign In", "Retry", "Upgrade"

---

## 10. API Routes Reference

**Note**: All `/api/renko/*` BFF routes forward the Clerk JWT to the FastAPI backend. The backend enforces role-based access:
- Read endpoints (state, stats, bricks, etc.): any authenticated role
- Write endpoints (tick, backtest, regime, equity): requires `admin` or `trader` role
- Admin endpoints (config, reset): requires `admin` role

### Campaign Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/campaign` | `POST` | Create campaign (draft) | Clerk |
| `/api/campaign` | `GET` | List user's campaigns | Clerk |
| `/api/campaign/[id]` | `GET` | Get campaign details + trades | Clerk |
| `/api/campaign/[id]` | `PATCH` | Start/pause/resume/stop campaign | Clerk |
| `/api/campaign/[id]` | `DELETE` | Delete draft campaign | Clerk |
| `/api/campaign/tick` | `POST` | Campaign orchestrator tick | CRON_SECRET or dev |
| `/api/campaign/tick` | `GET` | Same as POST (testing) | CRON_SECRET or dev |

### Trading Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trading/analyze` | `POST` | Trading analysis with active variant |
| `/api/trading/validate` | `POST` | Walk-forward validation |
| `/api/trading/approve` | `POST` | Approve trade recommendation |
| `/api/trading/approve-all` | `POST` | Bulk approve |
| `/api/trading/execute` | `POST` | Execute via Alpaca |
| `/api/trading/status` | `GET` | Trade recommendations status |
| `/api/trading/recommendations` | `GET` | Recommendations list |
| `/api/trading/schedule` | `POST/GET` | Scheduled orders |
| `/api/trading/schedule/execute` | `POST` | Execute scheduled order |

### Credential Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/credentials/[type]` | `GET` | Check if credentials exist |
| `/api/credentials/[type]` | `POST` | Save credentials (encrypted) |
| `/api/credentials/[type]` | `DELETE` | Delete credentials |
| `/api/clerk/alpaca-keys` | `GET/POST` | Clerk metadata keys (legacy) |
| `/api/clerk/alpaca-keys-status` | `GET` | Key status check |

### Evolution Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/evolution/summary` | `GET` | Evolution state summary |
| `/api/evolution/variants` | `GET/POST` | List/create variants |
| `/api/evolution/feedback` | `POST` | Record feedback |
| `/api/evolution/ab-test` | `GET/POST/DELETE` | A/B test management |
| `/api/evolution/optimize` | `POST` | Optuna optimization |
| `/api/evolution/performance` | `GET` | Performance records |

### Other Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/analyse` | `POST` | Full analysis pipeline |
| `/api/observation/build` | `POST` | 24-feature observation vector |
| `/api/commentary` | `POST` | AI market commentary |
| `/api/prices` | `POST` | Yahoo Finance prices |
| `/api/health` | `GET` | Backend health check |
| `/api/stream/sse` | `GET` | SSE price ticks |
| `/api/portfolio` | `GET` | Portfolio data |
| `/api/portfolio/correlation` | `GET` | Correlation matrix |
| `/api/portfolio/optimizer` | `GET` | Portfolio optimization |
| `/api/onboarding` | `GET/POST/PUT` | Onboarding status |
| `/api/subscription/status` | `GET` | Subscription status |
| `/api/subscription/webhook` | `POST` | Payment webhook (Helio) |
| `/api/correlation/detect` | `POST` | Cross-asset correlation |
| `/api/tda/scan` | `POST` | TDA scan |
| `/api/tda/alerts` | `GET` | TDA alerts |
| `/api/alerts` | `GET` | Alert history |
| `/api/simulate` | `POST` | Monte Carlo simulation |

---

## 11. UI Components

### Key Component Hierarchy

```
page.js (SPA with view switching)
├── dashboard/
├── orders/
│   ├── OrdersPage.jsx         — Order management
│   ├── AlpacaKeySetup.jsx     — Key setup (uses /api/credentials/paper)
│   ├── OrderHistory.jsx       — Uses <GracefulError compact>
│   └── OpenPositions.jsx      — Uses <GracefulError compact>
├── campaign/
│   ├── CampaignRunner.jsx     — Live campaign progress (5s polling)
│   └── BatchConfigModal.jsx   — Campaign configuration
├── onboarding/
│   └── OnboardingWizard.jsx   — 3-step guided setup
├── settings/
│   └── CredentialCard.jsx     — "Your keys are encrypted..."
├── evolution/
├── renko/
├── analysis/
├── portfolio/
├── search/
├── simulation/
├── trading/
├── operational/
├── admin/
├── auth/
└── shared/
    └── GracefulError.jsx      — Polished error UI
```

### CampaignRunner Component

Real-time campaign progress dashboard with:
- 5-second polling while campaign is running
- Win/loss stats, consecutive loss indicator
- P&L display, max drawdown tracker
- Pause/Resume/Stop controls
- Trade table with fill price, exit price, P&L per trade

### BatchConfigModal Component

Campaign configuration modal with:
- Max trades slider (1-50)
- Max consecutive losses (1-10)
- Max drawdown % (1%-50%)
- Kelly fraction slider
- Position sizing mode selector
- Trade list preview from analysis signals
- Creates campaign via `POST /api/campaign`, starts via `PATCH /api/campaign/[id]`

### OnboardingWizard (3 Steps)

| Step | Content |
|------|---------|
| 0 | Welcome + platform overview |
| 1 | Connect paper trading account (Alpaca keys via `/api/credentials/paper`) |
| 2 | Go Live (Premium CTA or live key setup) |

---

## 12. pg_cron Jobs Reference

### Job Details

| Job | Schedule | Cron Expression | What It Does |
|-----|----------|----------------|-------------|
| `noble-campaign-tick` | Every minute during US market hours (Mon-Fri) | `* 13-20 * * 1-5` | Checks running campaigns, updates stats, places next trades |
| `noble-tda-scan` | Every 4 hours | `0 */4 * * *` | Runs TDA early warning scan |
| `noble-schedule-execute` | Every 15 min during market hours | `*/15 13-20 * * 1-5` | Executes scheduled orders |
| `noble-strategy-rotate` | Every 6 hours | `0 */6 * * *` | Checks if active strategy variant is underperforming, rotates if better one exists |
| `noble-strategy-optimize` | Daily at 10pm UTC, Mon-Fri | `0 22 * * 1-5` | Runs Optuna-style optimization for most traded symbol |

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

## 13. Deployment

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

---

## 14. Project Rules

1. **Always use DaisyUI** for all UX components
2. **Always use Supabase** for database — NO Prisma
3. **Clerk `private.metadata`** stores Alpaca keys (being migrated to Supabase)
4. **Do NOT delete** `proxy.js` — it's Clerk middleware for NextJS v16
5. **Do NOT delete** `.env.local` — contains all API keys
6. **Yahoo Finance != Alpaca symbols** — Alpaca does NOT support FOREX or GOLD
7. **JS/JSX for components/pages** — TypeScript only for API routes
8. **Use `cd /path && command`** pattern in Bash
9. **All generated files** must be saved to `/home/z/my-project/download/`
10. **File operations** restricted to `/home/z/my-project/` directory

---

## 15. Known Issues & Pending Work

### Recent Changes (v3.2 — 2026-05-21)

| Change | Details |
|--------|--------|
| JWT template system | `getClerkJWT()` tries "server" template first for enriched claims (email, name, role) |
| Backend enrichment fallback | `_enrich_from_clerk_api()` fills null claims via Clerk Backend API (5-min cache) |
| Auth wired to all 57 endpoints | SSE endpoints now require auth; renko write ops require admin/trader role |
| Role system unified | Default role is "viewer" everywhere; `useRole()` + `canAccess()` + server sync |
| RoleGate component | Loading state + `requireServerSync` prop for sensitive operations |
| Supabase Vault cron | All 5 cron jobs migrated from GUC to `vault.read_secret()` |

### Current Issues

| Issue | Status | Priority |
|-------|--------|----------|
| JWT auth errors from Clerk | Unresolved (deprioritized) | Medium |
| Helio SDK integration | Placeholder webhook only | High |
| No Supabase Edge Functions directory | `supabase/functions/` does not exist | Medium |
| Empty env vars in local .env.local | Configured in Vercel instead | Low |

### Pending Features (Build Queue)

| Feature | Description | Priority |
|---------|-------------|----------|
| **3C**: FastAPI router auth | Wire server-side auth into FastAPI routers (blocked by JWT fix) | High |
| **3E**: Role system | `useRole()` hook + `<RoleGate>` component | Medium |
| **3D**: Real-Time P&L Dashboard | Live P&L updates | Medium |
| **3A**: Clerk Orgs multi-tenant | Organization-based access | Low |
| **3B**: Alpaca rate throttle | Rate limiting for Alpaca API calls | Low |
| **Helio checkout flow** | Actual payment integration (currently placeholder) | High |

### Credential Migration Status

The migration from Clerk privateMetadata → Supabase AES-256-GCM encrypted storage is **in progress**:

- New key saves go to Supabase (primary)
- Clerk privateMetadata is read as fallback
- `migrateClerkKeysToSupabase()` exists for one-time migration
- Old Clerk key manager components are consolidated

### Redis Cache Keys

| Pattern | TTL | Purpose |
|---------|-----|---------|
| `renko:snapshot:{symbol}:{brickSize}` | 4 hours | Renko pipeline warm-up snapshots |
| `renko:price:{symbol}` | 15 seconds | Latest cached price |
| `renko:regime:{symbol}` | 5 minutes | HMM regime detection result |
| `renko:backtest:{symbol}:{hash}` | 1 hour | Backtest result cache |

Redis gracefully degrades when unavailable — all reads fall through to the data source, all writes are silently skipped.

---

## Quick Reference: Key Values

### Supabase

| Item | Value |
|------|-------|
| Project ID | `pcvscowltlrxzgxjurcr` |
| URL | `https://pcvscowltlrxzgxjurcr.supabase.co` |
| Anon/Publishable Key | `sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa` |
| Service Role Key | `*(set in Vercel env vars)*` |
| Encryption Key | `*(see SUPABASE_ENCRYPTION_KEY env var)*` |
| Direct DB | `postgresql://postgres:<PASSWORD>@pcvscowltlrxzgxjurcr.supabase.co:5432/postgres` |
| Pooler DB | `postgresql://postgres.pcvscowltlrxzgxjurcr:<PASSWORD>@aws-0-us-west-1.pooler.supabase.com:6543/postgres` |

### Clerk

| Item | Value |
|------|-------|
| Instance | `large-shark-21.clerk.accounts.dev` |
| Test User | *(see Clerk dashboard)* |

### Upstash Redis

| Item | Value |
|------|-------|
| REST URL | `https://stunning-kodiak-73925.upstash.io` |
| Connection | `redis://default:<TOKEN>@stunning-kodiak-73925.upstash.io:6379` |

### GitHub

| Item | Value |
|------|-------|
| Org | `lexingtontechus/` |
| PAT | *(stored locally, not committed — set via environment or credential manager)* |
