---
Task ID: 1
Agent: Main Agent
Task: Fix Correlation Detection and Portfolio Optimization errors showing "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"

Work Log:
- Investigated both frontend and backend codebases
- Identified root cause: Render free-tier FastAPI backend returns HTML pages during spin-up, and the code was trying to parse them as JSON
- Also discovered a critical bug: BFF routes used `http://localhost:3000/api/prices` which doesn't work on Vercel
- Fixed `fetchWithRetry` in `fastapi-client.js` to detect `text/html` content-type and retry with backoff
- Added content-type validation in `detectCorrelation()` and `optimisePortfolio()` before calling `res.json()`
- Fixed thin BFF routes (`/api/correlation/detect`, `/api/optimise/full`) to guard against HTML responses
- Fixed fat BFF routes (`/api/portfolio/correlation`, `/api/portfolio/optimizer`):
  - Replaced `localhost:3000` HTTP calls with direct Yahoo Finance imports
  - Created shared `@/lib/yahoo-prices` module to avoid HTTP round-trips
  - Added `SERVICE_STARTING` error code with user-friendly messages
- Refactored `/api/prices` route to use shared `yahoo-prices` module
- Updated `PortfolioOverview.jsx` to show spinner + "Retry Now" for SERVICE_STARTING errors
- Increased retries to 5 for correlation/optimization endpoints (for Render spin-up recovery)
- Pushed frontend to GitHub: commit `7dcaa8d`

Stage Summary:
- Root cause: Render free-tier spin-up returns HTML (200 OK) which gets parsed as JSON → crash
- Secondary bug: localhost:3000 in BFF routes doesn't work on Vercel
- Both issues fixed and deployed to `lexingtontechus/noble-trader-agent-frontend`
- No backend changes needed (auth is correct, endpoints exist)
---
Task ID: 1
Agent: main
Task: Fix wrong symbol format passed to Alpaca when trading searched symbols (crypto/forex)

Work Log:
- Analyzed uploaded screenshots showing errors: `asset 'ETH-USD' not found` and `asset "EURUSD=X" not found`
- Traced the full data flow: SearchPage → SearchResults → OrderModal → BFF route → Alpaca API
- Identified root cause: Yahoo Finance format symbols (e.g., BTC-USD, ETH-USD, EURUSD=X) were passed directly to Alpaca which expects different formats (BTC/USD, ETH/USD, EURUSD)
- Created `/src/lib/symbol-utils.js` with conversion utilities: `yahooToAlpacaSymbol()`, `isAlpacaTradable()`, `getAlpacaTradeabilityReason()`, `getAssetClass()`, `alpacaToYahooSymbol()`
- Updated `OrderModal.jsx` to convert symbols before submission, show conversion notice, and block non-tradable assets (futures/indices)
- Updated BFF route `/api/alpaca/orders/create/route.js` with server-side symbol conversion as safety net
- Updated `SearchPage.jsx` with asset class badges on popular tickers (₿ for crypto, 💱 for forex)
- Updated `SearchResults.jsx` to show Alpaca-converted symbols on Buy/Sell buttons with conversion badges
- Build succeeds with no errors

Stage Summary:
- Symbol conversion rules: `BTC-USD`→`BTC/USD` (crypto), `EURUSD=X`→`EURUSD` (forex), `GC=F`→null (futures not tradeable), `^GSPC`→null (indices not tradeable)
- Two-layer defense: frontend conversion in OrderModal + backend conversion in BFF route
- User now sees conversion notice in OrderModal and SearchResults showing the mapping
- Non-tradable assets (futures, indices) are blocked before order submission with clear warnings

---
Task ID: 2
Agent: main
Task: Update OrderModal with asset-class-conditional order types and time-in-force per Alpaca API spec

Work Log:
- Analyzed screenshot showing "invalid crypto time_in_force" error
- Identified root cause: crypto orders only support gtc/ioc, but modal defaulted to "day"
- Created ORDER_TYPES and TIME_IN_FORCE config maps per Alpaca API spec:
  - Equity: market/limit/stop/stop_limit/trailing_stop, day/gtc/opg/cls/ioc/fok
  - Crypto: market/limit/stop_limit, gtc/ioc
  - Forex: market/limit, gtc/ioc/day
- Added stop_price input for stop/stop_limit orders
- Added trail_price/trail_percent toggle for trailing_stop orders
- Auto-resets orderType and TIF when asset class changes (e.g. equity → crypto)
- Updated alpaca-client.js to pass stop_price, trail_price, trail_percent
- Updated BFF route with server-side validation of order type & TIF per asset class
- Build succeeds, pushed as commit 8eaa0a5

Stage Summary:
- Fixed "invalid crypto time_in_force" error by restricting TIF options per asset class
- Full Alpaca API compliance for all supported order types and time-in-force values
- Three-layer validation: frontend dropdown filtering → frontend review → backend validation
