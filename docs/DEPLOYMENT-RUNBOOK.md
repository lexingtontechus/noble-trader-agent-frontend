# Noble Trader — Production Deployment Runbook

## Table of Contents
1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Environment Variables](#2-environment-variables)
3. [Database Migrations](#3-database-migrations)
4. [Deployment Steps](#4-deployment-steps)
5. [Post-Deployment Verification](#5-post-deployment-verification)
6. [Rollback Procedures](#6-rollback-procedures)
7. [Health Check Gates](#7-health-check-gates)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Key Rotation](#9-key-rotation)
10. [Incident Response](#10-incident-response)

---

## 1. Pre-Deployment Checklist

Before every deployment, verify:

- [ ] **Build passes locally**: `npx next build` completes without errors
- [ ] **All tests pass**: No failing unit or integration tests
- [ ] **No hardcoded secrets**: Search for API keys, tokens, passwords in code
  ```bash
  rg -i '(api_key|secret|token|password)\s*=\s*["\'][a-zA-Z0-9]' src/
  ```
- [ ] **Migrations reviewed**: New migrations are tested on staging first
- [ ] **Breaking changes documented**: API contract changes noted in PR
- [ ] **Clerk dashboard**: Verify Clerk JWT template includes `org_id` claim
- [ ] **Supabase backup**: Latest backup exists and is < 24h old
- [ ] **Discord channel**: Notify #system-status of planned deployment

---

## 2. Environment Variables

### Frontend (Vercel) — Required

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-only) | Supabase dashboard |
| `SUPABASE_ENCRYPTION_KEY` | Master encryption key (32+ chars) | Generate: `openssl rand -base64 32` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Clerk dashboard |
| `CLERK_SECRET_KEY` | Clerk secret key (server-only) | Clerk dashboard |
| `NEXT_PUBLIC_FASTAPI_BASE_URL` | FastAPI backend URL | Render dashboard |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Upstash dashboard |
| `CRON_SECRET` | Shared secret for cron jobs | Generate: `openssl rand -hex 32` |

### Optional (Feature-Specific)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPABASE_ENCRYPTION_KEY_V2` | V2 encryption key (for rotation) | — |
| `SUPABASE_ENCRYPTION_ACTIVE_VERSION` | Active key version | `1` |
| `ALPACA_API_KEY` | Fallback Alpaca paper key | — |
| `ALPACA_SECRET_KEY` | Fallback Alpaca paper secret | — |
| `DISCORD_WEBHOOK_SIGNALS` | Discord trade signals webhook | — |
| `DISCORD_WEBHOOK_EXECUTIONS` | Discord executions webhook | — |
| `DISCORD_WEBHOOK_STATUS` | Discord system status webhook | — |

### Backend (Render) — Required

| Variable | Description |
|----------|-------------|
| `ALPACA_API_KEY` | Alpaca paper trading key |
| `ALPACA_SECRET_KEY` | Alpaca paper trading secret |
| `CLERK_SECRET_KEY` | Same as frontend |
| `PORT` | Server port (default: 8000) |
| `DISCORD_WEBHOOK_*` | Same Discord webhooks |

---

## 3. Database Migrations

### Running Migrations

```bash
# Connect to Supabase via connection pooler
python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres.{ref}:{password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
with open('supabase/migrations/MIGRATION_FILE.sql', 'r') as f:
    cur.execute(f.read())
conn.commit()
"
```

### Migration Order

Migrations are numbered sequentially (00000000000001 through 00000000000026).
Each migration is idempotent where possible (uses IF NOT EXISTS, DO blocks).

### Pre-Migration Checks

- [ ] Verify backup exists
- [ ] Test migration on staging first
- [ ] Check for CONCURRENTLY operations (can't run in transactions)
- [ ] Verify RLS policies won't break existing queries

### Current Migration State (26 migrations)

| # | Description | Tables Created |
|---|-------------|----------------|
| 01-11 | Core trading tables | campaigns, trades, signals, analysis |
| 12-16 | Auth, subscriptions, credentials | user_credentials, user_subscriptions |
| 17 | Kill switch | operational_controls |
| 18 | Cron jobs | pg_cron entries |
| 19 | Portfolio snapshots | portfolio_snapshots |
| 20 | Notification preferences | notification_preferences |
| 21 | Circuit breakers | circuit_breakers, trading_halts |
| 22 | Reconciliation | reconciliation_results |
| 23 | Smoke test | smoke_test_results |
| 24 | Rate limit violations | rate_limit_violations |
| 25 | Retention archive | *_archive tables, gdpr_erasure_log |
| 26 | Multi-tenant org_id | org_id columns, RLS policies |

---

## 4. Deployment Steps

### Frontend (Vercel)

1. **Push to main branch**: `git push origin main`
2. Vercel auto-deploys from main
3. Monitor build logs in Vercel dashboard
4. If build fails: fix locally, push again

### Backend (Render)

1. **Push to main branch**: `git push origin main`
2. Render auto-deploys from main
3. First request may take 30-60s (cold start)
4. Health check: `curl https://noble-trader-fastapi-backend.onrender.com/health`

### Manual Deployment (Emergency)

```bash
# Frontend
cd noble-trader-agent-frontend
vercel --prod

# Backend
cd noble-trader-agent-backend
render deploy --prod
```

---

## 5. Post-Deployment Verification

### Critical Health Checks (run in order)

```bash
# 1. Frontend health
curl -s https://your-domain.com/api/health | jq .

# 2. Backend health
curl -s https://noble-trader-fastapi-backend.onrender.com/health | jq .

# 3. Detailed system health (requires auth)
curl -s -H "Authorization: Bearer $CLERK_JWT" https://your-domain.com/api/health/detailed | jq .

# 4. Rate limiting (check X-RateLimit headers)
curl -I https://your-domain.com/api/health
# Should see: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

# 5. Encryption status (part of detailed health)
# Should show: configured: true, activeVersion: 1, keyCount: 1+

# 6. Cron jobs (via Supabase)
python3 -c "
import psycopg2
conn = psycopg2.connect('$DATABASE_URL')
cur = conn.cursor()
cur.execute('SELECT jobid, schedule, command FROM cron.job')
for row in cur.fetchall(): print(row)
"
```

### Smoke Test

Run the E2E smoke test from the Operational page (admin-only):
1. Navigate to P&L → Operational → Smoke Test
2. Click "Run Smoke Test"
3. Verify all 6 steps pass: signal → order → fill → P&L → close → cleanup

---

## 6. Rollback Procedures

### Frontend Rollback (Vercel)

1. **Instant rollback via Vercel dashboard**:
   - Go to Vercel → Project → Deployments
   - Click "..." on the last working deployment
   - Click "Promote to Production"

2. **Git rollback**:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Force rollback to specific commit**:
   ```bash
   git reset --hard <commit-hash>
   git push origin main --force
   # WARNING: This rewrites history. Use only in emergencies.
   ```

### Database Rollback

1. **Supabase Point-in-Time Recovery**:
   - Go to Supabase Dashboard → Database → Backups
   - Select the backup from before the deployment
   - Click "Restore" (this replaces the entire database)

2. **Manual migration rollback**:
   - Create a new migration that reverses the changes
   - Example: `ALTER TABLE x DROP COLUMN y;`
   - Run the reverse migration via psycopg2

### Backend Rollback (Render)

1. **Render dashboard**: Redeploy previous commit
2. **Git rollback**: Same as frontend — `git revert` or `git reset --hard`

---

## 7. Health Check Gates

### Automated Gates (CI/CD)

These checks run before a deployment is considered successful:

| Gate | Check | Failure Action |
|------|-------|----------------|
| Build | `npx next build` succeeds | Block deployment |
| Health | `/api/health` returns 200 | Alert + rollback |
| Backend | `/health` on FastAPI returns 200 | Alert + retry |
| Encryption | `getEncryptionStatus().configured === true` | Block deployment |
| Rate Limits | `X-RateLimit-*` headers present | Warning |

### Manual Gates (Pre-Production)

- [ ] Smoke test passes (6/6 steps)
- [ ] System health dashboard shows all green
- [ ] Circuit breakers: no unexpected halts
- [ ] Rate limiting: 429 responses working correctly
- [ ] Encryption: can encrypt/decrypt credentials
- [ ] Audit trail: events flowing to trade_audit_log

---

## 8. Monitoring & Alerting

### Discord Alerts (Configured)

| Channel | Webhook Env Var | Alert Types |
|---------|-----------------|-------------|
| #trade-signals | `DISCORD_WEBHOOK_SIGNALS` | New signals detected |
| #trade-executions | `DISCORD_WEBHOOK_EXECUTIONS` | Order fills, rejections |
| #system-status | `DISCORD_WEBHOOK_STATUS` | Health alerts, deployments |

### pg_cron Monitoring Jobs

| Job | Schedule | What it monitors |
|-----|----------|------------------|
| noble-campaign-tick | Every 1 min (market hours) | Campaign processing |
| noble-tda-scan | Every 4 hours | TDA signal scanning |
| noble-schedule-execute | Every 15 min | Scheduled order execution |
| noble-strategy-rotate | Every 6 hours | Strategy rotation |
| noble-strategy-optimize | Daily 10pm | Strategy optimization |
| noble-portfolio-snapshot | Daily 8pm | Portfolio snapshot capture |
| noble-retention-archive | Daily 3am | Data archival + cleanup |

### Key Metrics to Monitor

- **Error rate**: % of 5xx responses (target: < 1%)
- **Latency**: P95 API response time (target: < 500ms)
- **Rate limit violations**: Per user/tier (anomaly detection)
- **Circuit breaker triggers**: Per breaker type (risk events)
- **Data freshness**: Last analysis/fill/snapshot timestamps

---

## 9. Key Rotation

### Encryption Key Rotation (AES-256-GCM)

1. **Generate new key**:
   ```bash
   openssl rand -base64 32
   ```

2. **Add to Vercel environment variables**:
   - `SUPABASE_ENCRYPTION_KEY_V2` = new key
   - `SUPABASE_ENCRYPTION_ACTIVE_VERSION` = `2`

3. **Deploy**: Push to trigger Vercel rebuild

4. **Auto-rotation**: New data encrypted with V2. Old data auto-re-encrypted on next read (transparent).

5. **Verify**: Run smoke test, check health endpoint for `activeVersion: 2`

6. **Cleanup**: After all data rotated, remove V1 key from env vars

### Alpaca Key Rotation

1. Generate new keys in Alpaca dashboard
2. Update via Noble Trader settings page (auto-encrypts to Supabase)
3. Verify with "Validate Credentials" button
4. Old keys are overwritten in user_credentials (upsert)

### Discord Webhook Rotation

1. Regenerate webhook URLs in Discord
2. Update Vercel env vars: `DISCORD_WEBHOOK_*`
3. Redeploy: `git commit --allow-empty -m "rotate discord webhooks" && git push`

---

## 10. Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 | Trading halted / data loss | < 15 min | Kill switch activated, DB corruption |
| P1 | Feature degraded | < 1 hour | Backend down, rate limits failing |
| P2 | Non-critical issue | < 4 hours | Dashboard slow, webhook failures |
| P3 | Minor inconvenience | Next business day | UI glitch, non-critical bug |

### P0: Trading Halt Response

1. **Immediate**: Check System Health Dashboard
2. **Identify**: Is it a circuit breaker, kill switch, or backend failure?
3. **Circuit breaker**: Evaluate if breaker should be deactivated (admin panel)
4. **Kill switch**: Only deactivate after root cause is understood
5. **Backend failure**: Check Render dashboard, restart if needed
6. **Post-incident**: Write incident report, update runbook

### P0: Data Loss Response

1. **Immediate**: Stop all trading activity (activate kill switch)
2. **Assess**: What data was lost? Which tables?
3. **Recover**: Restore from Supabase backup (PITR)
4. **Verify**: Run reconciliation to check data integrity
5. **Post-incident**: Review RLS policies, audit access logs

---

## Quick Reference

```bash
# Emergency kill switch
curl -X POST https://your-domain.com/api/operational/kill-switch/activate \
  -H "Authorization: Bearer $CLERK_JWT"

# Check system health
curl -s https://your-domain.com/api/health/detailed | jq '.overall'

# Run retention jobs
curl -X POST https://your-domain.com/api/retention \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"run_retention"}'

# GDPR purge (DESTRUCTIVE)
curl -X POST https://your-domain.com/api/retention \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"gdpr_purge","userId":"user_xxx","reason":"gdpr_request"}'
```
