# Noble Trader Agent — Frontend

**Dynamic Regime Risk Management Platform**

A NextJS v16 full-stack web application for real-time market regime detection, AI-powered trading signals, and dynamic risk management. Built with DaisyUI + TailwindCSS, Supabase PostgreSQL, Clerk authentication, and a FastAPI backend running HMM / Kelly / TDA models.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Edge)                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │              NextJS v16 Frontend                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │  React    │  │ DaisyUI  │  │  Clerk Auth      │ │ │
│  │  │  19 + JSX │  │ +Tailwind│  │  (SSO + metadata)│ │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │  Recharts │  │  SSE     │  │  Supabase Client │ │ │
│  │  │  Charts   │  │  Streams │  │  (PostgreSQL)    │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │ API Routes (BFF)
            ┌───────────┴───────────┐
            ▼                       ▼
┌───────────────────┐   ┌─────────────────────┐
│  Supabase         │   │  FastAPI Backend     │
│  PostgreSQL       │   │  (Render, free plan) │
│  - ta_* tables    │   │  - HMM Detection     │
│  - pg_cron jobs   │   │  - Kelly Sizing      │
│  - RLS policies   │   │  - Risk Engine       │
│  - Alpaca paper   │   │  - Backtesting       │
│    trading acct   │   │  - TDA Features      │
└───────────────────┘   │  - Observation Build │
                        └─────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | **NextJS v16** | App Router, SSR/SSG, API routes (BFF) |
| UI | **DaisyUI 5** + **TailwindCSS 4** | Component library + utility-first CSS |
| Language | **JavaScript/JSX** | No TypeScript in source — JS only |
| Auth | **Clerk** | SSO, user management, `private.metadata` for Alpaca keys |
| Database | **Supabase PostgreSQL** | All persistence — never Prisma |
| Charts | **Recharts 3** | Price charts, fan charts, visualizations |
| State | **Zustand** | Lightweight global state |
| Streaming | **SSE** (EventSource) | Real-time price ticks via FastAPI |
| AI Commentary | **OpenAI / Google GenAI** | LLM-powered market insights |
| Validation | **Zod** | Request/response schema validation |
| Backend | **FastAPI** (Python) | HMM, Kelly, risk, backtest, TDA models |
| Deployment | **Vercel** (frontend) + **Render** (backend) | Auto-deploy from GitHub `main` |

---

## Project Structure

```
src/
├── app/
│   ├── api/                     # BFF API routes
│   │   ├── alpaca/              # Alpaca brokerage (account, orders, positions)
│   │   ├── auth/                # Clerk auth helpers
│   │   ├── clerk/               # Clerk metadata (Alpaca keys CRUD)
│   │   ├── commentary/          # AI market commentary (OpenAI / Google)
│   │   ├── correlation/         # Cross-asset correlation detection
│   │   ├── evolution/           # Strategy evolution (A/B, Optuna, rotation)
│   │   ├── health/              # Backend health check
│   │   ├── observation/         # 24-feature observation vector builder
│   │   ├── optimise/            # Full optimization pipeline
│   │   ├── portfolio/           # Portfolio analysis + optimizer
│   │   ├── prices/              # Yahoo Finance price fetcher
│   │   ├── simulate/            # Monte Carlo simulation
│   │   ├── stream/              # SSE streaming (session, tick, seed)
│   │   ├── tda/                 # Topological Data Analysis (alerts, scan)
│   │   ├── telegram/            # Telegram bot notifications
│   │   └── trading/             # Trading workflow (analyze, validate, approve, execute)
│   ├── layout.js                # Root layout (ClerkProvider)
│   ├── page.js                  # Home page (all views, keyboard shortcuts)
│   ├── sign-in/                 # Clerk sign-in
│   └── sign-up/                 # Clerk sign-up
├── components/
│   ├── admin/                   # Admin panel
│   ├── analysis/                # Analysis cards (Regime, Risk, HMM, Recommendations, Commentary)
│   ├── auth/                    # Clerk auth panel
│   ├── dashboard/               # Dashboard (TickerCard, ComparisonTable, RegimeSummaryBanner)
│   ├── evolution/               # Strategy Evolution panel
│   ├── orders/                  # Orders page (Alpaca key setup, positions, history, modal)
│   ├── portfolio/               # Portfolio (correlation, optimizer, overview)
│   ├── search/                  # Symbol search + analysis results
│   ├── shared/                  # Reusable (EmptyState, ErrorState, LoadingSkeleton, ThemeSwitcher)
│   ├── simulation/              # Monte Carlo simulation (fan chart)
│   ├── streaming/               # Live streams (SSE, AlertHistory, LiveBadge)
│   └── trading/                 # Trading workflow (approve, execute, validate)
├── context/
│   └── StreamContext.jsx        # SSE stream management (subscriptions, price ticks, alerts)
├── hooks/
│   ├── use-mobile.js            # Mobile viewport detection
│   └── useStreamPrice.js        # Per-symbol streaming price hook
├── lib/
│   ├── alpaca-client.js         # Alpaca paper trading API client
│   ├── cache.js                 # In-memory cache with TTL
│   ├── clerk-metadata.js        # Clerk private.metadata helpers
│   ├── config.js                # App configuration constants
│   ├── db.js                    # Re-exports from supabase/db.js
│   ├── fastapi-auth.js          # FastAPI backend auth token
│   ├── fastapi-client.js        # FastAPI backend HTTP client
│   ├── notifications.js         # Toast notification helpers
│   ├── price-poll-coordinator.js# Polling fallback for SSE
│   ├── rate-limiter.js          # Server-side rate limiting
│   ├── strategy-evolution.js    # Evolution engine (variant mgmt, A/B, rotation, Optuna)
│   ├── supabase/
│   │   ├── client.js            # Supabase browser client
│   │   ├── db.js                # Prisma-compatible Supabase wrapper (all models)
│   │   └── server.js            # Supabase server client (cookies)
│   ├── symbol-utils.js          # Yahoo ↔ Alpaca symbol mapping, asset class detection
│   ├── trade-validation.js      # Walk-forward validation logic + synthetic ID parser
│   └── yahoo-prices.js          # Yahoo Finance price fetcher
└── proxy.js                     # Clerk middleware (NextJS v16 requires proxy.js, NOT middleware.js)

supabase/
└── migrations/
    ├── 00000000000001_create_tables.sql           # Core tables (ta_*)
    ├── 00000000000002_strategy_evolution.sql      # Evolution tables + seed
    ├── 00000000000003_evolution_cron.sql           # Evolution pg_cron jobs
    ├── 00000000000004_scheduled_orders.sql         # Scheduled orders tables
    └── 00000000000005_scheduled_orders_cron.sql    # Scheduled orders pg_cron
```

---

## Features

### Dashboard
- **Live Streaming**: SSE-based real-time price feeds for Gold, Bitcoin, and USD/EUR
- **Regime Summary Banner**: At-a-glance regime badges for all tracked tickers
- **Ticker Tabs**: DaisyUI boxed tabs with regime badges, loading spinners, and error indicators
- **Accordion Analysis**: Regime State, HMM Features, Risk Metrics, Recommendations, AI Commentary — only one open at a time
- **Strategy Evolution Panel**: Variant tracking, A/B testing, auto-rotation status

### Trading Workflow
- **Full Pipeline**: HMM Detection → Strategy Signal → Kelly Sizing → Risk Check → Recommendation
- **Walk-Forward Validation**: Trades must pass backtesting validation before execution
- **Approve / Execute Flow**: Review recommendations, approve individually or in bulk, execute via Alpaca paper trading
- **Scheduled Orders**: Cron-based scheduled trade execution

### Analysis Components
- **Regime Card**: Regime label, risk multiplier, confidence radial, volatility/trend state probabilities
- **HMM Observation Features**: 24-dimensional feature vector with progress bars (returns, volatility, derived, HMM posteriors, Markov, quality, position)
- **Risk Card**: VaR/CVaR, max drawdown, Sortino/Calmar ratios, stop-loss/take-profit alerts, risk budget bar
- **Recommendations Card**: Kelly sizing pipeline (full → fractional → vol-scaled → regime-gated → recommended), position size, Sharpe ratio
- **AI Commentary**: LLM-generated market insight via OpenAI or Google Generative AI

### Portfolio
- **Correlation Matrix**: Cross-asset correlation analysis
- **Portfolio Optimizer**: Mean-variance optimization
- **Open Positions**: Live Alpaca positions with P&L

### Search
- **Symbol Lookup**: Analyze any Yahoo Finance symbol with full pipeline
- **Buy/Sell Buttons**: Direct trading from search results

### Simulation
- **Monte Carlo Simulation**: Price fan chart with confidence intervals

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or bun
- Clerk account (for auth)
- Supabase project (for database)
- FastAPI backend running (see [Backend Repo](https://github.com/0x5961737349726d/MarketRegimeTrader))

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...

# FastAPI Backend
FASTAPI_BACKEND_URL=https://noble-trader-fastapi-backend.onrender.com
FASTAPI_SECRET=your-shared-secret

# Cron
CRON_SECRET=your-cron-secret

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# AI Commentary (at least one)
OPENAI_API_KEY=sk-...
# or
GOOGLE_GENERATIVE_AI_API_KEY=...
```

### Installation

```bash
# Clone the repository
git clone https://github.com/lexingtontechus/noble-trader-agent-frontend.git
cd noble-trader-agent-frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Production

```bash
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Database (Supabase)

All data is stored in Supabase PostgreSQL with the `ta_` table prefix. Migrations are SQL files in `supabase/migrations/` and should be run via the Supabase Dashboard SQL editor.

### Key Tables
| Table | Purpose |
|-------|---------|
| `ta_trade_recommendations` | Trade recommendations with regime, strategy, sizing, risk data |
| `ta_scheduled_orders` | Scheduled order execution with cron |
| `ta_strategy_variant` | Strategy parameter sets for evolution |
| `ta_strategy_performance` | Live/backtest performance per variant |
| `ta_ab_test` | A/B test assignments and results |
| `ta_evolution_log` | Strategy parameter change history |

### Cron Jobs (pg_cron)
| Job | Schedule | Purpose |
|-----|----------|---------|
| Strategy Rotation | Every 6 hours | Auto-rotate to best-performing variant |
| Strategy Optimization | Daily 10pm UTC (Mon-Fri) | Run Optuna HPO trials |
| Scheduled Orders | Every 5 minutes | Execute pending scheduled orders |

---

## API Routes

The NextJS API routes serve as a Backend-for-Frontend (BFF) layer, proxying requests to the FastAPI backend and Supabase.

### Core Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/analyse` | POST | Full analysis pipeline (HMM → Strategy → Kelly → Risk) |
| `/api/trading/analyze` | POST | Trading analysis with active variant params |
| `/api/trading/validate` | POST | Walk-forward validation gate |
| `/api/trading/approve` | POST | Approve a trade recommendation |
| `/api/trading/approve-all` | POST | Bulk approve all pending recommendations |
| `/api/trading/execute` | POST | Execute approved trade via Alpaca |
| `/api/trading/status` | GET | Get all trade recommendations |
| `/api/observation/build` | POST | Build 24-feature observation vector |
| `/api/commentary` | POST | Generate AI market commentary |
| `/api/prices` | POST | Fetch Yahoo Finance prices |
| `/api/health` | GET | Backend health check |

### Streaming Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/stream/sse` | GET | Server-Sent Events for live price ticks |
| `/api/stream/session` | POST | Create streaming session |
| `/api/stream/latest-price` | GET | Get latest cached price |

### Evolution Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/evolution/summary` | GET | Evolution state summary |
| `/api/evolution/variants` | GET/POST | List/create strategy variants |
| `/api/evolution/feedback` | POST | Record execution feedback |
| `/api/evolution/ab-test` | GET/POST/DELETE | A/B test management |
| `/api/evolution/optimize` | POST | Run Optuna optimization |
| `/api/evolution/rotate` | POST | Check/force variant rotation |

---

## Keyboard Shortcuts

| Shortcut | View |
|----------|------|
| `Ctrl+1` / `Cmd+1` | Dashboard |
| `Ctrl+2` / `Cmd+2` | Orders |
| `Ctrl+3` / `Cmd+3` | Trade |
| `Ctrl+4` / `Cmd+4` | Simulate |
| `Ctrl+5` / `Cmd+5` | Portfolio |
| `Ctrl+6` / `Cmd+6` | Search |
| `Ctrl+7` / `Cmd+7` | Admin |

---

## Deployment

The frontend is auto-deployed to **Vercel** on every push to the `main` branch.

- **Production URL**: [noble-trader-agent-frontend.vercel.app](https://noble-trader-agent-frontend.vercel.app)
- **GitHub Repo**: [lexingtontechus/noble-trader-agent-frontend](https://github.com/lexingtontechus/noble-trader-agent-frontend)

The FastAPI backend is auto-deployed to **Render** on every push to its `main` branch.

- **Backend URL**: [noble-trader-fastapi-backend.onrender.com](https://noble-trader-fastapi-backend.onrender.com)
- **Backend Docs**: [noble-trader-fastapi-backend.onrender.com/docs](https://noble-trader-fastapi-backend.onrender.com/docs)
- **Backend Repo** (read-only): [0x5961737349726d/MarketRegimeTrader](https://github.com/0x5961737349726d/MarketRegimeTrader)

> **Note**: The Render free plan has a ~30 second cold start. The first request after inactivity may be slow.

---

## Project Rules

1. **Always use DaisyUI** for all UX components and design patterns
2. **Always use Supabase** for all database requirements — do NOT use Prisma
3. **Clerk `private.metadata`** stores the user's Alpaca API keys
4. **Do NOT delete** `proxy.js` — it is the Clerk middleware file required by NextJS v16 (not `middleware.js`)
5. **Do NOT delete** `.env.local` — it contains all API keys and secrets
6. **Yahoo Finance and Alpaca symbols are different** — Alpaca does NOT support FOREX or GOLD
7. **JS/JSX only** — no TypeScript in source files

---

## License

MIT License — Copyright (c) 2026 Lexington Tech LLC. See [LICENSE](./LICENSE) for details.

---

## Disclaimer

This software is for educational and research purposes only. It is not financial advice. All trading occurs on Alpaca paper trading accounts. Past performance does not guarantee future results. Use at your own risk.
