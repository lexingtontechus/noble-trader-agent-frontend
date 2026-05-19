# Noble Trader — Frontend Step-by-Step Plan Outline

> **Stack**: Next.js 16 (App Router) · JavaScript (JSX only) · DaisyUI v5 · Clerk Auth v7  
> **Backend**: FastAPI @ `https://noble-trader-fastapi-backend.onrender.com`  
> **Trading**: Alpaca Paper Trading API  
> **Constraint**: ONLY DaisyUI for all CSS & components — no shadcn/ui, no custom Tailwind classes for UI elements

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │  Home /   │  │Dashboard │  │  Orders /  │  │  Search   │  │
│  │  SignIn   │  │  (3 Ticker│  │  Portfolio │  │  (Ticker  │  │
│  │  (Clerk)  │  │  cards)  │  │  History)  │  │  Analysis)│  │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  │
│        │             │              │               │         │
│  ┌─────▼─────────────▼──────────────▼───────────────▼─────┐  │
│  │              BFF API Routes (/api/*)                     │  │
│  │  /api/analyse  /api/prices  /api/alpaca/*  /api/health  │  │
│  └───────┬──────────────┬──────────────┬───────────────────┘  │
│          │              │              │                       │
└──────────┼──────────────┼──────────────┼───────────────────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────────┐
    │  FastAPI    │ │   Yahoo    │ │  Alpaca Markets  │
    │  Backend    │ │   Finance  │ │  Paper Trading   │
    │  (Render)   │ │   (Prices) │ │  (Orders/Acct)   │
    └─────────────┘ └────────────┘ └──────────────────┘
```

### Data Flow

1. **Price Data**: Yahoo Finance → `/api/prices` → Frontend
2. **Analysis**: Yahoo Finance prices → `/api/analyse` → FastAPI `/analyse/full` → Frontend
3. **Orders**: Clerk privateMetadata (Alpaca keys) → `/api/alpaca/*` → Alpaca API → Frontend
4. **Auth**: Clerk `<Show />` gates all protected content

---

## Phase 1: Project Foundation & Tooling

### Step 1.1 — Convert to JSX Mode
- [ ] Rename all `.tsx`/`.ts` files in `src/` to `.jsx`/`.js`
- [ ] Update `tsconfig.json` → set `allowJs: true`, `jsx: "preserve"`, `noImplicitAny: false`
- [ ] Remove strict TypeScript enforcement from `next.config.ts`
- [ ] Delete `src/components/ui/` (all 48 shadcn/ui components — replaced by DaisyUI)
- [ ] Update `jsconfig.json` or `tsconfig.json` path aliases for `.js` imports

### Step 1.2 — Install & Configure DaisyUI v5
- [ ] Install: `bun add daisyui@latest`
- [ ] Remove shadcn/ui dependencies from `package.json` (all `@radix-ui/*`, `class-variance-authority`, `cmdk`, etc.)
- [ ] Configure DaisyUI as Tailwind CSS v4 plugin in `src/app/globals.css`:
  ```css
  @import "tailwindcss";
  @plugin "daisyui" {
    themes: dark --default, light, cupcake, business, synthwave, nord;
  }
  ```
- [ ] Remove all shadcn CSS variables (`--background`, `--foreground`, `--card`, etc.) from `globals.css`
- [ ] Remove `tailwind.config.ts` (Tailwind v4 uses CSS-based config)
- [ ] Create custom "noble" DaisyUI theme with gold/amber primary, slate secondary

### Step 1.3 — Install & Configure Clerk Auth v7
- [ ] Install: `bun add @clerk/nextjs`
- [ ] Copy Clerk keys from `upload/.env` to root `.env.local`:
  ```
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
  CLERK_SECRET_KEY=sk_test_...
  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
  NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
  ```
- [ ] Create `src/middleware.js` — Clerk middleware with route protection
- [ ] Wrap app in `<ClerkProvider>` in `src/app/layout.js`
- [ ] Create `src/app/sign-in/[[...sign-in]]/page.js` — Clerk sign-in page
- [ ] Create `src/app/sign-up/[[...sign-up]]/page.js` — Clerk sign-up page

### Step 1.4 — Project Cleanup
- [ ] Remove unused dependencies: `next-auth`, `@radix-ui/*`, `class-variance-authority`, `cmdk`, `tailwindcss-animate`, `tw-animate-css`, `sonner`, `vaul`, `input-otp`
- [ ] Remove `src/hooks/use-toast.ts`, `src/hooks/use-mobile.ts` (replaced by DaisyUI)
- [ ] Remove `src/lib/utils.ts` (cn() not needed — DaisyUI uses class names directly)
- [ ] Clean `src/app/api/route.js` — replace hello-world with health check
- [ ] Add `ALPACA_PAPER_BASE_URL` to `.env.local`

### Deliverables
- Clean Next.js 16 project running in JSX mode
- DaisyUI v5 with custom "noble" dark theme
- Clerk auth with sign-in/sign-up routes
- Zero shadcn/ui remnants

---

## Phase 2: Layout & Navigation Shell

### Step 2.1 — Root Layout with ClerkProvider & DaisyUI
- [ ] `src/app/layout.js` — Wire `<ClerkProvider>`, set `data-theme="noble"` on `<html>`, load Inter font
- [ ] `src/app/globals.css` — DaisyUI plugin + custom theme colors + minimal global styles

### Step 2.2 — Navbar Component
- [ ] `src/components/Navbar.jsx` — DaisyUI navbar with:
  - Logo + "Noble Trader" title
  - Navigation tabs: Dashboard | Orders | Search (DaisyUI `tab` component)
  - Theme switcher dropdown (DaisyUI `dropdown` + `theme` selector)
  - Clerk `<Show when="signed-in">` → UserButton + avatar
  - Clerk `<Show when="signed-out">` → SignInButton
  - Backend health indicator pill (DaisyUI `badge`)

### Step 2.3 — Footer Component
- [ ] `src/components/Footer.jsx` — DaisyUI footer, sticky to bottom:
  - Disclaimer text
  - Feature tags (DaisyUI `badge`)
  - Alpaca paper-trading notice
  - Version info

### Step 2.4 — Sidebar / Drawer (Mobile)
- [ ] `src/components/MobileDrawer.jsx` — DaisyUI `drawer` component:
  - Hamburger toggle (visible on mobile only)
  - Navigation links
  - Quick ticker shortcuts

### Step 2.5 — Page Router (Single-Page App Pattern)
- [ ] `src/app/page.js` — Main entry, uses client-side state to switch views:
  - `activeView` state: `"dashboard"` | `"orders"` | `"search"`
  - Clerk `<Show when="signed-out">` → `<SignIn />` component
  - Clerk `<Show when="signed-in">` → Dashboard / Orders / Search based on `activeView`
  - Animated view transitions with DaisyUI `animate-` classes

### Deliverables
- Complete layout shell with navbar, footer, mobile drawer
- Clerk auth gating via `<Show />` on home page
- View navigation working (tab-based SPA)

---

## Phase 3: BFF API Layer (Backend-for-Frontend)

### Step 3.1 — FastAPI Client Utility
- [ ] `src/lib/fastapi-client.js` — Centralized fetch wrapper:
  ```js
  const FASTAPI_BASE = "https://noble-trader-fastapi-backend.onrender.com";
  
  export async function analyseFull(prices, symbol) { ... }
  export async function detectRegime(prices, symbol) { ... }
  export async function sizeKelly(prices, symbol, options) { ... }
  export async function analyseRisk(prices, symbol, options) { ... }
  ```
- [ ] Handle Render cold-start timeouts (retry with backoff)
- [ ] Error handling with custom error classes

### Step 3.2 — Price Data API Route
- [ ] `src/app/api/prices/route.js` — Server-side Yahoo Finance fetch:
  - GET params: `symbol`, `period` (6m/1y/2y)
  - Uses `yahoo-finance2` to fetch historical closes
  - Returns `{ prices: number[], symbol, period }`
  - Minimum 81 prices enforced (pad if needed)

### Step 3.3 — Analysis BFF Route
- [ ] `src/app/api/analyse/route.js` — Orchestrates price fetch + FastAPI call:
  - POST body: `{ symbol, period, kelly_fraction, target_vol, base_risk_limit }`
  - 1) Fetch prices from Yahoo Finance
  - 2) Forward to FastAPI `/analyse/full`
  - 3) Return combined `{ prices, analysis: FullAnalysisResponse }`
  - Caching: in-memory cache with 5-min TTL per symbol+period

### Step 3.4 — Health Check Route
- [ ] `src/app/api/health/route.js` — Proxies FastAPI `/health`:
  - Returns `{ status, latency_ms, backend: "online"|"offline" }`

### Step 3.5 — Alpaca API Routes (Order Execution)
- [ ] `src/app/api/alpaca/account/route.js` — GET account info:
  - Reads Alpaca API key + secret from Clerk privateMetadata
  - Proxies to `https://paper-api.alpaca.markets/v2/account`
  - Returns account details (buying power, cash, equity, etc.)

- [ ] `src/app/api/alpaca/orders/route.js` — GET order history:
  - Reads Alpaca credentials from Clerk privateMetadata
  - Proxies to `https://paper-api.alpaca.markets/v2/orders`
  - Query params: `status`, `after` (date filter for 1m/3m/6m/1y)
  - Returns order list

- [ ] `src/app/api/alpaca/orders/create/route.js` — POST place order:
  - Reads Alpaca credentials from Clerk privateMetadata
  - Validates request body: `{ symbol, qty, side: "buy"|"sell", type: "market", time_in_force: "day" }`
  - Proxies to `https://paper-api.alpaca.markets/v2/orders`
  - Returns order confirmation
  - Default qty: 100

- [ ] `src/app/api/alpaca/positions/route.js` — GET open positions:
  - Reads Alpaca credentials from Clerk privateMetadata
  - Proxies to `https://paper-api.alpaca.markets/v2/positions`
  - Returns current positions

### Step 3.6 — Clerk Private Metadata Routes
- [ ] `src/app/api/clerk/alpaca-keys/route.js` — GET/POST:
  - **GET**: Reads `alpaca_api_key` and `alpaca_secret_key` from Clerk `privateMetadata`
  - **POST**: Writes `alpaca_api_key` and `alpaca_secret_key` to Clerk `privateMetadata`
  - Uses `clerkClient.users.updateUserMetadata()` on server side only
  - Frontend NEVER has direct access to these keys

- [ ] `src/app/api/clerk/alpaca-keys-status/route.js` — GET:
  - Returns `{ configured: boolean }` — whether Alpaca keys are set
  - Does NOT expose the actual keys

### Deliverables
- Complete BFF API layer with 8 routes
- FastAPI integration with cold-start handling
- Alpaca proxy routes secured via Clerk privateMetadata
- In-memory caching for analysis results

---

## Phase 4: Dashboard Page (3 Default Tickers)

### Step 4.1 — Dashboard Container
- [ ] `src/components/dashboard/Dashboard.jsx` — Main dashboard component:
  - Fetches analysis for 3 default tickers: Gold (GC=F), Bitcoin (BTC-USD), USD/EUR (EURUSD=X)
  - Period selector: 6M / 1Y / 2Y (DaisyUI `btn-group`)
  - Auto-refresh toggle with 2-minute interval
  - Last-updated timestamp
  - Comparison table button

### Step 4.2 — Ticker Card Component
- [ ] `src/components/dashboard/TickerCard.jsx` — DaisyUI `card` per ticker:
  - Header: Symbol name + current price + ▲/▼ return indicator (DaisyUI `badge`)
  - Price chart (DaisyUI-styled Recharts area chart)
  - Collapsible sections (DaisyUI `collapse`):
    - Regime State
    - HMM Observation Features
    - Risk Metrics & Recommendations

### Step 4.3 — Regime State Section
- [ ] `src/components/analysis/RegimeCard.jsx` — DaisyUI `card` inside collapse:
  - Regime label (DaisyUI `badge` with color coding):
    - `low_vol_bull` → `badge-success`
    - `medium_vol_bull` → `badge-info`
    - `high_vol_bear` → `badge-error`
  - Volatility state + probability bars (DaisyUI `progress`)
  - Trend state + probability bars (DaisyUI `progress`)
  - Confidence score (DaisyUI `radial-progress`)
  - Risk multiplier (DaisyUI `stat`)
  - Bars fitted count

### Step 4.4 — HMM Observation Features Section
- [ ] `src/components/analysis/ObservationFeatures.jsx` — DaisyUI `card` inside collapse:
  - 24-feature vector display organized by category:
    - Returns (0-2): log returns 1/3/10 bar
    - Volatility (3-5): normalized ATR, rolling vol, EMA distance
    - Derived (6-9): HHLL score, vol percentile, ATR ratio, vol slope
    - HMM Raw (10-13): state posteriors
    - Markov (14-19): vol/trend probability buckets
    - Quality (20-21): regime quality, state confidence
    - Position (22-23): Masaniello pressure, drawdown factor
  - DaisyUI `progress` bars for each feature value
  - Feature index labels for RL/ML downstream reference

### Step 4.5 — Risk & Recommendations Section
- [ ] `src/components/analysis/RiskCard.jsx` — DaisyUI `card` inside collapse:
  - Key metrics in DaisyUI `stat` components:
    - VaR 95% / 99%
    - CVaR 95% / 99%
    - Max Drawdown
    - Annual Vol / Return
    - Sortino / Calmar ratios
  - Stop-loss & Take-profit levels (DaisyUI `alert` with color)
  - Risk budget used (DaisyUI `progress`)
  - Notes list (DaisyUI `list`)

- [ ] `src/components/analysis/RecommendationsCard.jsx` — DaisyUI `card`:
  - Position size recommendation (`recommended_f` as percentage)
  - Regime-based action: AGGRESSIVE / MODERATE / DEFENSIVE (DaisyUI `alert`)
  - Suggested stop/TP levels
  - Analysis notes from FastAPI

### Step 4.6 — Price Chart Component
- [ ] `src/components/analysis/PriceChart.jsx` — Recharts `AreaChart`:
  - Gradient fill matching regime color
  - Tooltip with price + date
  - Responsive container
  - Regime color overlay bands (optional enhancement)

### Step 4.7 — Comparison Table
- [ ] `src/components/dashboard/ComparisonTable.jsx` — DaisyUI `table`:
  - Side-by-side comparison of 3 tickers across 11+ metrics:
    - Regime, Risk Multiplier, VaR 95%, CVaR 95%, Max DD,
    - Annual Return/Vol, Sharpe, Sortino, Calmar, Recommended Position
  - Color-coded cells (best = success, worst = error)

### Step 4.8 — Regime Summary Banner
- [ ] `src/components/dashboard/RegimeSummaryBanner.jsx` — Top-of-page banner:
  - 3 DaisyUI `badge` pills showing each ticker's regime at a glance
  - Color-coded: green=bull, red=bear, yellow=neutral
  - Quick visual scan before scrolling into details

### Deliverables
- Complete dashboard with 3 default tickers
- Full regime, HMM features, risk, and recommendations display
- Period selector, auto-refresh, comparison table
- All components using ONLY DaisyUI classes

---

## Phase 5: Orders / Portfolio Page

### Step 5.1 — Orders Container
- [ ] `src/components/orders/OrdersPage.jsx` — Main orders page:
  - Period filter: 1M / 3M / 6M / 1Y (DaisyUI `btn-group`)
  - Order history table (DaisyUI `table`)
  - Open positions section
  - Account summary card

### Step 5.2 — Alpaca Key Setup Modal
- [ ] `src/components/orders/AlpacaKeySetup.jsx` — DaisyUI `modal`:
  - Shown when Alpaca keys are NOT configured (checked via `/api/clerk/alpaca-keys-status`)
  - Two input fields: API Key, Secret Key (DaisyUI `input`)
  - Save button → POST `/api/clerk/alpaca-keys`
  - Security notice: keys stored in Clerk privateMetadata (server-only)
  - Link to Alpaca paper trading signup

### Step 5.3 — Account Summary Card
- [ ] `src/components/orders/AccountSummary.jsx` — DaisyUI `card` + `stats`:
  - Equity, Cash, Buying Power, Long Market Value, Short Market Value
  - Account status badge
  - Pattern Day Trader flag

### Step 5.4 — Order History Table
- [ ] `src/components/orders/OrderHistory.jsx` — DaisyUI `table`:
  - Columns: Date, Symbol, Side (buy/sell badge), Type, Qty, Status, Filled Price
  - Filtered by period selector
  - Status badges: `filled` → success, `pending` → warning, `canceled` → error
  - Empty state with link to search page

### Step 5.5 — Open Positions Table
- [ ] `src/components/orders/OpenPositions.jsx` — DaisyUI `table`:
  - Columns: Symbol, Qty, Avg Entry Price, Current Price, Market Value, Unrealized P&L
  - P&L colored green/red (DaisyUI `text-success` / `text-error`)

### Step 5.6 — Buy/Sell Order Modal
- [ ] `src/components/orders/OrderModal.jsx` — DaisyUI `modal`:
  - Triggered from Search page or Orders page
  - Fields:
    - Symbol (read-only, pre-filled)
    - Side: Buy / Sell (DaisyUI `toggle` or `btn-group`)
    - Quantity: number input, default 100 (DaisyUI `input`)
    - Order Type: Market (default), Limit (DaisyUI `select`)
    - If Limit: Limit Price input (DaisyUI `input`)
    - Time in Force: Day (default), GTC (DaisyUI `select`)
  - Confirmation step with order summary
  - Submit → POST `/api/alpaca/orders/create`
  - Success/error toast (DaisyUI `toast`)
  - Risk warning alert (DaisyUI `alert-warning`)

### Step 5.7 — Portfolio Analysis Section
- [ ] `src/components/orders/PortfolioAnalysis.jsx` — Regime analysis for held positions:
  - For each open position, fetch regime + risk analysis
  - Display mini RegimeCard + RiskCard per position
  - Aggregate portfolio risk metrics
  - Position sizing recommendations per holding

### Deliverables
- Complete orders/portfolio page
- Alpaca key setup flow via Clerk privateMetadata
- Order history with period filters
- Buy/sell order execution modal
- Portfolio analysis with regime/risk overlay

---

## Phase 6: Search Page (Ticker Analysis)

### Step 6.1 — Search Container
- [ ] `src/components/search/SearchPage.jsx` — Main search page:
  - Search input with Enter key support (DaisyUI `input` + `btn`)
  - Period filter: 6M / 1Y / 2Y (DaisyUI `btn-group`)
  - Popular tickers grid (DaisyUI `btn` chips): AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, SPY, QQQ, DIA, IWM, GLD, SLV, BTC-USD, ETH-USD, EURUSD=X
  - Recent searches (localStorage, max 8) (DaisyUI `badge` with × close)

### Step 6.2 — Search Results Layout
- [ ] `src/components/search/SearchResults.jsx` — Two-column layout:
  - Left: Price chart + regime summary
  - Right: Full analysis pipeline (regime + HMM features + risk + recommendations)
  - Buy/Sell button → opens OrderModal
  - Add to watchlist button

### Step 6.3 — Ticker Analysis Display
- [ ] Reuse analysis components from Phase 4:
  - RegimeCard
  - ObservationFeatures
  - RiskCard
  - RecommendationsCard
  - PriceChart
  - Buy/Sell button with DaisyUI `btn-success` / `btn-error`

### Deliverables
- Complete search page with symbol lookup
- Full analysis pipeline for any ticker
- Quick-select popular tickers
- Recent search history
- Buy/sell integration from search results

---

## Phase 7: Shared Components & Hooks

### Step 7.1 — Custom Hooks
- [ ] `src/hooks/useAnalysis.js` — Fetch & cache `/api/analyse` results
- [ ] `src/hooks/useAlpacaAccount.js` — Fetch Alpaca account info
- [ ] `src/hooks/useOrders.js` — Fetch order history with period filter
- [ ] `src/hooks/usePositions.js` — Fetch open positions
- [ ] `src/hooks/useAlpacaKeys.js` — Check/set Alpaca key status
- [ ] `src/hooks/useHealthCheck.js` — Poll FastAPI backend health
- [ ] `src/hooks/usePriceAlerts.js` — Browser notification price alerts with localStorage

### Step 7.2 — Shared UI Components
- [ ] `src/components/shared/LoadingSkeleton.jsx` — DaisyUI `skeleton` loading states
- [ ] `src/components/shared/ErrorState.jsx` — DaisyUI `alert-error` with retry button
- [ ] `src/components/shared/EmptyState.jsx` — DaisyUI placeholder with illustration
- [ ] `src/components/shared/ThemeSwitcher.jsx` — DaisyUI theme dropdown
- [ ] `src/components/shared/ExportCSV.jsx` — CSV export utility
- [ ] `src/components/shared/ExportPDF.jsx` — Print-to-PDF utility

### Step 7.3 — Error Boundary
- [ ] `src/components/shared/ErrorBoundary.jsx` — React error boundary:
  - Catches render errors
  - Shows DaisyUI `alert-error` with reset button
  - Logs errors for debugging

### Deliverables
- Reusable hooks for all API interactions
- Shared UI components for loading, error, empty states
- Error boundary wrapper
- Export functionality

---

## Phase 8: Polish & Enhancement

### Step 8.1 — Keyboard Shortcuts
- [ ] `src/hooks/useKeyboardShortcuts.js`:
  - `Ctrl/Cmd+K` → Focus search
  - `Ctrl/Cmd+1` → Dashboard
  - `Ctrl/Cmd+2` → Orders
  - `Ctrl/Cmd+3` → Search
  - `Ctrl/Cmd+R` → Refresh data
  - `Escape` → Close modals

### Step 8.2 — AI Market Commentary (LLM Integration)
- [ ] `src/app/api/commentary/route.js` — LLM-powered market insights:
  - Sends regime + risk data to LLM via z-ai-web-dev-sdk
  - Returns actionable commentary per ticker
- [ ] `src/components/analysis/CommentaryCard.jsx` — DaisyUI `chat-bubble` styled:
  - AI-generated insights
  - Regime-based action recommendations

### Step 8.3 — Price Alert System
- [ ] Browser notification integration
- [ ] Alert management UI (add/remove/check alerts)
- [ ] Toast notifications when targets are hit

### Step 8.4 — Accessibility & Responsiveness
- [ ] Mobile-first responsive design audit
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation through all DaisyUI components
- [ ] Touch-friendly targets (44px minimum)

### Step 8.5 — Performance Optimization
- [ ] API response caching (in-memory, 5-min TTL)
- [ ] Lazy loading for heavy components (Recharts)
- [ ] Image optimization for any assets
- [ ] Bundle analysis and tree shaking

### Deliverables
- Keyboard shortcuts system
- AI market commentary
- Price alerts with browser notifications
- Full accessibility compliance
- Performance optimizations

---

## File Structure (Final)

```
src/
├── app/
│   ├── layout.js                          # ClerkProvider + DaisyUI theme
│   ├── page.js                            # Home: <Show /> auth gate + view router
│   ├── globals.css                        # DaisyUI plugin + custom theme
│   ├── sign-in/
│   │   └── [[...sign-in]]/
│   │       └── page.js                    # Clerk sign-in page
│   ├── sign-up/
│   │   └── [[...sign-up]]/
│   │       └── page.js                    # Clerk sign-up page
│   ├── middleware.js                       # Clerk route protection
│   └── api/
│       ├── health/route.js                # FastAPI health proxy
│       ├── prices/route.js                # Yahoo Finance price fetcher
│       ├── analyse/route.js               # BFF: prices → FastAPI analysis
│       ├── commentary/route.js            # LLM market commentary
│       ├── alpaca/
│       │   ├── account/route.js           # Alpaca account info
│       │   ├── orders/
│       │   │   ├── route.js               # GET order history
│       │   │   └── create/route.js        # POST place order
│       │   └── positions/route.js         # GET open positions
│       └── clerk/
│           ├── alpaca-keys/route.js       # GET/POST Alpaca keys (privateMetadata)
│           └── alpaca-keys-status/route.js # GET key status (boolean only)
├── components/
│   ├── Navbar.jsx
│   ├── Footer.jsx
│   ├── MobileDrawer.jsx
│   ├── dashboard/
│   │   ├── Dashboard.jsx
│   │   ├── TickerCard.jsx
│   │   ├── ComparisonTable.jsx
│   │   └── RegimeSummaryBanner.jsx
│   ├── analysis/
│   │   ├── RegimeCard.jsx
│   │   ├── ObservationFeatures.jsx
│   │   ├── RiskCard.jsx
│   │   ├── RecommendationsCard.jsx
│   │   ├── PriceChart.jsx
│   │   └── CommentaryCard.jsx
│   ├── orders/
│   │   ├── OrdersPage.jsx
│   │   ├── AlpacaKeySetup.jsx
│   │   ├── AccountSummary.jsx
│   │   ├── OrderHistory.jsx
│   │   ├── OpenPositions.jsx
│   │   ├── OrderModal.jsx
│   │   └── PortfolioAnalysis.jsx
│   ├── search/
│   │   ├── SearchPage.jsx
│   │   └── SearchResults.jsx
│   └── shared/
│       ├── LoadingSkeleton.jsx
│       ├── ErrorState.jsx
│       ├── EmptyState.jsx
│       ├── ThemeSwitcher.jsx
│       ├── ExportCSV.jsx
│       ├── ExportPDF.jsx
│       └── ErrorBoundary.jsx
├── hooks/
│   ├── useAnalysis.js
│   ├── useAlpacaAccount.js
│   ├── useOrders.js
│   ├── usePositions.js
│   ├── useAlpacaKeys.js
│   ├── useHealthCheck.js
│   ├── usePriceAlerts.js
│   └── useKeyboardShortcuts.js
└── lib/
    ├── fastapi-client.js                  # FastAPI fetch wrapper
    ├── alpaca-client.js                   # Alpaca API proxy helpers
    ├── clerk-metadata.js                  # Clerk privateMetadata helpers
    └── cache.js                           # In-memory cache with TTL
```

---

## Clerk PrivateMetadata — Alpaca Key Flow

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

┌──────────┐     GET /api/alpaca/orders           ┌──────────────┐     clerkClient.getUser()     ┌──────────────┐
│  Browser  │ ──────────────────────────────────▶  │  Next.js BFF  │ ──────────────────────────▶ │  Clerk Server  │
│  (React)  │                                       │  (Server)     │    reads privateMetadata    │                │
└──────────┘                                       └──────┬───────┘                              └──────────────┘
                                                          │ uses api_key + secret
                                                          ▼
                                                   ┌──────────────┐
                                                   │  Alpaca API    │
                                                   │  paper-api     │
                                                   └──────────────┘
```

**Security guarantee**: Alpaca API keys are NEVER exposed to the browser. They are stored in Clerk `privateMetadata` (backend-only) and read server-side to proxy Alpaca API calls.

---

## FastAPI Backend — Endpoint Mapping

| Frontend Need | BFF Route | FastAPI Endpoint | Method |
|---|---|---|---|
| Dashboard analysis (3 tickers) | `POST /api/analyse` | `POST /analyse/full` | Batch |
| Individual regime check | `POST /api/analyse` (with flags) | `POST /regime/detect` | Batch |
| Kelly sizing only | `POST /api/analyse` (with flags) | `POST /size/kelly` | Batch |
| Risk metrics only | `POST /api/analyse` (with flags) | `POST /risk/analyse` | Batch |
| Backend health | `GET /api/health` | `GET /health` | — |
| Price data | `GET /api/prices` | — (Yahoo Finance) | — |

---

## Alpaca Markets — API Mapping

| Frontend Need | BFF Route | Alpaca Endpoint | Method |
|---|---|---|---|
| Account info | `GET /api/alpaca/account` | `GET /v2/account` | Paper |
| Order history | `GET /api/alpaca/orders` | `GET /v2/orders` | Paper |
| Place order | `POST /api/alpaca/orders/create` | `POST /v2/orders` | Paper |
| Open positions | `GET /api/alpaca/positions` | `GET /v2/positions` | Paper |

### Place Order Default Payload
```json
{
  "symbol": "AAPL",
  "qty": "100",
  "side": "buy",
  "type": "market",
  "time_in_force": "day"
}
```

---

## DaisyUI Component Usage Map

| UI Element | DaisyUI Component | Notes |
|---|---|---|
| Page layout | `drawer` + `navbar` | Mobile drawer, desktop navbar |
| Auth gate | Clerk `<Show />` | Not DaisyUI — Clerk component |
| Navigation tabs | `tab` | Dashboard / Orders / Search |
| Theme switcher | `dropdown` + `swap` | Theme selector |
| Ticker cards | `card` | With `card-body`, `card-title` |
| Collapsible sections | `collapse` | Regime, HMM, Risk sections |
| Probability bars | `progress` | Vol/trend probabilities |
| Confidence circle | `radial-progress` | HMM confidence display |
| Key metrics | `stats` + `stat` | VaR, CVaR, Sharpe, etc. |
| Status badges | `badge` | Regime labels, order status |
| Alerts | `alert` | Risk warnings, recommendations |
| Buttons | `btn` | All actions (buy, sell, refresh) |
| Buy/Sell toggle | `btn-group` | Side selection in order modal |
| Search input | `input` + `btn` | Symbol search |
| Period filters | `btn-group` | 6M/1Y/2Y, 1M/3M/6M/1Y |
| Tables | `table` | Order history, positions, comparison |
| Modal dialogs | `modal` | Order placement, Alpaca key setup |
| Loading states | `skeleton` | Pulse animation placeholders |
| Toast notifications | `toast` | Order confirmations, alerts |
| Footer | `footer` | Sticky bottom footer |
| Form inputs | `input`, `select` | Order form fields |
| Ticker chips | `btn` (sm) | Popular ticker quick-select |
| Feature tags | `badge` (outline) | Footer feature list |

---

## Implementation Priority & Parallelization

```
Phase 1 (Foundation)  ───────────────────────────── Sequential (blocking)
     │
Phase 2 (Layout)      ───────────────────────────── Sequential (needs Phase 1)
     │
     ├─── Phase 3-a (BFF: FastAPI routes)     ───┐
     ├─── Phase 3-b (BFF: Price routes)       ───┤  PARALLEL
     ├─── Phase 3-c (BFF: Alpaca routes)      ───┤
     └─── Phase 3-d (BFF: Clerk metadata)     ───┘
     │
     ├─── Phase 4 (Dashboard)                 ───┐
     │                                         ───┤  PARALLEL
     └─── Phase 6 (Search)                    ───┘
     │
Phase 5 (Orders)      ───────────────────────────── Needs Phase 3-c, 3-d
     │
Phase 7 (Shared)      ───────────────────────────── Ongoing with all phases
     │
Phase 8 (Polish)      ───────────────────────────── After all phases
```

### Sub-Agent Task Assignments

| Task ID | Phase | Description | Agent Type | Parallel Group |
|---------|-------|-------------|------------|----------------|
| 1 | Phase 1 | Foundation: JSX conversion, DaisyUI, Clerk setup | full-stack-developer | — |
| 2 | Phase 2 | Layout shell: Navbar, Footer, MobileDrawer, page router | full-stack-developer | — |
| 3-a | Phase 3 | BFF: FastAPI client + health + analyse routes | full-stack-developer | Group A |
| 3-b | Phase 3 | BFF: Price data route (Yahoo Finance) | full-stack-developer | Group A |
| 3-c | Phase 3 | BFF: Alpaca account/orders/positions routes | full-stack-developer | Group A |
| 3-d | Phase 3 | BFF: Clerk privateMetadata routes | full-stack-developer | Group A |
| 4 | Phase 4 | Dashboard: 3-ticker cards + analysis components | full-stack-developer | Group B |
| 5 | Phase 5 | Orders page: history, positions, buy/sell modal | full-stack-developer | — |
| 6 | Phase 6 | Search page: ticker lookup + analysis display | full-stack-developer | Group B |
| 7 | Phase 7 | Shared hooks + utility components | full-stack-developer | Ongoing |
| 8 | Phase 8 | Polish: shortcuts, AI commentary, alerts, a11y | full-stack-developer | — |

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

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | JavaScript (JSX) | User requirement — no TypeScript |
| CSS Framework | DaisyUI v5 ONLY | User requirement — no shadcn/ui |
| Auth | Clerk v7 + `<Show />` | User requirement — declarative auth gating |
| Alpaca Key Storage | Clerk privateMetadata | Backend-only, never exposed to frontend |
| Price Data | Yahoo Finance (server-side) | Free, no API key needed, reliable |
| Analysis | FastAPI `/analyse/full` | Single endpoint for regime + sizing + risk |
| State Management | React useState + useEffect | Simple — no Zustand needed for this scope |
| Caching | In-memory with TTL | Lightweight, no Redis needed |
| Charts | Recharts | Already installed, works with DaisyUI |
| Order Execution | BFF proxy to Alpaca | Keys stay server-side via Clerk privateMetadata |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Render cold starts (30-60s) | Loading skeletons + retry with exponential backoff |
| Yahoo Finance rate limits | Server-side caching (5-min TTL) |
| Alpaca paper trading latency | Optimistic UI updates + error rollback |
| Clerk privateMetadata 8KB limit | Store only 2 fields (api_key, secret_key) |
| DaisyUI theme inconsistencies | Test all 6 themes during development |
| CORS issues with FastAPI | BFF pattern avoids direct browser → FastAPI calls |
