---
Task ID: 5.1-5.6
Agent: main
Task: Build Phase 5 — Correlation + Optimization (v3.0)

Work Log:
- Added `detectCorrelation()` and `optimisePortfolio()` functions to `src/lib/fastapi-client.js`
  - detectCorrelation: POST /correlation/detect with symbols, returns_matrix, window, kelly_fraction, target_vol
  - optimisePortfolio: POST /optimise/full with symbols, returns_matrix, current_weights, kelly_fraction, target_vol, max_dd
- Created BFF API route `src/app/api/correlation/detect/route.js` — POST proxy to FastAPI /correlation/detect
- Created BFF API route `src/app/api/optimise/full/route.js` — POST proxy to FastAPI /optimise/full
- Created `src/components/portfolio/CorrelationCard.jsx` — Full correlation detection display:
  - Correlation regime badge (low_corr/mid_corr/high_corr/crisis) with color coding
  - Mean |ρ| metric with green/yellow/red color thresholds
  - Blended risk multiplier display
  - n×n correlation heatmap table with cell coloring by |ρ| magnitude and legend
  - Empty state when < 2 symbols, "Detect" button with loading state
- Created `src/components/portfolio/OptimizerCard.jsx` — Full portfolio optimization display:
  - Recharts grouped BarChart comparing Current vs Optimal vs Regime-adjusted weights
  - 4-column key metrics: Exposure Scalar, DD Constraint, Correlation Regime, Symbols count
  - Detailed weights table with delta column (color-coded)
  - Drawdown constraint alert (within/breach status)
  - Custom WeightsTooltip for bar chart hover
  - Empty state when < 2 symbols, "Optimize" button with loading state
- Rewrote `src/components/portfolio/PortfolioOverview.jsx` — Major enhancement with v3.0 features:
  - Returns matrix computation from Yahoo Finance prices (1y period, parallel fetch)
  - Current weights derivation (Kelly-based from portfolio data, equal-weight fallback)
  - CorrelationCard as collapsible section with regime badge in collapse title
  - OptimizerCard as collapsible section with exposure/DD badges in collapse title
  - Enhanced RiskFlagsBanner: added crisis/high_corr correlation flags
  - Enhanced PortfolioStats: 6-column grid with new Corr Regime + Exposure stats
  - "CORRELATION & OPTIMIZATION" divider section
  - v3.0 version badge in header
- Updated `src/components/Footer.jsx` — Version bumped to v3.0, added Correlation/Optimizer/Corr Detection/Weight Optimizer badges
- Updated `plan.md` — Added Phase 5 section with full specification, updated file structure, endpoint mapping, component usage map, phase status table
- All lint checks pass cleanly (0 errors, 0 warnings)
- Dev server compiles and responds with 200

Stage Summary:
- Phase 5 (Correlation + Optimization v3.0) is fully built and integrated
- 2 new BFF routes created, 2 new FastAPI client functions added
- 2 new UI components (CorrelationCard, OptimizerCard)
- 1 major component rewrite (PortfolioOverview) with 6 new features
- 2 supporting files updated (Footer, plan.md)
- Correlation detection shows regime + heatmap + blended risk
- Optimizer shows current vs optimal weights + DD constraint + exposure scalar
- All using ONLY DaisyUI classes + Recharts for charts
---
Task ID: 3.1-3.4
Agent: main
Task: Build Phase 3 — Streaming & Real-Time (full rebuild + enhancements)

Work Log:
- Rewrote `src/context/StreamContext.jsx` — Fixed toggleStream double-setSubscriptions bug, added tickCounts tracking, streamAll/stopAll batch actions, totalTicks counter, getTickCount helper, subscriptionsRef for stable callback references
- Rewrote `src/hooks/useStreamPrice.js` — Fixed SSE reconnect with actual delay (setTimeout instead of just incrementing counter), added seedWithRetry helper (3 retries with exponential backoff), added tick count + connectedAt state, fixed stale closure by using sseModeRef, proper cleanup of reconnect timeouts, fixed exhaustive-deps warning
- Rewrote `src/app/api/stream/seed/route.js` — Fixed minimum bars from 51 to 81 (matching FastAPI HMM requirement), added auto-period extension (6mo→1y→2y if insufficient data), improved error messages
- Rewrote `src/app/api/stream/tick/route.js` — Added needsReseed hint on 404 session-not-found errors, fixed body variable scope in catch block
- Created `src/app/api/stream/sse/route.js` — NEW: BFF SSE proxy route that proxies EventSource from FastAPI, solves CORS issues by keeping SSE within same origin
- Improved `src/app/api/stream/latest-price/route.js` — Added stale cache auto-eviction (5min interval cleanup)
- Rewrote `src/components/streaming/StreamStatusPanel.jsx` — Added Stream All / Stop All batch actions, tick count per stream, connection duration, regime badge colors, SSE mode badge, empty state with "Stream All Default Tickers" button
- Rewrote `src/components/streaming/AlertHistory.jsx` — Added severity filter tabs (All/Critical/Warning/Info), severity counts in filter badges, filtered empty state message
- Rewrote `src/components/streaming/LiveBadge.jsx` — Added tooltip with connection mode info, color differentiation (green=SSE direct, yellow=polling fallback)
- Updated `src/components/Navbar.jsx` — Added totalTicks display in stream indicator badge
- Updated `src/components/dashboard/Dashboard.jsx` — Added "Go Live All" button (replaces simple stream toggle when no streams active), added Stop All button, totalTicks display in stream count
- Updated `src/components/dashboard/TickerCard.jsx` — Added tickCounts from useStream, tick count display in live regime banner
- Updated `src/components/portfolio/PortfolioOverview.jsx` — Added tickCounts from useStream, new Ticks column in SymbolBreakdownTable
- All lint checks pass cleanly (0 errors, 0 warnings)

Stage Summary:
- Phase 3 (Streaming & Real-Time) fully rebuilt with significant bug fixes and enhancements
- 1 new file created (SSE proxy route), 11 existing files modified
- Critical bugs fixed: toggleStream race condition, SSE reconnect not actually delaying, seed minimum bars mismatch (51→81), stale closures, body scope in catch
- New features: streamAll/stopAll batch actions, tick count tracking, SSE BFF proxy, severity filter in AlertHistory, connection duration display
- All integration points verified: Navbar, Dashboard, TickerCard, Portfolio
- Dev server compiles and responds correctly
---
Task ID: 2.1-2.4
Agent: main
Task: Build Phase 2 — Simulation + Portfolio (v2.1)

Work Log:
- Added `simulateRegime()` and `getPortfolio()` functions to `src/lib/fastapi-client.js`
- Created BFF API route `src/app/api/simulate/route.js` — POST proxy to FastAPI `/simulate/{symbol}`
- Created BFF API route `src/app/api/portfolio/route.js` — GET proxy to FastAPI `/portfolio`
- Created `src/components/simulation/PriceFanChart.jsx` — Recharts AreaChart with p5/p25/median/p75/p95 percentile bands
- Created `src/components/simulation/SimulationPanel.jsx` — Configurable Monte Carlo simulation with horizon/n_paths/seed controls, metric cards, regime transition display, risk multiplier bar chart
- Created `src/components/simulation/SimulatePage.jsx` — Standalone simulation page with popular symbol picker, stream symbol selector, custom symbol input
- Created `src/components/portfolio/PortfolioOverview.jsx` — Aggregated portfolio view with risk flags banner, portfolio stats, per-symbol breakdown table, regime alerts
- Integrated SimulationPanel into TickerCard as new collapsible "Monte Carlo Simulation" section
- Integrated SimulationPanel into PortfolioAnalysisCard (Orders page)
- Integrated SimulationPanel into SearchResults as toggleable simulation section
- Added "Simulate" and "Portfolio" tabs to Navbar
- Updated page.js to render SimulatePage and PortfolioOverview views
- Updated keyboard shortcuts (Ctrl+3=Simulate, Ctrl+4=Portfolio, Ctrl+5=Search)
- Updated Footer version to v2.1 with new feature badges (Monte Carlo, Simulation, Portfolio View)
- Fixed ESLint errors: moved FanTooltip outside component, removed duplicate fill prop, fixed eslint-disable
- All lint checks pass cleanly

Stage Summary:
- Phase 2 (Simulation + Portfolio v2.1) is fully built and integrated
- 6 new files created, 5 existing files modified
- Simulation is accessible from 4 places: TickerCard accordion, PortfolioAnalysisCard accordion, SearchResults toggle, SimulatePage tab
- Portfolio Overview is a standalone tab showing aggregated risk across all active streams
- All BFF routes proxy to FastAPI backend (/simulate/{symbol} and /portfolio)
