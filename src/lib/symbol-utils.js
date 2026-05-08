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
 * EURUSD=X               →  N/A (not tradable)  →  Forex
 * GBPUSD=X               →  N/A (not tradable)  →  Forex
 * GC=F (Gold future)     →  N/A (not tradable)  →  Future
 * ^GSPC (S&P 500 index)  →  N/A (use SPY ETF)   →  Index
 * AAPL                   →  AAPL                →  Stock
 * ───────────────────────────────────────────────────────────
 */

/**
 * Convert a Yahoo Finance symbol to an Alpaca-compatible symbol.
 * Returns the converted symbol, or null if the asset is not
 * tradable on Alpaca (e.g. indices, futures).
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

  // 2. Forex: "EURUSD=X" → NOT tradable on Alpaca
  //    Alpaca does NOT support forex trading.
  //    Only US equities and crypto are supported.
  if (sym.endsWith('=X')) {
    return null;
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

  // Forex check — Alpaca does NOT support forex trading
  if (sym.endsWith('=X')) {
    const converted = sym.replace(/=X$/, '');
    return `Forex pair ${converted} is not available on Alpaca — Alpaca only supports US equities and crypto trading`;
  }

  return null;
}

/**
 * Check whether a Yahoo Finance symbol can be traded on Alpaca.
 */
export function isAlpacaTradable(yahooSymbol) {
  return yahooToAlpacaSymbol(yahooSymbol) !== null;
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
 */
export function alpacaToYahooSymbol(alpacaSymbol) {
  if (!alpacaSymbol || typeof alpacaSymbol !== 'string') return alpacaSymbol;

  const sym = alpacaSymbol.trim().toUpperCase();

  // Crypto: "BTC/USD" → "BTC-USD"
  const cryptoMatch = sym.match(/^([A-Z]{2,5})\/([A-Z]{3})$/);
  if (cryptoMatch) {
    return `${cryptoMatch[1]}-${cryptoMatch[2]}`;
  }

  // Forex: We can't reliably reverse this without knowing which
  // 6-letter codes are forex vs stocks. Best to leave as-is.
  return sym;
}
