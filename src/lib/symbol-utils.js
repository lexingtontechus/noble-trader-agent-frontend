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
 * Well-known cryptocurrency base currencies.
 * Used to detect bare crypto symbols (e.g. "BTC") that need to be
 * converted to Yahoo Finance format (e.g. "BTC-USD") before
 * calling the Yahoo Finance API.
 *
 * When a user types just "BTC" or "ETH" in the search box, or
 * when Alpaca returns a position with a bare crypto base symbol,
 * this set allows us to recognize it as crypto rather than a
 * stock ticker.
 */
const CRYPTO_BASES = new Set([
  // Top market-cap coins
  'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOT', 'DOGE',
  'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'ETC',
  'XLM', 'ALGO', 'VET', 'NEAR', 'FIL', 'FTM', 'APT',
  'ARB', 'OP', 'SHIB', 'CRO', 'LDO', 'SAND', 'MANA',
  'AAVE', 'MKR', 'GRT', 'CRV', 'SNX', 'COMP', 'YFI',
  'SUSHI', '1INCH', 'ENJ', 'BAT', 'ZRX', 'RENDER',
  'IMX', 'STX', 'TIA', 'SEI', 'SUI', 'PEPE', 'WIF',
  'BONK', 'JUP', 'JTO', 'PYTH', 'ONDO', 'ENA', 'ETHFI',
  'W', 'STARK', 'STRK', 'DYDX', 'GMX', 'PENDLE', 'IO',
  // Stablecoins (for completeness)
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX',
  // Wrapped / pegged tokens
  'WBTC', 'WETH', 'STETH', 'CBETH', 'RETH',
  // Other frequently traded
  'XTZ', 'HBAR', 'FLOW', 'KAVA', 'RUNE', 'INJ', 'OSMO',
  'TWT', 'CHZ', 'ZIL', 'ONT', 'IOST', 'ICX', 'WAVES',
  'DASH', 'NEO', 'KLAY', 'FTM',
]);

/**
 * Known fiat currency codes used in forex and crypto pairs.
 * Used by normalizeToYahooSymbol() to detect forex pairs when
 * a 6-letter all-alpha code is provided (e.g. "EURUSD").
 */
const FIAT_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
  'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'MXN', 'BRL', 'ZAR',
  'KRW', 'INR', 'RUB', 'TRY', 'THB', 'IDR', 'MYR', 'PHP',
  'CZK', 'PLN', 'ILS', 'CLP', 'COP', 'PEN', 'ARS', 'TWD',
]);

/**
 * Normalize ANY symbol to the correct Yahoo Finance format.
 *
 * This is the single source of truth for "whatever the user or
 * system gives us → what Yahoo Finance expects".  Call this at
 * every entry point that calls the Yahoo Finance API.
 *
 * Handles all known input formats:
 * ┌─────────────────┬─────────────────┬────────────┐
 * │ Input           │ Output          │ Type       │
 * ├─────────────────┼─────────────────┼────────────┤
 * │ "BTC"           │ "BTC-USD"       │ Bare crypto│
 * │ "ETH"           │ "ETH-USD"       │ Bare crypto│
 * │ "BTC/USD"       │ "BTC-USD"       │ Alpaca cry.│
 * │ "BTC-USD"       │ "BTC-USD"       │ Yahoo cry. │
 * │ "BTCUSD"        │ "BTC-USD"       │ Concat cry.│
 * │ "EURUSD"        │ "EURUSD=X"      │ Forex      │
 * │ "EURUSD=X"      │ "EURUSD=X"      │ Yahoo forex│
 * │ "AAPL"          │ "AAPL"          │ Stock      │
 * │ "GC=F"          │ "GC=F"          │ Future     │
 * │ "^GSPC"         │ "^GSPC"         │ Index      │
 * └─────────────────┴─────────────────┴────────────┘
 *
 * @param {string} symbol - Symbol in any known format
 * @returns {string} Symbol in Yahoo Finance format
 */
export function normalizeToYahooSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return symbol;

  const sym = symbol.trim().toUpperCase();

  // ── Already in Yahoo Finance format ────────────────────────

  // Crypto: "BTC-USD" (already correct)
  if (/^[A-Z]{2,5}-[A-Z]{3}$/.test(sym)) return sym;

  // Forex: "EURUSD=X" (already correct)
  if (sym.endsWith('=X')) return sym;

  // Futures: "GC=F" (already correct)
  if (sym.includes('=F')) return sym;

  // Indices: "^GSPC" (already correct)
  if (sym.startsWith('^')) return sym;

  // ── Alpaca format conversions ──────────────────────────────

  // Crypto: "BTC/USD" → "BTC-USD"
  const cryptoSlashMatch = sym.match(/^([A-Z]{2,5})\/([A-Z]{3})$/);
  if (cryptoSlashMatch) {
    return `${cryptoSlashMatch[1]}-${cryptoSlashMatch[2]}`;
  }

  // ── Bare crypto detection ──────────────────────────────────

  // Known bare crypto base: "BTC" → "BTC-USD"
  if (CRYPTO_BASES.has(sym)) {
    return `${sym}-USD`;
  }

  // ── Concatenated crypto pair detection ─────────────────────

  // "BTCUSD" → check if starts with a known crypto base + fiat
  // This handles cases where Alpaca or other systems return
  // crypto pairs without a separator.
  if (/^[A-Z]{3,8}$/.test(sym) && sym.length >= 6) {
    // Try splitting at known crypto bases (longest first)
    const sortedBases = [...CRYPTO_BASES].sort((a, b) => b.length - a.length);
    for (const base of sortedBases) {
      if (sym.startsWith(base)) {
        const quote = sym.slice(base.length);
        if (quote.length >= 3 && FIAT_CODES.has(quote)) {
          return `${base}-${quote}`;
        }
      }
    }
  }

  // ── Forex detection ────────────────────────────────────────

  // 6-letter all-alpha code: "EURUSD" → "EURUSD=X"
  // Must be exactly 6 alpha chars that split into two known fiat codes
  if (/^[A-Z]{6}$/.test(sym)) {
    const first3 = sym.slice(0, 3);
    const last3 = sym.slice(3, 6);
    if (FIAT_CODES.has(first3) && FIAT_CODES.has(last3)) {
      return `${sym}=X`;
    }
  }

  // ── Default: treat as stock / ETF ──────────────────────────
  return sym;
}

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
 * Accepts symbols in any format (Yahoo, Alpaca, or bare).
 */
export function getAssetClass(symbol) {
  if (!symbol || typeof symbol !== 'string') return 'unknown';

  const sym = symbol.trim().toUpperCase();

  // Yahoo crypto: "BTC-USD"
  if (/^[A-Z]{2,5}-[A-Z]{3}$/.test(sym)) return 'crypto';

  // Alpaca crypto: "BTC/USD"
  if (/^[A-Z]{2,5}\/[A-Z]{3}$/.test(sym)) return 'crypto';

  // Bare known crypto base: "BTC", "ETH"
  if (CRYPTO_BASES.has(sym)) return 'crypto';

  // Yahoo forex: "EURUSD=X"
  if (sym.endsWith('=X')) return 'forex';

  // 6-letter all-alpha forex pair: "EURUSD"
  if (/^[A-Z]{6}$/.test(sym)) {
    const first3 = sym.slice(0, 3);
    const last3 = sym.slice(3, 6);
    if (FIAT_CODES.has(first3) && FIAT_CODES.has(last3)) return 'forex';
  }

  // Futures / indices
  if (sym.includes('=F')) return 'futures';
  if (sym.startsWith('^')) return 'index';

  return 'stock';
}

/**
 * Reverse conversion: Alpaca symbol → Yahoo Finance symbol.
 * Useful when we need to fetch Yahoo Finance data for an Alpaca position.
 *
 * Known crypto pairs: "BTC/USD" → "BTC-USD"
 * Bare crypto bases:  "BTC"     → "BTC-USD"   (NEW)
 * Known forex pairs:  "EURUSD"  → "EURUSD=X"
 * Everything else:    pass through unchanged
 */
export function alpacaToYahooSymbol(alpacaSymbol) {
  if (!alpacaSymbol || typeof alpacaSymbol !== 'string') return alpacaSymbol;

  const sym = alpacaSymbol.trim().toUpperCase();

  // Crypto: "BTC/USD" → "BTC-USD"
  const cryptoSlashMatch = sym.match(/^([A-Z]{2,5})\/([A-Z]{3})$/);
  if (cryptoSlashMatch) {
    return `${cryptoSlashMatch[1]}-${cryptoSlashMatch[2]}`;
  }

  // Bare crypto base: "BTC" → "BTC-USD"
  // Alpaca sometimes returns just the base symbol for crypto positions,
  // or users may type a bare crypto symbol in the search box.
  if (CRYPTO_BASES.has(sym)) {
    return `${sym}-USD`;
  }

  // Forex: "EURUSD" → "EURUSD=X"
  //        6-letter all-alpha codes that match known fiat pairs
  if (/^[A-Z]{6}$/.test(sym)) {
    const first3 = sym.slice(0, 3);
    const last3 = sym.slice(3, 6);
    if (FIAT_CODES.has(first3) && FIAT_CODES.has(last3)) {
      return `${sym}=X`;
    }
  }

  // Everything else (stocks, ETFs) — same format in both systems
  return sym;
}
