/**
 * Shared configuration constants.
 * Single source of truth for the FastAPI backend URL and other config.
 */

export const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export const APP_VERSION = "v3.1";

/** Cache TTLs (milliseconds) */
export const CACHE_TTL = {
  PRICE_LATEST: 15_000,      // 15s for latest price
  PRICE_HISTORICAL: 360_000, // 6min for historical (was 5min default)
  SEED: 300_000,             // 5min for seed data
  COMMENTARY: 600_000,       // 10min for AI commentary
  ANALYSIS: 300_000,         // 5min for analysis results
};

/** Polling intervals */
export const POLL_INTERVAL = {
  FAST: 15_000,     // 15s after failure
  DEFAULT: 30_000,  // 30s normal
  SLOW: 60_000,     // 60s when market is quiet
};

/** Rate limits */
export const RATE_LIMIT = {
  PRICE: { max: 30, windowMs: 60_000 },     // 30 req/min for prices
  HISTORICAL: { max: 10, windowMs: 60_000 }, // 10 req/min for historical
};
