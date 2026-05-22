# Task: ws-p0-fixes — WebSocket Price Feed UI Critical Fixes

## Agent: Main Agent

## Work Log:

### P0-1: Yahoo Finance CORS — BFF Proxy
- Created `src/app/api/prices/search/route.js` — BFF proxy for Yahoo Finance autocomplete
  - Accepts `?q=` query parameter
  - Proxies to `https://query1.finance.yahoo.com/v1/finance/search?q=...&quotesCount=8&newsCount=0`
  - Adds `User-Agent: Mozilla/5.0` header
  - Uses `AbortSignal.timeout(8000)` for Vercel hobby safety
  - Wrapped with `withAuth({ minRole: "viewer", rateTier: "data" })`
  - In-memory cache with 5-minute TTL (search results don't change fast)
  - Returns `quotes` array filtered to EQUITY/CRYPTO/ETF/FUTURE types
  - Auto-evicts expired entries when cache exceeds 200 items
- Updated `WatchlistPanel.jsx` to call `/api/prices/search?q=...` instead of Yahoo directly

### P0-2: Finnhub Symbol Format Mismatch
- Added `yahooToFinnhubSymbol()` to `src/lib/symbol-utils.js`:
  - US Stocks (AAPL, SPY) → pass through unchanged
  - Crypto (BTC-USD) → "BINANCE:BTCUSDT"
  - Crypto (ETH-USD) → "BINANCE:ETHUSDT"
  - Other crypto (XXX-USD) → "BINANCE:XXXUSDT"
  - Forex (EURUSD=X) → "OANDA:EUR_USD"
  - Futures (GC=F) → null (not supported on free tier)
  - Indices (^GSPC) → null (not supported on free tier)
- Rewrote `useFinnhubPrice.js`:
  - Imports `yahooToFinnhubSymbol` and `getAssetClass` from symbol-utils
  - Before subscribing via WS, converts Yahoo symbols to Finnhub format
  - If conversion returns null, skips that symbol for WS (polling fallback)
  - Maintains `finnhubToYahooRef` reverse map for WS→Yahoo translation
  - On WS message, reverse-maps `trade.s` (Finnhub format) to Yahoo symbol for `processTrade()`
  - subscribe/unsubscribe methods also handle symbol format conversion
- Updated `PriceFeedContext.jsx` to import `yahooToFinnhubSymbol` from symbol-utils

### P0-3: Vercel Hobby Timeouts
- Updated `src/app/api/stream/latest-price/route.js`:
  - Changed `AbortSignal.timeout(15000)` → `AbortSignal.timeout(8000)`
  - Added `normalizeToYahooSymbol(symbol)` before Yahoo API call
  - Uses `encodeURIComponent(yahooSymbol)` instead of raw symbol
- Updated `src/app/api/prices/ohlc/route.js`:
  - Wrapped `yahooFinance.chart()` in `Promise.race` with 9-second timeout
  - On timeout, returns error (clean timeout behavior)

### P1-4: Chart Destroys on Indicator Toggle
- Major refactor of `LiveCandlestickChart.jsx`:
  - Separated chart creation effect (depends on: `chartType`, `chartPeriod`, `selectedSymbol`) from indicator management
  - Overlay indicators (SMA, EMA, BB) managed imperatively via `addLineSeries()`/`removeSeries()` — no chart recreation
  - RSI sub-chart managed in separate effect — only creates/destroys RSI chart
  - MACD sub-chart managed in separate effect — only creates/destroys MACD chart
  - Main chart, RSI, and MACD each in their own container div with flex layout
  - Time scale sync still works between main chart and sub-charts
  - User zoom/scroll position preserved when toggling overlay indicators
  - Always computes all indicator data so they're available immediately on toggle

### P1-5: PriceFeedPage Height/Layout Fix
- Updated `PriceFeedPage.jsx`:
  - Changed `h-[calc(100vh-8rem)]` → `h-[calc(100dvh-4rem)]` (4rem ≈ navbar height)
  - Removed inline mobile watchlist that was in the flex column (squished the chart)
  - Mobile watchlist is now a fixed bottom sheet overlay, only shown when toggled
  - Added toggle button in chart area (bottom-left hamburger icon, visible on mobile only)
  - Bottom sheet has backdrop, drag handle, and close button
  - Desktop watchlist sidebar unchanged

### P1-6: Dead chartInterval State Cleanup
- Removed `chartInterval` and `setChartInterval` from `PriceFeedContext.jsx`
- Removed from context value object and dependency arrays
- No other components reference `chartInterval` or `setChartInterval` (verified via grep)
- Chart derives interval from period via `PERIOD_OPTIONS` config in LiveCandlestickChart

## Build Verification:
- `npm run build` completed successfully — zero errors
- `/api/prices/search` route confirmed in build output
- All routes build correctly

## Files Modified:
1. `src/app/api/prices/search/route.js` — NEW
2. `src/components/pricefeed/WatchlistPanel.jsx` — BFF proxy call
3. `src/lib/symbol-utils.js` — added yahooToFinnhubSymbol()
4. `src/hooks/useFinnhubPrice.js` — complete rewrite with symbol conversion
5. `src/context/PriceFeedContext.jsx` — import + dead state removal
6. `src/app/api/stream/latest-price/route.js` — timeout + normalize
7. `src/app/api/prices/ohlc/route.js` — timeout race + normalize
8. `src/components/pricefeed/LiveCandlestickChart.jsx` — imperative indicator management
9. `src/components/pricefeed/PriceFeedPage.jsx` — layout fix + mobile bottom sheet
