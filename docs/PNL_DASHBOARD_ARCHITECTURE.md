# Real-Time P&L Dashboard — Architecture Design

> **Status**: Phase 5 Complete (Risk Metrics + Intraday + CSV Export + Alerts)
> **Last Updated**: 2026-05-21
> **Decision**: Option C — Alpaca Streaming → FastAPI Backend → SSE → Frontend

---

## 1. Overview

The P&L Dashboard provides real-time portfolio profit & loss tracking for Noble Trader. It combines Alpaca broker data (account, positions, equity history) with the platform's regime detection and risk analytics into a single unified view.

### Goals

- **Real-time**: Sub-second position/fill updates via SSE, not polling
- **Single source of truth**: One `PortfolioProvider` context shared across all views
- **Scalable**: Persistent connections live in FastAPI (Render), not Vercel serverless
- **Resilient**: SSE with automatic reconnect + polling fallback

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  FastAPI Backend (Render)                                    │
│                                                              │
│  ┌─────────────────────────────────┐                         │
│  │  AlpacaStreamManager             │                         │
│  │  ├─ trade_ws                     │                         │
│  │  │   wss://api.alpaca.markets/stream                       │
│  │  │   → fills, account updates, position changes            │
│  │  │                              │                         │
│  │  ├─ data_ws                      │                         │
│  │  │   wss://stream.data.alpaca.markets/v2/iex               │
│  │  │   → real-time quotes/trades for held positions           │
│  │  │                              │                         │
│  │  ├─ positions_cache (per-user)   │                         │
│  │  │   Redis-backed position snapshot                         │
│  │  │                              │                         │
│  │  └─ on_event → recalc P&L → SSE │                         │
│  └────────────┬────────────────────┘                         │
│               │                                               │
│  ┌────────────▼────────────────────┐                         │
│  │  /sse/pnl  (new endpoint)        │                         │
│  │  JWT-authed, same pattern as     │                         │
│  │  /sse/{symbol} and /sse/alerts   │                         │
│  │                                  │                         │
│  │  Event types pushed:             │                         │
│  │  • position_update  (fill)       │                         │
│  │  • price_tick       (quote)      │                         │
│  │  • pnl_snapshot     (aggregated) │                         │
│  │  • account_update   (equity chg) │                         │
│  └──────────────────────────────────┘                         │
│                                                              │
│  ┌──────────────────────────────────┐                        │
│  │  REST endpoints (existing)        │                        │
│  │  • GET /portfolio   — regime/risk │                        │
│  │  • GET /correlation/detect        │                        │
│  │  • POST /optimise/full            │                        │
│  └──────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
        │ SSE (EventSource)         │ REST (fetch)
        ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Vercel) — Next.js                                 │
│                                                              │
│  ┌─────────────────────────────────┐                         │
│  │  PortfolioProvider (new context) │  ← mounted ONCE in     │
│  │  ├─ EventSource(/sse/pnl)        │    page.js alongside   │
│  │  ├─ Polling fallback (30s)       │    StreamProvider      │
│  │  ├─ positions, account, equity   │                         │
│  │  ├─ realizedPnl, recentTrades    │                         │
│  │  ├─ priceTicks (per-symbol)      │                         │
│  │  └─ Computed P&L values          │                         │
│  └────────────┬────────────────────┘                         │
│               │ usePortfolio()                                │
│     ┌─────────┴──────────┐                                    │
│     ▼                    ▼                                    │
│  PortfolioPage     OperationalPage                            │
│  (Ctrl+5)          (Ctrl+8)                                  │
│     │                    │                                    │
│     └──── shared context ┘─── no duplicate polling            │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Current Flow (Polling-Only)

```
Alpaca REST API
  ├── GET /v2/account → account data
  ├── GET /v2/positions → positions[]
  └── GET /v2/account/portfolio/history → equity curve
       │
       ▼
Next.js BFF Routes
  ├── /api/alpaca/account
  ├── /api/alpaca/positions
  └── /api/alpaca/portfolio/history
       │
       ▼
usePortfolioData() hook (per-instance, 10s polling)
       │
       ▼
LivePnLDashboard component
```

**Problems**: Duplicate polling (2 instances), 10s staleness, no real-time fills.

### 3.2 Target Flow (SSE + Polling Fallback)

```
Alpaca Streaming API
  ├── wss://api.alpaca.markets/stream → fills, account updates
  └── wss://stream.data.alpaca.markets/v2/iex → quotes/trades
       │
       ▼
FastAPI AlpacaStreamManager (persistent connection)
  ├─ Receives trade fills → recalcs P&L → pushes SSE event
  ├─ Receives quotes → pushes price_tick SSE event
  └─ Periodic pnl_snapshot (every 5s)
       │
       ▼ SSE (/sse/pnl)
       │
PortfolioProvider (single instance)
  ├─ EventSource listener (primary)
  ├─ Polling fallback every 30s (if SSE disconnects)
  ├─ Initial REST fetch on mount (bootstrap)
  └─ Computes: totalUnrealizedPnl, dayPnl, totalMarketValue, etc.
       │
       ▼ usePortfolio()
  ┌────────────────┐
  │ LivePnLDashboard │  ← reads context, no internal hook
  │ PortfolioOverview │
  │ OperationalPage   │
  └────────────────┘
```

---

## 4. Component Architecture

### 4.1 Frontend Files

| File | Purpose | Phase |
|------|---------|-------|
| `src/context/PortfolioContext.jsx` | Provider + `usePortfolio()` hook | 1 |
| `src/hooks/usePortfolioData.js` | Internal data fetching logic (used by context, not exported) | 1 (refactored) |
| `src/components/operational/LivePnLDashboard.jsx` | Dashboard UI — consumes `usePortfolio()` | 1 (refactored) |
| `src/components/portfolio/PortfolioPage.jsx` | Portfolio page — removes internal `usePortfolioData()` | 1 (refactored) |
| `src/components/operational/OperationalPage.jsx` | Ops page — same treatment | 1 (refactored) |
| `src/app/page.js` | Mount `PortfolioProvider` alongside `StreamProvider` | 1 |

### 4.2 Backend Files (Phases 2-3)

| File | Purpose | Phase |
|------|---------|-------|
| `app/core/alpaca_stream.py` | Alpaca WebSocket client, auto-reconnect, position cache | 2 |
| `app/routers/stream_ws.py` | Add `/sse/pnl` endpoint | 3 |
| `app/schemas/pnl.py` | SSE event type schemas | 3 |

### 4.3 New API Routes (Phase 4)

| Route | Purpose | Phase |
|-------|---------|-------|
| `/api/alpaca/activities` | Trade history / realized P&L | 4 |

---

## 5. SSE Event Schema

Events pushed over `/sse/pnl`:

```jsonc
// Position update (triggered by fill)
{
  "event": "position_update",
  "data": {
    "symbol": "AAPL",
    "qty": 150,
    "side": "long",
    "avg_entry_price": "185.20",
    "current_price": "192.50",
    "market_value": "28875.00",
    "unrealized_pl": "1095.00",
    "unrealized_plpc": "0.0395",
    "timestamp": 1716307200
  }
}

// Price tick (triggered by quote/trade from Alpaca data stream)
{
  "event": "price_tick",
  "data": {
    "symbol": "AAPL",
    "price": "192.55",
    "bid": "192.54",
    "ask": "192.56",
    "volume": 1250000,
    "timestamp": 1716307200
  }
}

// P&L snapshot (periodic aggregate, every 5s)
{
  "event": "pnl_snapshot",
  "data": {
    "total_unrealized_pnl": 3250.50,
    "total_unrealized_pnl_pc": 0.0287,
    "total_market_value": 113250.00,
    "day_pnl": -180.25,
    "day_pnl_pc": -0.0016,
    "positions_count": 8,
    "timestamp": 1716307200
  }
}

// Account update (triggered by equity/cash change)
{
  "event": "account_update",
  "data": {
    "equity": "115430.25",
    "cash": "2180.00",
    "buying_power": "2180.00",
    "long_market_value": "113250.25",
    "short_market_value": "0.00",
    "last_equity": "115610.50",
    "timestamp": 1716307200
  }
}
```

---

## 6. PortfolioProvider Context API

```typescript
interface PortfolioContext {
  // Account
  account: Account | null;
  positions: Position[];
  equityCurve: EquityPoint[];
  equityCurveLoading: boolean;
  equityCurvePeriod: string;
  setEquityCurvePeriod: (period: string) => void;

  // Real-time price ticks (from SSE)
  priceTicks: Record<string, PriceTick>;  // symbol → latest tick

  // Computed P&L
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPc: number;
  totalMarketValue: number;
  dayPnl: number;
  dayPnlPc: number;

  // Connection status
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isStale: boolean;
  sseConnected: boolean;

  // Actions
  refresh: () => Promise<void>;
}
```

---

## 7. Credential Resolution

The backend resolves Alpaca credentials using the same chain as existing BFF routes:

```
1. Supabase vault (encrypted credentials table)
   ↓ not found
2. Clerk privateMetadata (paper keys only)
   ↓ not found
3. Return 403 NO_KEYS
```

The `AlpacaStreamManager` opens streaming connections per-user after resolving credentials. Connections are keyed by `user_id` and auto-cleanup when the SSE client disconnects.

---

## 8. Build Phases

### Phase 1: Foundation — PortfolioProvider + Dedup ✅ Complete
- Create `PortfolioContext.jsx` with `PortfolioProvider` + `usePortfolio()`
- Refactor `usePortfolioData.js` to be internal-only (used by context)
- Mount `PortfolioProvider` in `page.js` alongside `StreamProvider`
- Refactor `LivePnLDashboard` to consume `usePortfolio()` instead of `usePortfolioData()`
- Remove duplicate `usePortfolioData()` from `PortfolioPage`
- Both pages now read from single shared context
- **Result**: Eliminates duplicate polling, single source of truth

### Phase 2: Alpaca Stream Manager (Backend) ✅ Complete
- Create `regime_platform/services/alpaca_stream.py` — AlpacaStreamManager singleton
- Per-user credential resolution (Supabase → global env var fallback)
- Trade WebSocket: fills, account updates, position changes (auto-reconnect with exponential backoff)
- Data WebSocket: real-time quotes for held positions (throttled 1/s, IEX feed)
- Periodic P&L snapshot every 5s (aggregate from positions cache)
- Bootstrap: fetches current positions/account via REST on first connect
- Fan-out via asyncio.Queue per SSE consumer (30s grace period after last disconnect)
- Add `/sse/pnl` and `/sse/pnl/status` endpoints to `stream_ws.py`
- Add `websockets>=12.0` to `requirements.txt`

### Phase 3: SSE P&L Endpoint + Frontend Wiring ✅ Complete
- Add `/api/stream/pnl` BFF route (proxies SSE with JWT auth — EventSource can't send headers)
- Wire EventSource in `PortfolioProvider` (auto-connect when `hasKeys` is true)
- Handle all 4 SSE event types: position_update, price_tick, pnl_snapshot, account_update
- Auto-reconnect with exponential backoff (max 20 attempts)
- Polling continues as safety net at 10s intervals

### Phase 4: Realized P&L + Trade History ✅ Complete
- Add `getActivities()` to `alpaca-client.js` — calls Alpaca `/v2/account/activities` API
- Add `/api/alpaca/activities` BFF route (FILL type, period shorthand, pagination)
- Add `recentTrades`, `realizedPnl`, `realizedPnlBySymbol`, `refreshTrades` to `PortfolioContext`
- Add "Realized P&L (3M)" metric card to LivePnLDashboard (5-card grid: equity + day + unrealized + realized + buying power)
- Add "Recent Trades" table section with time, symbol, side, qty, price, P&L columns
- Add "Realized P&L by Symbol" breakdown (top 10 symbols sorted by realized P&L)
- Trade history fetched on first key resolution (not on every poll)

### Phase 5: Risk Metrics + Intraday + Export + Alerts ✅ Complete
- **Risk Dashboard**: `GET /risk/dashboard` → Sharpe, Sortino, Calmar, VaR, CVaR, Max DD, win rate, profit factor (30s cache, Pydantic `RiskDashboardResponse` model)
- **Intraday P&L**: `GET /pnl/intraday` → time-bucketed series (5Min/15Min/1Hour/1Day) with period selectors
- **Historical P&L**: `GET /pnl/history` → daily equity curve with drawdown derivation
- **CSV Export**: `GET /pnl/export` → multi-section CSV (positions, trades, equity_curve, risk_metrics)
- **Alert Thresholds**: Full CRUD (`GET/POST/DELETE /pnl/alerts`) + manual check (`POST /pnl/alerts/check`)
- **Alert Persistence**: Supabase `pnl_alert_thresholds` table with in-memory cache for fast SSE evaluation
- **Real-time Alert SSE**: `PnlAlertEvent` in 5s snapshot loop → `evaluate_and_broadcast()` → SSE + Discord push
- **Discord Integration**: Triggered P&L alerts push to `#system-status` channel via `DiscordNotifier`
- **Frontend**: Risk metrics panel (12 cards), intraday chart toggle, alert thresholds panel, CSV export button, active alerts bar
- **Supabase Migration**: `00000000000015_pnl_alert_thresholds.sql`

---

## 9. Scaling Considerations

### Connection Management
- Each authenticated user = 1 SSE connection + 2 Alpaca WebSocket connections
- Alpaca free tier: 1 concurrent streaming connection per API key
- Alpaca unlimited: multiple concurrent connections allowed
- Render scaling: vertical first (more RAM/CPU for concurrent connections), then horizontal with Redis pub/sub for multi-process fan-out

### Rate Limits
- Alpaca REST: 200 requests/min per API key
- Alpaca Streaming: No rate limit (WebSocket)
- Current polling: ~12 req/min (2 users × 3 endpoints × 2 pages)
- After Phase 3: ~2 req/min (30s fallback only) + 0 streaming cost

### Memory
- Position cache per user: ~1-5 KB
- 100 concurrent users: ~500 KB Redis
- Price tick cache: ~50 bytes per symbol, bounded by position count

---

## 10. Security

- SSE endpoints require JWT auth (same as `/sse/{symbol}`)
- Alpaca credentials never touch the frontend — resolved server-side only
- SSE events are per-user — no cross-user data leakage
- Credential encryption: AES-256-GCM in application layer (Supabase vault)
