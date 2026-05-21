# Noble Trader — Supabase Migrations

## Directory Structure

```
supabase/
  config.toml            — Supabase CLI configuration
  migrations/            — 18 sequential migrations (run in order)
```

## Migration Inventory

| # | File | Tables Created/Altered |
|---|------|----------------------|
| 01 | `create_tables.sql` | `ta_analysis_run`, `ta_trade_recommendation`, `ta_scheduled_order`, `ta_telegram_notification`, `ta_tda_scan_result`, `ta_early_warning_alert` |
| 02 | `strategy_evolution.sql` | `ta_strategy_variant`, `ta_strategy_performance`, `ta_ab_test`, `ta_evolution_log` |
| 03 | `scheduled_orders.sql` | Enhanced indexes on `ta_scheduled_order`, `ta_telegram_notification` |
| 04 | `backtest_results.sql` | `ta_backtest_result` |
| 05 | `backtest_cost_columns.sql` | ALTER `ta_backtest_result` (cost columns) |
| 06 | `renko_snapshot.sql` | `ta_renko_snapshot` |
| 07 | `user_credentials_subscriptions.sql` | `user_credentials`, `user_subscriptions`, `user_onboarding` |
| 08 | `credentials.sql` | `credentials` (backend, plain-text API keys) |
| 09 | `universe_snapshot.sql` | `nt_universe_snapshot` |
| 10 | `corporate_action.sql` | `nt_corporate_action` |
| 11 | `data_quality_columns.sql` | ALTER `ta_backtest_result` (data lineage) |
| 12 | `statistical_rigor_columns.sql` | ALTER `ta_backtest_result` (bootstrap, DSR, MHT) |
| 13 | `execution_modeling_columns.sql` | ALTER `ta_backtest_result` (execution modeling) |
| 14 | `trade_audit_log.sql` | `trade_audit_log` (append-only, includes `org_id`) |
| 15 | `pnl_alert_thresholds.sql` | `pnl_alert_thresholds` |
| 16 | `org_credentials.sql` | ALTER `credentials` (org_id column) |
| 17 | `trade_campaign.sql` | `trade_campaign`, `campaign_trades`, `campaign_tick()` function |
| 18 | `cron_jobs_consolidated.sql` | All 5 pg_cron jobs (single source of truth) |

## Two Credentials Tables

This project has **two** credentials tables:

| Table | Used By | Encryption | Key Column |
|-------|---------|-----------|------------|
| `user_credentials` | Frontend (BFF routes) | AES-256-GCM (app layer) | `clerk_user_id` |
| `credentials` | Backend (FastAPI) | Plain text (app layer encrypts before insert) | `user_id` + `org_id` |

Both exist because the frontend and backend were developed independently. A future refactor may consolidate them.

## Vault Secrets Required

Before running Migration 18, add these in **Dashboard → Vault**:

- `cron_secret` — same value as `CRON_SECRET` in Vercel
- `noble_base_url` — e.g. `https://noble-trader-agent-frontend.vercel.app`

## Applying Migrations

### Fresh Database (Supabase CLI)
```bash
supabase db push
```

### Existing Database (SQL Editor)
Run each migration in order via **Dashboard → SQL Editor**.
Migrations are idempotent (IF NOT EXISTS throughout) so re-running is safe.

### Production Note
All 18 migrations have already been applied to the production Supabase instance.
If connecting the Supabase CLI to an existing project, run:
```bash
supabase db pull  # generates a single migration from current state
```
Or mark all as applied:
```bash
supabase migration repair --status applied <migration-name>
```
