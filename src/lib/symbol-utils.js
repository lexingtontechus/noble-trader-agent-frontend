/**
 * Symbol format conversion utilities.
 *
 * Yahoo Finance and Alpaca use different symbol formats for
 * crypto, forex, and futures. These helpers convert between them
 * so that symbols coming from Yahoo-Finance-based search results
 * are correctly translated before being sent to the Alpaca API.
 *
 * Mapping rules:
 * ───────────────────────────────────────────────────────────
 * Yahoo Finance          →  Alpaca              →  Type
 * ───────────────────────────────────────────────────────────
 * BTC-USD                →  BTC/USD             →  Crypto
 * ETH-USD                →  ETH/USD             →  Crypto
 * ANY-USD                →  ANY/USD             →  Crypto
 * EURUSD=X               →  EURUSD              →  Forex
 * GBPUSD=X               →  GBPUSD              →  Forex
 * GC=F (Gold future)     →  N/A (not tradable)  →  Future
 * ^GSPC (S&P 500 index)  →  N/A (use SPY ETF)   →  Index
 * AAPL                   →  AAPL                →  Stock
 * ───────────────────────────────────────────────────────────
 *
 * IMPORTANT: Forex is NOT tradable on Alpaca (only US equities
 * and crypto).  However, we still convert the symbol format so
 * that features like correlation detection and portfolio
 * optimization can work with forex data from Yahoo Finance.
 * The OrderModal and order creation route block forex orders
 * separately via getAssetClass().
 */

/**
 * Convert a Yahoo Finance symbol to an Alpaca-compatible symbol.
 * Returns the converted symbol, or null if the asset is not
 * tradable on Alpaca (e.g. indices, futures).
 *
 * NOTE: Forex symbols (EURUSD=X → EURUSD) ARE converted here
 * because other features (correlation, optimizer) need the
 * Alpaca format.  Forex order placement is blocked separately
 * in OrderModal and /api/alpaca/orders/create via isAlpacaTradable()
 * which checks getAssetClass().
 */
export function yahooToAlpacaSymbol(yahooSymbol) {
  if (!yahooSymbol || typeof yahooSymbol !== 'string') return yahooSymbol;

  const sym = yahooSymbol.trim().toUpperCase();

  // 1. Crypto: "BTC-USD" → "BTC/USD"
  //    Yahoo uses HYPHEN for crypto pairs (BASE-QUOTE)
  //    Alpaca uses FORWARD SLASH (BASE/QUOTE)
  const cryptoMatch = sym.match(/^([A-Z]{2,5})-([A-Z]{3})$/);
  if (cryptoMatch) {
    return `${cryptoMatch[1]}/${cryptoMatch[2]}`;
  }

  // 2. Forex: "EURUSD=X" → "EURUSD"
  //    Yahoo appends "=X" to forex pairs
  //    Alpaca uses the bare pair code
  //    NOTE: Forex is NOT tradable on Alpaca — blocked in OrderModal
  if (sym.endsWith('=X')) {
    return sym.replace(/=X$/, '');
  }

  // 3. Futures: "GC=F", "ES=F", "CL=F" → not tradable on Alpaca
  if (sym.includes('=F')) {
    return null;
  }

  // 4. Indices: "^GSPC", "^DJI", "^IXIC" → not tradable on Alpaca
  if (sym.startsWith('^')) {
    return null;
  }

  // 5. Regular stock / ETF symbols pass through unchanged
  return sym;
}

/**
 * Get a human-readable label for why a symbol can't be traded on Alpaca.
 * Returns null if the symbol IS tradeable.
 */
export function getAlpacaTradeabilityReason(yahooSymbol) {
  if (!yahooSymbol || typeof yahooSymbol !== 'string') return null;

  const sym = yahooSymbol.trim().toUpperCase();

  if (sym.includes('=F')) {
    return 'Futures contracts are not available on Alpaca paper trading';
  }

  if (sym.startsWith('^')) {
    return 'Indices are not directly tradeable — use the corresponding ETF (e.g. SPY for S&P 500)';
  }

  // Forex is NOT supported by Alpaca (only US equities and crypto)
  if (sym.endsWith('=X')) {
    return 'Forex trading is not available on Alpaca — Alpaca only supports US equities and crypto trading';
  }

  return null;
}

/**
 * Check whether a Yahoo Finance symbol can be traded on Alpaca.
 * Forex is excluded because Alpaca only supports US equities and crypto.
 */
export function isAlpacaTradable(yahooSymbol) {
  if (!yahooSymbol || typeof yahooSymbol !== 'string') return false;

  const sym = yahooSymbol.trim().toUpperCase();

  // Forex not tradable on Alpaca
  if (sym.endsWith('=X')) return false;

  // Futures / indices not tradable
  if (sym.includes('=F')) return false;
  if (sym.startsWith('^')) return false;

  return true;
}

/**
 * Get the asset class for display purposes.
 */
export function getAssetClass(yahooSymbol) {
  if (!yahooSymbol || typeof yahooSymbol !== 'string') return 'unknown';

  const sym = yahooSymbol.trim().toUpperCase();

  if (/^[A-Z]{2,5}-[A-Z]{3}$/.test(sym)) return 'crypto';
  if (sym.endsWith('=X')) return 'forex';
  if (sym.includes('=F')) return 'futures';
  if (sym.startsWith('^')) return 'index';

  return 'stock';
}

/**
 * Reverse conversion: Alpaca symbol → Yahoo Finance symbol.
 * Useful when we need to fetch Yahoo Finance data for an Alpaca position.
 *
 * Known crypto pairs: "BTC/USD" → "BTC-USD"
 * Known forex pairs: "EURUSD" → "EURUSD=X"
 * Everything else: pass through unchanged
 */
export function alpacaToYahooSymbol(alpacaSymbol) {
  if (!alpacaSymbol || typeof alpacaSymbol !== 'string') return alpacaSymbol;

  const sym = alpacaSymbol.trim().toUpperCase();

  // Crypto: "BTC/USD" → "BTC-USD"
  const cryptoMatch = sym.match(/^([A-Z]{2,5})\/([A-Z]{3})$/);
  if (cryptoMatch) {
    return `${cryptoMatch[1]}-${cryptoMatch[2]}`;
  }

  // Forex: "EURUSD" → "EURUSD=X"
  //        6-letter all-alpha codes that match known forex pairs
  const FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
    'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY',
  ];
  if (FOREX_PAIRS.includes(sym)) {
    return `${sym}=X`;
  }

  // Everything else (stocks, ETFs) — same format in both systems
  return sym;
}
