# P2-4C: Historical Equity Curve — Work Record

## Task
Implement P2-4C: Historical Equity Curve for long-term portfolio tracking by persisting daily portfolio snapshots to Supabase.

## Files Created

### 1. `supabase/migrations/00000000000019_portfolio_snapshot.sql`
- Creates `portfolio_snapshots` table with columns: id, user_id, snapshot_date, equity, cash, positions, day_pnl, unrealized_pnl, realized_pnl, total_value, benchmark_value, metadata, created_at
- UNIQUE constraint on (user_id, snapshot_date) for upsert support
- RLS enabled with service role policy for full access
- Indexes on user_id, user_id+snapshot_date, snapshot_date
- pg_cron job `noble-portfolio-snapshot` scheduled for 8:00 PM UTC (4:00 PM ET) weekdays

### 2. `src/app/api/portfolio/snapshot/route.js`
- **GET**: Retrieve historical snapshots with query params (date_from, date_to, limit)
  - withAuth({ minRole: 'viewer' })
  - Graceful table existence check (ensureTable)
  - Returns snapshots sorted by date ascending
- **POST**: Capture a new snapshot from Alpaca
  - withAuth({ minRole: 'trader' })
  - Resolves credentials via getAlpacaCredentialKeys()
  - Fetches account + positions from Alpaca
  - Upserts into portfolio_snapshots

### 3. `src/app/api/portfolio/snapshot/capture/route.js`
- **POST**: Batch capture with SPY benchmark
  - withAuth({ minRole: 'trader', allowCron: true })
  - Authenticated users: captures for their own account
  - Cron mode: iterates all users with existing snapshots
  - Fetches SPY close price via fetchHistoricalPrices()
  - Upserts snapshot with benchmark_value

### 4. `src/components/operational/HistoricalEquityCurve.jsx`
Full-featured historical equity curve panel:
- Date range selector: 1M, 3M, 6M, 1Y, YTD, ALL
- Dual-axis ComposedChart (Area: portfolio equity, Line: SPY benchmark)
- Drawdown overlay toggle (red Area chart below main chart)
- Metrics bar: Total Return %, CAGR, Max Drawdown, Sharpe Ratio, Sortino Ratio, Alpha vs SPY
- Manual "Capture Now" button triggers /api/portfolio/snapshot/capture
- Auto-refresh every 60s during market hours
- Empty state with prompt to capture first snapshot
- Loading skeleton states
- Custom tooltips with date, portfolio value, benchmark value, day P&L

## Files Modified

### 5. `src/components/operational/OperationalPage.jsx`
- Added import for HistoricalEquityCurve
- Added `<HistoricalEquityCurve />` component between LivePnLDashboard and KillSwitchPanel
- Updated component JSDoc with P2-4C description

### 6. `supabase/README.md`
- Updated migration count from 18 to 19
- Added row 19 for portfolio_snapshot.sql
- Updated production note to reference 19 migrations

## Build Verification
- `next build` compiled successfully with no errors
- Both new API routes detected: `/api/portfolio/snapshot` and `/api/portfolio/snapshot/capture`

## Key Design Decisions
- Used `createClient` with `SUPABASE_SERVICE_ROLE_KEY` directly (not db.js proxy) since portfolio_snapshots is not in the TABLE_MAP
- Graceful table existence check in ensureTable() handles first-time use before migration is run
- Cron capture iterates users who already have snapshots (safe fallback for multi-user)
- SPY benchmark is optional (null if Yahoo Finance unavailable)
- All BFF routes use withAuth() as required
