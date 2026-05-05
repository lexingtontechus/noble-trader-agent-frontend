# Noble Trader — Frontend Phase Plan

> **Stack**: Next.js 16 (App Router) · JavaScript (JSX only) · DaisyUI v5 · Clerk Auth v7
> **Backend**: FastAPI @ `https://noble-trader-fastapi-backend.onrender.com`
> **Trading**: Alpaca Paper Trading API
> **Constraint**: ONLY DaisyUI for all CSS & components — no shadcn/ui, no custom Tailwind classes for UI elements

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐      │
│  │  Home /   │  │Dashboard │  │  Orders /  │  │  Search   │      │
│  │  SignIn   │  │  (3 Ticker│  │  Portfolio │  │  (Ticker  │      │
│  │  (Clerk)  │  │  cards)  │  │  History)  │  │  Analysis)│      │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬─────┘      │
│        │             │              │               │             │
│  ┌─────▼─────────────▼──────────────▼───────────────▼─────┐      │
│  │              BFF API Routes (/api/*)                     │      │
│  │  /api/analyse  /api/prices  /api/alpaca/*  /api/health  │      │
│  │  /api/stream/*  /api/simulate  /api/portfolio            │      │
│  └───────┬──────────────┬──────────────┬───────────────────┘      │
│          │              │              │                           │
└──────────┼──────────────┼──────────────┼───────────────────────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────────┐
    │  FastAPI    │ │   Yahoo    │ │  Alpaca Markets  │
    │  Backend    │ │   Finance  │ │  Paper Trading   │
    │  (Render)   │ │   (Prices) │ │  (Orders/Acct)   │
    └─────────────┘ └────────────┘ └──────────────────┘
```

---

## Phase 1: Foundation & BFF API Layer ✅

> Combines original Phases 1–3: project setup, layout shell, and all backend-for-frontend API routes.

### Step 1.1 — Project Foundation
- [x] Convert to JSX mode (all `.tsx`/`.ts` → `.jsx`/`.js` in `src/`)
- [x] DaisyUI v5 as Tailwind CSS v4 plugin with custom "noble" dark theme
- [x] Clerk Auth v7 with sign-in/sign-up pages + middleware
- [x] Remove all shadcn/ui remnants
- [x] Custom "noble" DaisyUI theme (gold/amber primary, purple secondary, teal accent)

### Step 1.2 — Layout Shell
- [x] `src/app/layout.js` — ClerkProvider + data-theme="noble" + Geist font
- [x] `src/app/page.js` — SPA view router with Clerk `<Show />` auth gate
- [x] `src/components/Navbar.jsx` — Tabs (Dashboard | Orders | Simulate | Portfolio | Search | Docs), health badge, stream indicator, theme switcher, UserButton
- [x] `src/components/Footer.jsx` — Sticky footer with version, feature badges, disclaimer
- [x] Keyboard shortcuts (Ctrl+1–5 for view switching, Ctrl+K search)
- [x] Animated view transitions (fadeInUp)

### Step 1.3 — FastAPI Client Utility
- [x] `src/lib/fastapi-client.js` — Centralized fetch wrapper with:
  - `analyseFull()`, `detectRegime()`, `sizeKelly()`, `analyseRisk()` — batch analysis
  - `seedSession()`, `pushTick()`, `getSessions()`, `getSSEUrl()`, `getAlertsSSEUrl()` — streaming
  - `simulateRegime()`, `getPortfolio()` — simulation & portfolio (v2.1)
  - `detectCorrelation()`, `optimisePortfolio()` — correlation & optimization (v3.0)
  - `checkHealth()` — backend health probe
  - Retry with exponential backoff (Render cold-start handling)
  - 60s timeout for all FastAPI calls

### Step 1.4 — BFF API Routes (Batch)
- [x] `src/app/api/prices/route.js` — Yahoo Finance historical prices (GET, params: symbol, period)
- [x] `src/app/api/analyse/route.js` — BFF: fetch prices → forward to FastAPI `/analyse/full` (POST)
- [x] `src/app/api/health/route.js` — FastAPI health proxy with latency measurement
- [x] `src/app/api/commentary/route.js` — LLM-powered market commentary via z-ai-web-dev-sdk

### Step 1.5 — BFF API Routes (Alpaca Trading)
- [x] `src/app/api/alpaca/account/route.js` — GET account info (Clerk privateMetadata → Alpaca)
- [x] `src/app/api/alpaca/orders/route.js` — GET order history with period filter
- [x] `src/app/api/alpaca/orders/create/route.js` — POST place order (default qty: 100)
- [x] `src/app/api/alpaca/positions/route.js` — GET open positions
- [x] `src/lib/alpaca-client.js` — Alpaca API proxy helpers

### Step 1.6 — BFF API Routes (Clerk Private Metadata)
- [x] `src/app/api/clerk/alpaca-keys/route.js` — GET/POST Alpaca keys (server-side only)
- [x] `src/app/api/clerk/alpaca-keys-status/route.js` — GET key status (boolean, never exposes keys)
- [x] `src/lib/clerk-metadata.js` — Clerk privateMetadata helpers

### Step 1.7 — Shared Infrastructure
- [x] `src/lib/cache.js` — In-memory cache with TTL (5-min for analysis results)
- [x] `src/components/shared/LoadingSkeleton.jsx` — DaisyUI skeleton loading states
- [x] `src/components/shared/ErrorState.jsx` — DaisyUI alert-error with retry
- [x] `src/components/shared/EmptyState.jsx` — DaisyUI placeholder
- [x] `src/components/shared/ThemeSwitcher.jsx` — 6-theme dropdown (Noble, Light, Dark, Cupcake, Business, Synthwave)

### Phase 1 Deliverables
- Clean Next.js 16 project in JSX mode with DaisyUI v5 + Clerk auth
- Complete BFF API layer (8+ routes)
- FastAPI integration with cold-start retry/backoff
- Alpaca proxy routes secured via Clerk privateMetadata
- In-memory caching for analysis results

---

## Phase 2: Dashboard, Search & Analysis ✅

> Core UI pages: 3-ticker dashboard, symbol search, and all analysis display components.

### Step 2.1 — Dashboard Container
- [x] `src/components/dashboard/Dashboard.jsx` — Main dashboard:
  - 3 default tickers: Gold (GC=F), Bitcoin (BTC-USD), EUR/USD (EURUSD=X)
  - Period selector: 6M / 1Y / 2Y (DaisyUI btn-group)
  - Auto-refresh toggle with 2-minute interval
  - Last-updated timestamp
  - Comparison table toggle

### Step 2.2 — Ticker Card Component
- [x] `src/components/dashboard/TickerCard.jsx` — DaisyUI card per ticker:
  - Header: Symbol name + current price + ▲/▼ return indicator (badge)
  - Price chart (Recharts AreaChart)
  - Collapsible sections: Regime, HMM Features, Risk, Recommendations, Simulation (v2.1)
  - "Go Live" streaming button (v2.0)

### Step 2.3 — Analysis Components
- [x] `src/components/analysis/RegimeCard.jsx` — HMM regime label, vol/trend probability bars, confidence, risk multiplier, bars fitted
- [x] `src/components/analysis/ObservationFeatures.jsx` — 24-feature vector display with progress bars (returns, volatility, derived, HMM, Markov, quality, position)
- [x] `src/components/analysis/RiskCard.jsx` — VaR 95/99, CVaR 95/99, max drawdown, Sortino/Calmar, stop/TP levels
- [x] `src/components/analysis/RecommendationsCard.jsx` — Position size, regime-based action alerts, stop/TP, analysis notes
- [x] `src/components/analysis/PriceChart.jsx` — Recharts AreaChart with gradient fill and tooltip
- [x] `src/components/analysis/CommentaryCard.jsx` — AI-generated market insights (LLM via z-ai-web-dev-sdk)

### Step 2.4 — Dashboard Enhancements
- [x] `src/components/dashboard/ComparisonTable.jsx` — Side-by-side comparison of 3 tickers across 11+ metrics, color-coded cells
- [x] `src/components/dashboard/RegimeSummaryBanner.jsx` — Color-coded quick-glance regime pills at dashboard top

### Step 2.5 — Search Page
- [x] `src/components/search/SearchPage.jsx` — Symbol search with Enter key, period filter, 16 popular tickers, recent searches (localStorage, max 8)
- [x] `src/components/search/SearchResults.jsx` — Full analysis layout: price chart + regime + HMM features + risk + recommendations + buy/sell button

### Step 2.6 — Orders / Portfolio Page
- [x] `src/components/orders/OrdersPage.jsx` — Period filter (1M/3M/6M/1Y), order history, open positions, account summary
- [x] `src/components/orders/AlpacaKeySetup.jsx` — DaisyUI modal for Alpaca API key configuration (stored in Clerk privateMetadata)
- [x] `src/components/orders/AccountSummary.jsx` — Equity, cash, buying power, status badges
- [x] `src/components/orders/OrderHistory.jsx` — Filterable order table with status badges
- [x] `src/components/orders/OpenPositions.jsx` — Position table with P&L coloring
- [x] `src/components/orders/OrderModal.jsx` — Buy/sell modal with side toggle, qty input, order type, confirmation step
- [x] `src/components/orders/PortfolioAnalysis.jsx` — Regime analysis for held positions
- [x] `src/components/orders/PortfolioAnalysisCard.jsx` — Portfolio analysis card with simulation integration

### Phase 2 Deliverables
- Complete dashboard with 3 default tickers
- Full analysis component library (regime, HMM, risk, recommendations, commentary)
- Search page with symbol lookup + recent searches
- Orders page with Alpaca key setup, order execution, portfolio analysis
- All components using ONLY DaisyUI classes

---

## Phase 3: Streaming & Real-Time ✅

> SSE streaming integration: real-time regime detection, tick pushing, alert system.

### Step 3.1 — Stream Context & Hook
- [x] `src/context/StreamContext.jsx` — Global streaming state provider:
  - Multi-symbol subscription management (subscribe/unsubscribe/toggle)
  - Alert history with deduplication (max 50, most recent first)
  - Per-symbol stream state tracking (seeded, connected, streaming, lastTick, error, sseMode)
  - Active stream count + anyConnected derived state
  - `StreamHookWrapper` renders `useStreamPrice` per subscribed symbol
- [x] `src/hooks/useStreamPrice.js` — Per-symbol SSE streaming hook:
  - Flow: Seed (POST /api/stream/seed) → Connect SSE (EventSource to FastAPI) → Push ticks (periodic)
  - Direct SSE with automatic fallback to tick polling on CORS/connectivity failure
  - Exponential reconnect backoff (2s → 30s max)
  - 30-second tick interval with Yahoo Finance price fetching
  - Regime change alert detection in SSE messages

### Step 3.2 — BFF Streaming Routes
- [x] `src/app/api/stream/seed/route.js` — POST: seeds FastAPI session with Yahoo prices
- [x] `src/app/api/stream/tick/route.js` — POST: push price tick → FastAPI /stream/tick
- [x] `src/app/api/stream/latest-price/route.js` — GET: fetch latest Yahoo price for tick source
- [x] `src/app/api/stream/sessions/route.js` — GET: list active FastAPI streaming sessions

### Step 3.3 — Streaming UI Components
- [x] `src/components/streaming/StreamStatusPanel.jsx` — Dashboard panel showing active streams, status dots, regime labels, prices, SSE mode badges
- [x] `src/components/streaming/LiveBadge.jsx` — Pulsing "LIVE" indicator badge (green when connected)
- [x] `src/components/streaming/AlertHistory.jsx` — Scrolling regime-change alert list with severity badges (critical/warning/info), time formatting, clear button

### Step 3.4 — Streaming Integration Points
- [x] Navbar: Stream indicator (pulsing dot + stream count badge)
- [x] TickerCard: "Go Live" button → subscribes via StreamContext
- [x] Dashboard: StreamStatusPanel + AlertHistory shown alongside ticker cards
- [x] Portfolio page: Real-time stream state for per-symbol breakdown

### Phase 3 Deliverables
- Complete SSE streaming pipeline (seed → connect → tick → receive)
- Multi-symbol streaming with shared context
- Automatic SSE→polling fallback on connectivity issues
- Real-time regime change alert system with severity levels
- Streaming status visible across Dashboard, Portfolio, and Navbar

---

## Phase 4: Simulation & Portfolio ✅

> Monte Carlo simulation and aggregated portfolio risk view. (v2.1)

### Step 4.1 — Monte Carlo Simulation
- [x] `src/components/simulation/SimulationPanel.jsx` — Configurable simulation:
  - Parameters: horizon (1–252 bars), n_paths (50–5000), seed (reproducibility)
  - Metric cards: median return, 5th/95th percentile, worst path, VaR
  - Regime transition matrix display (4×4)
  - Risk multiplier bar chart (16 regimes)
  - One-click "Run Simulation" with loading state
- [x] `src/components/simulation/PriceFanChart.jsx` — Recharts AreaChart with p5/p25/median/p75/p95 percentile bands, gradient fills, custom tooltip
- [x] `src/components/simulation/SimulatePage.jsx` — Standalone simulation page:
  - 8 popular symbol quick-select buttons
  - Active stream symbols for convenience
  - Custom symbol input with "Load" button
  - Price data fetching from Yahoo Finance (1y period)
  - Validation: minimum 81 bars required
  - Error handling with retry

### Step 4.2 — Portfolio Overview
- [x] `src/components/portfolio/PortfolioOverview.jsx` — Aggregated portfolio view:
  - Risk Flags Banner: high-risk count, concentration risk, regime divergence, active alerts
  - Portfolio Stats: VaR 95, active symbols, high risk count, concentration flag
  - Symbol Breakdown Table: regime, risk multiplier (visual bar), Kelly size, VaR 95, stream status
  - Regime Alerts: Recent alerts from streaming with severity badges
  - Auto-refresh toggle (30s interval) + manual refresh button
  - Empty state when no active streams ("Start streaming symbols from Dashboard")

### Step 4.3 — BFF Simulation & Portfolio Routes
- [x] `src/app/api/simulate/route.js` — POST: proxy to FastAPI `/simulate/{symbol}` with prices + simulation params
- [x] `src/app/api/portfolio/route.js` — GET: proxy to FastAPI `/portfolio` with optional symbol filter + Kelly params

### Step 4.4 — Simulation Integration Points
- [x] TickerCard: New collapsible "Monte Carlo Simulation" section with embedded SimulationPanel
- [x] SearchResults: Toggleable simulation section
- [x] PortfolioAnalysisCard: Simulation accordion in Orders page
- [x] Navbar: "Simulate" and "Portfolio" tabs added
- [x] Keyboard shortcuts updated: Ctrl+3=Simulate, Ctrl+4=Portfolio

### Step 4.5 — FastAPI Backend Endpoints Used
- `POST /simulate/{symbol}` — Monte Carlo regime transition simulation
  - Input: prices, horizon, n_paths, seed, current_price
  - Output: price fan (percentile paths), risk metrics, regime occupancy, transition matrix
- `GET /portfolio` — Multi-symbol aggregated risk view
  - Input: symbols (optional), kelly_fraction, target_vol
  - Output: per-symbol breakdowns, risk flags, portfolio VaR, concentration flag

### Phase 4 Deliverables
- Monte Carlo simulation with configurable parameters and price fan chart
- Portfolio overview with risk flags, stats, and per-symbol breakdown
- Simulation accessible from 4 places: TickerCard, SearchResults, PortfolioAnalysisCard, SimulatePage
- Portfolio auto-refreshes from active stream data
- All BFF routes proxy to FastAPI backend

---

## Phase 5: Correlation + Optimization ✅

> Portfolio-level intelligence — "my assets are all moving together, reduce exposure." (v3.0)

### Step 5.1 — FastAPI Client Functions
- [x] `detectCorrelation(symbols, returnsMatrix, options)` → POST `/correlation/detect`
  - Input: symbols array, returns_matrix (symbol → returns array), window, kelly_fraction, target_vol
  - Output: correlation_regime, mean_abs_rho, correlation_matrix, blended_risk_multiplier
- [x] `optimisePortfolio(symbols, returnsMatrix, options)` → POST `/optimise/full`
  - Input: symbols array, returns_matrix, current_weights, kelly_fraction, target_vol, max_dd
  - Output: optimal_weights, regime_adjusted_weights, exposure_scalar, drawdown_constraint

### Step 5.2 — BFF Proxy Routes
- [x] `src/app/api/correlation/detect/route.js` — POST: proxy to FastAPI `/correlation/detect`
- [x] `src/app/api/optimise/full/route.js` — POST: proxy to FastAPI `/optimise/full`

### Step 5.3 — CorrelationCard Component
- [x] `src/components/portfolio/CorrelationCard.jsx` — Correlation detection display:
  - Correlation regime label (low_corr / mid_corr / high_corr / crisis) with color-coded badge
  - Mean |ρ| with color coding (green < 0.4, yellow 0.4–0.7, red > 0.7)
  - Correlation heatmap — n×n matrix with cell coloring by |ρ| magnitude
  - Blended risk multiplier — portfolio-level risk scalar display
  - "Detect" button with loading state
  - Empty state when < 2 symbols subscribed

### Step 5.4 — OptimizerCard Component
- [x] `src/components/portfolio/OptimizerCard.jsx` — Portfolio weight optimization display:
  - Current vs. optimal weights — Recharts grouped BarChart comparing actual vs recommended
  - Regime-adjusted weights — after per-asset risk multiplier (3rd bar series)
  - Drawdown constraint — alert showing within/breach status with current DD vs max DD
  - Exposure scalar — how much gross exposure allowed (100% low_corr, 50% crisis)
  - Detailed weights table with delta column (green = increase, red = decrease)
  - Key metrics row: Exposure Scalar, DD Constraint, Corr Regime, Symbols count
  - "Optimize" button with loading state

### Step 5.5 — Portfolio Overview Integration
- [x] `src/components/portfolio/PortfolioOverview.jsx` — Enhanced with correlation + optimization:
  - Returns matrix computation from Yahoo Finance prices (fetched per symbol, 1y period)
  - Current weights derivation (from Kelly sizing or equal-weight fallback)
  - CorrelationCard embedded as collapsible section with regime badge in title
  - OptimizerCard embedded as collapsible section with exposure/DD badges in title
  - RiskFlagsBanner enhanced: new correlation risk flags (crisis/high_corr warnings)
  - PortfolioStats enhanced: 6-column grid with new Corr Regime + Exposure stats
  - "CORRELATION & OPTIMIZATION" divider section
  - v3.0 version badge in header

### Step 5.6 — Footer Updated
- [x] Version bumped to v3.0
- [x] New feature badges: Correlation, Optimizer, Corr Detection, Weight Optimizer

### Phase 5 Deliverables
- Correlation regime detection with heatmap visualization and blended risk multiplier
- Portfolio weight optimizer with current vs optimal vs regime-adjusted comparison
- Drawdown constraint monitoring with breach alerts
- Exposure scalar display (100% → 50% based on correlation regime)
- All components integrated into Portfolio View as collapsible sections
- 2 new BFF proxy routes, 2 new FastAPI client functions, 2 new UI components

---

## Current File Structure

```
src/
├── app/
│   ├── layout.js                          # ClerkProvider + DaisyUI theme
│   ├── page.js                            # Home: <Show /> auth gate + view router
│   ├── globals.css                        # DaisyUI plugin + custom noble theme
│   ├── sign-in/[[...sign-in]]/page.js     # Clerk sign-in page
│   ├── sign-up/[[...sign-up]]/page.js     # Clerk sign-up page
│   └── api/
│       ├── health/route.js                # FastAPI health proxy
│       ├── prices/route.js                # Yahoo Finance price fetcher
│       ├── analyse/route.js               # BFF: prices → FastAPI analysis
│       ├── commentary/route.js            # LLM market commentary
│       ├── simulate/route.js              # BFF: Monte Carlo simulation
│       ├── portfolio/route.js             # BFF: portfolio aggregation
│       ├── correlation/
│       │   └── detect/route.js            # BFF: correlation detection (v3.0)
│       ├── optimise/
│       │   └── full/route.js              # BFF: portfolio optimization (v3.0)
│       ├── alpaca/
│       │   ├── account/route.js           # Alpaca account info
│       │   ├── orders/
│       │   │   ├── route.js               # GET order history
│       │   │   └── create/route.js        # POST place order
│       │   └── positions/route.js         # GET open positions
│       ├── clerk/
│       │   ├── alpaca-keys/route.js       # GET/POST Alpaca keys
│       │   └── alpaca-keys-status/route.js # GET key status
│       └── stream/
│           ├── seed/route.js              # POST: seed streaming session
│           ├── tick/route.js              # POST: push price tick
│           ├── latest-price/route.js      # GET: fetch latest Yahoo price
│           └── sessions/route.js          # GET: list active sessions
├── components/
│   ├── Navbar.jsx                         # Navigation + health + streams + theme
│   ├── Footer.jsx                         # Sticky footer with badges
│   ├── dashboard/
│   │   ├── Dashboard.jsx                  # 3-ticker dashboard container
│   │   ├── TickerCard.jsx                 # Per-ticker card with analysis
│   │   ├── ComparisonTable.jsx            # Side-by-side metric comparison
│   │   └── RegimeSummaryBanner.jsx        # Quick-glance regime pills
│   ├── analysis/
│   │   ├── RegimeCard.jsx                 # HMM regime display
│   │   ├── ObservationFeatures.jsx        # 24-feature vector
│   │   ├── RiskCard.jsx                   # VaR/CVaR/drawdown metrics
│   │   ├── RecommendationsCard.jsx        # Position sizing + action alerts
│   │   ├── PriceChart.jsx                 # Recharts area chart
│   │   └── CommentaryCard.jsx             # AI market commentary
│   ├── orders/
│   │   ├── OrdersPage.jsx                 # Orders & portfolio container
│   │   ├── AlpacaKeySetup.jsx             # API key configuration modal
│   │   ├── AccountSummary.jsx             # Account stats
│   │   ├── OrderHistory.jsx               # Filterable order table
│   │   ├── OpenPositions.jsx              # Position table with P&L
│   │   ├── OrderModal.jsx                 # Buy/sell execution modal
│   │   ├── PortfolioAnalysis.jsx          # Regime analysis for positions
│   │   └── PortfolioAnalysisCard.jsx      # Analysis card + simulation
│   ├── search/
│   │   ├── SearchPage.jsx                 # Symbol search + popular tickers
│   │   └── SearchResults.jsx              # Full analysis layout
│   ├── simulation/
│   │   ├── SimulatePage.jsx               # Standalone simulation page
│   │   ├── SimulationPanel.jsx            # Configurable MC simulation
│   │   └── PriceFanChart.jsx              # Percentile band chart
│   ├── portfolio/
│   │   ├── PortfolioOverview.jsx          # Aggregated portfolio view + correlation + optimizer
│   │   ├── CorrelationCard.jsx            # Correlation regime + heatmap (v3.0)
│   │   └── OptimizerCard.jsx              # Weight optimizer + DD constraint (v3.0)
│   ├── streaming/
│   │   ├── StreamStatusPanel.jsx          # Active streams dashboard
│   │   ├── LiveBadge.jsx                  # Pulsing LIVE indicator
│   │   └── AlertHistory.jsx              # Regime change alert list
│   └── shared/
│       ├── LoadingSkeleton.jsx            # DaisyUI skeleton states
│       ├── ErrorState.jsx                 # Error alert with retry
│       ├── EmptyState.jsx                 # Empty state placeholder
│       └── ThemeSwitcher.jsx              # 6-theme dropdown
├── context/
│   └── StreamContext.jsx                  # Global streaming state provider
├── hooks/
│   └── useStreamPrice.js                  # Per-symbol SSE streaming hook
└── lib/
    ├── fastapi-client.js                  # FastAPI fetch wrapper (all endpoints)
    ├── alpaca-client.js                   # Alpaca API proxy helpers
    ├── clerk-metadata.js                  # Clerk privateMetadata helpers
    └── cache.js                           # In-memory cache with TTL
```

---

## Environment Variables

```env
# .env.local

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# FastAPI Backend
NEXT_PUBLIC_FASTAPI_BASE_URL=https://noble-trader-fastapi-backend.onrender.com

# Alpaca (used server-side only — also stored in Clerk privateMetadata)
ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets/v2

# Database
DATABASE_URL=file:./db/custom.db
```

---

## FastAPI Backend — Endpoint Mapping

| Frontend Need | BFF Route | FastAPI Endpoint | Phase |
|---|---|---|---|
| Dashboard analysis (3 tickers) | `POST /api/analyse` | `POST /analyse/full` | 1 |
| Individual regime check | `POST /api/analyse` | `POST /regime/detect` | 1 |
| Kelly sizing only | `POST /api/analyse` | `POST /size/kelly` | 1 |
| Risk metrics only | `POST /api/analyse` | `POST /risk/analyse` | 1 |
| Backend health | `GET /api/health` | `GET /health` | 1 |
| Price data | `GET /api/prices` | — (Yahoo Finance) | 1 |
| AI commentary | `POST /api/commentary` | — (z-ai-web-dev-sdk) | 1 |
| Stream: seed session | `POST /api/stream/seed` | `POST /stream/seed` | 3 |
| Stream: push tick | `POST /api/stream/tick` | `POST /stream/tick` | 3 |
| Stream: latest price | `GET /api/stream/latest-price` | — (Yahoo Finance) | 3 |
| Stream: list sessions | `GET /api/stream/sessions` | `GET /stream/sessions` | 3 |
| Stream: SSE subscribe | — (client-side EventSource) | `GET /sse/{symbol}` | 3 |
| Stream: SSE alerts | — (client-side EventSource) | `GET /sse/alerts` | 3 |
| Monte Carlo simulation | `POST /api/simulate` | `POST /simulate/{symbol}` | 4 |
| Portfolio aggregation | `GET /api/portfolio` | `GET /portfolio` | 4 |
| Correlation detection | `POST /api/correlation/detect` | `POST /correlation/detect` | 5 |
| Portfolio optimization | `POST /api/optimise/full` | `POST /optimise/full` | 5 |

---

## Alpaca Markets — API Mapping

| Frontend Need | BFF Route | Alpaca Endpoint | Method |
|---|---|---|---|
| Account info | `GET /api/alpaca/account` | `GET /v2/account` | Paper |
| Order history | `GET /api/alpaca/orders` | `GET /v2/orders` | Paper |
| Place order | `POST /api/alpaca/orders/create` | `POST /v2/orders` | Paper |
| Open positions | `GET /api/alpaca/positions` | `GET /v2/positions` | Paper |

---

## Security: Clerk PrivateMetadata — Alpaca Key Flow

```
┌──────────┐     POST /api/clerk/alpaca-keys      ┌──────────────┐
│  Browser  │ ──────────────────────────────────▶  │  Next.js BFF  │
│  (React)  │     { api_key, secret_key }          │  (Server)     │
└──────────┘                                       └──────┬───────┘
                                                          │ clerkClient
                                                          │ .updateUserMetadata()
                                                          ▼
                                                   ┌──────────────┐
                                                   │  Clerk Server  │
                                                   │  privateMetadata│
                                                   │  {             │
                                                   │   alpaca_api_key│
                                                   │   alpaca_secret │
                                                   │  }              │
                                                   └──────────────┘
```

**Security guarantee**: Alpaca API keys are NEVER exposed to the browser. They are stored in Clerk `privateMetadata` (backend-only) and read server-side to proxy Alpaca API calls.

---

## DaisyUI Component Usage Map

| UI Element | DaisyUI Component | Phase |
|---|---|---|
| Page layout | `navbar` + `footer` | 1 |
| Auth gate | Clerk `<Show />` | 1 |
| Navigation tabs | `tab` | 1 |
| Theme switcher | `dropdown` | 1 |
| Ticker cards | `card` + `card-body` | 2 |
| Collapsible sections | `collapse` | 2 |
| Probability bars | `progress` | 2 |
| Confidence circle | `radial-progress` | 2 |
| Key metrics | `stats` + `stat` | 2 |
| Status badges | `badge` | 2 |
| Alerts | `alert` | 2 |
| Buttons | `btn` | 2 |
| Period filters | `btn-group` | 2 |
| Tables | `table` | 2 |
| Modal dialogs | `modal` | 2 |
| Loading states | `skeleton` | 2 |
| Search input | `input` + `btn` | 2 |
| Ticker chips | `btn` (sm) | 2 |
| Streaming indicator | `badge` + animate-ping | 3 |
| Simulation config | `input`, `select`, `range` | 4 |
| Correlation heatmap | `table` + inline styles | 5 |
| Weight comparison | Recharts `BarChart` | 5 |

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | JavaScript (JSX) | User requirement — no TypeScript |
| CSS Framework | DaisyUI v5 ONLY | User requirement — no shadcn/ui |
| Auth | Clerk v7 + `<Show />` | Declarative auth gating |
| Alpaca Key Storage | Clerk privateMetadata | Backend-only, never exposed to frontend |
| Price Data | Yahoo Finance (server-side) | Free, no API key needed, reliable |
| Analysis | FastAPI `/analyse/full` | Single endpoint for regime + sizing + risk |
| State Management | React useState + useEffect + Context | Simple — no Zustand needed for this scope |
| Streaming | SSE (EventSource) with tick fallback | Direct SSE preferred, auto-fallback on CORS |
| Caching | In-memory with TTL | Lightweight, no Redis needed |
| Charts | Recharts | Already installed, works with DaisyUI |
| Order Execution | BFF proxy to Alpaca | Keys stay server-side via Clerk privateMetadata |
| AI Commentary | z-ai-web-dev-sdk (LLM) | Backend-only, no client API key exposure |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Render cold starts (30-60s) | Loading skeletons + retry with exponential backoff |
| Yahoo Finance rate limits | Server-side caching (5-min TTL) |
| SSE CORS failures | Auto-fallback to tick polling mode |
| Alpaca paper trading latency | Optimistic UI updates + error rollback |
| Clerk privateMetadata 8KB limit | Store only 2 fields (api_key, secret_key) |
| DaisyUI theme inconsistencies | Test all 6 themes during development |
| CORS issues with FastAPI | BFF pattern avoids direct browser → FastAPI calls |

---

## Phase Completion Status

| Phase | Description | Status | Version |
|---|---|---|---|
| **Phase 1** | Foundation & BFF API Layer | ✅ Complete | v1.0 |
| **Phase 2** | Dashboard, Search & Analysis | ✅ Complete | v1.0 |
| **Phase 3** | Streaming & Real-Time | ✅ Complete | v2.0 |
| **Phase 4** | Simulation & Portfolio | ✅ Complete | v2.1 |
| **Phase 5** | Correlation + Optimization | ✅ Complete | v3.0 |
