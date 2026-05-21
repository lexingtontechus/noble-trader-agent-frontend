/**
 * Shared configuration constants.
 * Single source of truth for the FastAPI backend URL and other config.
 */

export const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export const APP_VERSION = "v7.0.0";

/** Cache TTLs (milliseconds) */
export const CACHE_TTL = {
  PRICE_LATEST: 15_000,      // 15s for latest price
  PRICE_HISTORICAL: 360_000, // 6min for historical (was 5min default)
  SEED: 300_000,             // 5min for seed data
  COMMENTARY: 600_000,       // 10min for AI commentary
  ANALYSIS: 300_000,         // 5min for analysis results

  /** Redis L1 cache TTLs (seconds — Upstash setex uses seconds) */
  REDIS: {
    SNAPSHOT: 14_400,   // 4h  (same as Supabase TTL)
    PRICE: 15,          // 15s
    REGIME: 300,        // 5min
    BACKTEST: 3_600,    // 1h  (backtest results for identical configs)
  },
};

/** Polling intervals */
export const POLL_INTERVAL = {
  FAST: 15_000,     // 15s after failure
  DEFAULT: 30_000,  // 30s normal
  SLOW: 60_000,     // 60s when market is quiet
};

/** Rate limits — now managed by rate-limiter.js tiers */
export const RATE_LIMIT = {
  PRICE: { max: 30, windowMs: 60_000 },     // 30 req/min for prices (legacy compat)
  HISTORICAL: { max: 10, windowMs: 60_000 }, // 10 req/min for historical (legacy compat)
  // New tier-based system: see src/lib/rate-limiter.js → RATE_TIERS
  // Plan multipliers: free=1x, premium=3x, institutional=10x
  // Auto-detection via PATH_TIER_MAP in rate-limiter.js
};
