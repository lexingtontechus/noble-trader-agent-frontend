Create a step by step plan outline for a frontend NextJS v16 (javascript js/jsx only) project with daisyui and clerk auth that integrates a fastapi backend. ONLY Use Daisyui for all CSS and components
Use sub-agents to run parallel tasks.

## User journey
- Home page user is signed-out, use <Show />,
	- <Show when='signed-out/> displays Clerk <SignIn/> component
	- <Show when='signed-in'> displays dashboard.
- dashboard page of 3 default ticker symbols (Gold, Bitcoin, USD-EUD) for the past 6m with,
	- regime state
	- hmm observation features
	- risk with recommendations
- page that displays Alpaca account order history with filter by 1m/3m/6m/1y
	- create portfolio analysis using regime, hmm observayion features & risk
	- use Clerk private.meta to retrieve user's Alpaca apikey & secret
	- add a buy/sell button to execute orders with quantity (qty- default value 100)
- search page for a ticker symbols with filters (6m/1y/2y)
	- results apply the regime state, hmm observation features, risk with recommendations

## Reference:
1. https://noble-trader-fastapi-backend.onrender.com/openapi.json 
2. https://clerk.com/docs/nextjs/reference/components/control/show
3. https://clerk.com/docs/guides/users/extending#private-metadata 
4. https://docs.alpaca.markets/reference/postorder 


# Step-by-Step Plan
## Phase 1: Foundation Setup ✅
DaisyUI v5 configured as Tailwind CSS v4 plugin with custom "noble" dark theme (gold/amber primary, purple secondary, teal accent)
Clerk v7 auth integrated with sign-in/sign-up pages, middleware route protection, and dev-mode bypass for placeholder keys
yahoo-finance2 v3 installed for server-side price data fetching

## Phase 2: Backend Integration (BFF API Routes) ✅
/api/prices — Fetches historical price data from Yahoo Finance
/api/analyse — BFF route: fetches prices → forwards to FastAPI backend → returns combined analysis
/api/health — Monitors FastAPI backend status with latency measurement

## Phase 3: Dashboard Page ✅
3 default ticker columns: Gold (GC=F), Bitcoin (BTC-USD), USD/EUR (EURUSD=X)
Period selector (6M / 1Y / 2Y) with refresh button
Each ticker displays: price chart, regime state, risk metrics, position sizing, recommendations
Loading skeletons and error states with retry

## Phase 4: Search Page ✅
Symbol search with Enter key support
Period filter (6 Months / 1 Year / 2 Years)
16 popular tickers for quick selection
Recent searches persisted in localStorage (max 8)
Full 2-column analysis layout with price chart

## Phase 5: Analysis Components ✅
```
Component | Displays
RegimeCard	| HMM regime label, vol/trend probability bars, confidence, risk multiplier
RiskCard	| VaR 95/99, CVaR 95/99, max drawdown, Sortino/Calmar, stop/TP
SizingCard	| Kelly criterion 5-step breakdown, Sharpe ratio, regime multiplier
RecommendationsCard	| Regime-based action alerts, position size, stop/TP, analysis notes
PriceChart	| Interactive Recharts area chart with gradient fill
AnalysisSkeleton	| Loading placeholder with pulse animation

```

## Features
	Theme Switcher — 6 themes (Noble Dark, Light, Dark, Cupcake, Business, Synthwave) with localStorage persistence
	Current Price Display — Live price with ▲/▼ return indicator in dashboard headers and search results
	Watchlist Panel — Add/remove symbols, localStorage persistence, triggers search on select
	Comparison Table — 11 key metrics compared side-by-side for the 3 default tickers
	Auto-Refresh — Toggle with 2-minute interval, shows last-updated timestamp
	Enhanced Navbar — Avatar icon, "REGIME RISK" subtitle, pill health indicator, theme dropdown
	Enhanced Footer — Responsive layout, feature bullet tags, disclaimer
	Enhanced Card Designs — Gradient backgrounds, borders, improved visual hierarchy
	Add React error boundaries
	Implement API response caching
	Add export functionality (CSV/PDF)
	Improve mobile experience with collapsible sections
	Add price alert notifications
	Add historical regime tracking
	CollapsibleCard — Click-to-collapse/expand analysis sections with smooth animation, chevron indicator, and status badges
	RegimeSummaryBanner — Color-coded quick-glance overview of all 3 ticker regimes at dashboard top
	CSV Export — Download full analysis reports with regime, sizing, risk, and price data
	AI Market Commentary — LLM-generated actionable insights per ticker (tested with AAPL: "AAPL is in a high-volatility, strong bull regime...")
	Analysis cards wrapped in CollapsibleCards with icons + badges
	Position Sizing defaults to collapsed (reduces visual clutter)
	Regime Summary Banner at top for instant overview
	Tighter card spacing (space-y-3)
	Inner components simplified (CollapsibleCard handles presentation)
	Add price alerts (browser notifications)
	Add keyboard shortcuts
	Improve chart interactivity (regime overlay, zoom)
	Add historical regime tracking timeline
	Mobile-first redesign
	Modal-style search overlay with auto-focused input
	Quick actions: Go to Dashboard, Search Ticker
	Filterable popular tickers list
	Enter to search, Escape/backdrop to close
	Backdrop blur + professional design
	Market Overview (MarketOverview.tsx)
	4 derived sentiment indicators: Fear & Greed Index (0-100), Volatility Regime, Market Trend, Confidence
	Color-coded cards with progress bars
	Responsive 2×2 → 4-column grid
	Mobile Drawer (MobileDrawer.tsx)
	Slide-out 280px left-side drawer
	Dashboard/Search navigation + 8 popular ticker quick links
	Hamburger button in Navbar (mobile only)
	Body scroll lock + backdrop blur
	Page Transition Animations
	Smooth animate-fade-in-up on view switches
	key={activeView} triggers re-mount animation
	Price Alert System — Full browser notification system with localStorage persistence, add/remove/check alerts, permission management, and toast notifications when targets are hit. Integrated into both Dashboard and Search views.
	Correlation Matrix Heatmap — Pearson correlation coefficient calculation with color-coded 3×3 heatmap showing Gold/Bitcoin/USD-EUR correlations. Green for positive, red for negative, transparent for neutral.
	PDF Export — Professional self-contained HTML report generation using browser's window.print(). Includes all analysis sections (regime, sizing, risk, recommendations, price data) with print-optimized styling. PDF buttons on both Search and Dashboard views.

## 📊 Complete Feature List (22+ features)
Dashboard · Search · 3 Default Tickers · Period Filters · Full Analysis Pipeline · API Caching · Error Boundary · Regime Detection · HMM Probabilities · Risk Metrics · Position Sizing · Recommendations · Price Charts · Comparison Table · Watchlist · Theme Switcher · Auto-Refresh · CSV Export · AI Commentary · Clerk Auth · Backend Health Monitor

## Keyboard Shortcuts System (useKeyboardShortcuts hook)
Ctrl/Cmd+K → Opens command palette / switches to search
Ctrl/Cmd+1 → Switches to dashboard
Ctrl/Cmd+R → Refreshes data (when not in input)
Escape → Closes modals/palette
Cross-component communication via custom events
Command Palette (CommandPalette.tsx)

