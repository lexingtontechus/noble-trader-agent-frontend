---
Task ID: 1
Agent: Main Agent
Task: Fix incorrect crypto symbol formatting causing "No data found, symbol may be delisted" error

Work Log:
- Read correlation/route.js and optimizer/route.js — both use alpacaToYahooSymbol() + fetchHistoricalPrices()
- Read yahoo-prices.js — the gateway to Yahoo Finance, passes symbols through without normalization
- Read symbol-utils.js — alpacaToYahooSymbol() only handles BTC/USD→BTC-USD but NOT bare BTC→BTC-USD
- Read analyse/route.js — has inline Yahoo Finance call, no normalization
- Read prices/route.js — delegates to fetchHistoricalPrices but cache key uses raw symbol
- Read observation/build/route.js — delegates to fetchHistoricalOHLC, no normalization
- Read SearchPage.jsx — popular tickers already have BTC-USD format, but users can type bare "BTC"
- Read Dashboard.jsx — DEFAULT_TICKERS already use BTC-USD format

Root Cause:
- Bare crypto symbols (BTC, ETH, DOGE) pass through alpacaToYahooSymbol() unchanged
- Yahoo Finance requires crypto symbols in BTC-USD format, not bare BTC
- The /api/analyse route has its own inline Yahoo Finance call with no normalization

Fix Applied (6 files changed):

1. src/lib/symbol-utils.js — Major enhancement:
   - Added CRYPTO_BASES set (90+ known crypto base currencies)
   - Added FIAT_CODES set (30+ known fiat currencies for forex detection)
   - Added normalizeToYahooSymbol() — single source of truth for ANY→Yahoo conversion
   - Enhanced alpacaToYahooSymbol() to handle bare crypto (BTC→BTC-USD)
   - Enhanced getAssetClass() to recognize bare crypto and Alpaca crypto (BTC/USD)
   - Added concatenated crypto pair detection (BTCUSD→BTC-USD)
   - Enhanced forex detection to use FIAT_CODES instead of hardcoded list

2. src/lib/yahoo-prices.js — Defensive normalization at Yahoo Finance gateway:
   - fetchHistoricalPrices() now normalizes before querying
   - fetchHistoricalOHLC() now normalizes before querying
   - Cache keys use normalized symbol to avoid duplicate entries

3. src/app/api/analyse/route.js — Normalize at entry point:
   - Import and use normalizeToYahooSymbol() before Yahoo Finance call
   - Cache key uses normalized symbol

4. src/app/api/prices/route.js — Normalize at entry point:
   - Import and use normalizeToYahooSymbol() for raw query param
   - Cache key uses normalized symbol

5. src/app/api/observation/build/route.js — Normalize at entry point:
   - Import and use normalizeToYahooSymbol() before OHLC fetch
   - Cache key and symbol in response use normalized format

6. src/app/api/portfolio/correlation/route.js & optimizer/route.js — 
   - No changes needed: already use alpacaToYahooSymbol() which now handles bare crypto

Testing Results:
- Unit tests: 13/13 normalizeToYahooSymbol tests passed (BTC→BTC-USD, ETH→ETH-USD, DOGE→DOGE-USD, BTC/USD→BTC-USD, BTC-USD→BTC-USD, BTCUSD→BTC-USD, EURUSD→EURUSD=X, EURUSD=X→EURUSD=X, AAPL→AAPL, MSFT→MSFT, GC=F→GC=F, ^GSPC→^GSPC)
- alpacaToYahooSymbol: 7/7 tests passed (bare crypto + Alpaca format + forex)
- getAssetClass: 9/9 tests passed (bare crypto + Yahoo crypto + Alpaca crypto + forex + stock + futures + index)
- Live Yahoo Finance: 4/4 tests passed (BTC-USD: 31 bars, ETH-USD: 31 bars, DOGE-USD: 31 bars, AAPL: 23 bars)

Stage Summary:
- Fixed the root cause: bare crypto symbols now normalize to Yahoo Finance format
- Triple-layer defense: normalize at API route entry, normalize at yahoo-prices gateway, and alpacaToYahooSymbol handles bare crypto
- All test cases pass both unit and live API tests
