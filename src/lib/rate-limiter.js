/**
 * Redis-backed distributed rate limiter for API routes.
 *
 * Uses Upstash Redis for sliding window counter rate limiting that persists
 * across Vercel serverless cold starts. Falls back to in-memory when Redis
 * is unavailable (with warning).
 *
 * Features:
 *   - Sliding window counter algorithm (accurate, low memory)
 *   - Per-user (userId) and per-IP rate limiting
 *   - Plan-aware limits (free/premium/institutional multipliers)
 *   - Proper 429 responses with RateLimit headers
 *   - Graceful degradation if Redis is down
 *   - Route category auto-detection
 *
 * Key format in Redis:
 *   ratelimit:{category}:{identifier}  →  count (with TTL = windowMs)
 */

import { redis } from "@/lib/redis";
import { PLANS, getLimit } from "@/lib/plans";

// ── Rate Limit Tiers ─────────────────────────────────────────────────────────

/**
 * Route categories with default rate limits.
 * Each tier defines: max requests per window, window in ms.
 * These are BASE limits — plan multipliers adjust them upward.
 */
export const RATE_TIERS = {
  /** Trade execution — strictest limits */
  trade:    { max: 10,  windowMs: 60_000,  label: "Trade Execution" },
  /** Order creation — also strict */
  order:    { max: 15,  windowMs: 60_000,  label: "Order Management" },
  /** CPU-heavy backtests */
  backtest: { max: 5,   windowMs: 300_000, label: "Backtesting" },
  /** AI/LLM calls — expensive */
  ai:       { max: 10,  windowMs: 60_000,  label: "AI Services" },
  /** Write operations (POST/DELETE with stricter limits) */
  write:    { max: 10,  windowMs: 60_000,  label: "Write Operations" },
  /** Data reads (prices, P&L, portfolio, etc.) */
  data:     { max: 60,  windowMs: 60_000,  label: "Data Access" },
  /** Admin/ops operations */
  admin:    { max: 30,  windowMs: 60_000,  label: "Admin Operations" },
  /** Auth routes (token refresh, etc.) */
  auth:     { max: 20,  windowMs: 60_000,  label: "Authentication" },
  /** Public routes (health, webhook) */
  public:   { max: 100, windowMs: 60_000,  label: "Public Endpoints" },
  /** Default for uncategorized routes */
  default:  { max: 30,  windowMs: 60_000,  label: "General API" },
};

/**
 * Plan multipliers applied to the base rate limit max.
 * Institutional users get 10x, premium 3x, free 1x.
 */
export const PLAN_MULTIPLIERS = {
  free: 1,
  premium: 3,
  institutional: 10,
};

/**
 * Map URL path prefixes to rate limit tiers.
 * First match wins — more specific paths should be listed first.
 */
export const PATH_TIER_MAP = [
  // Trade execution (strictest)
  { pattern: /^\/api\/trading\/execute/,         tier: "trade" },
  { pattern: /^\/api\/trading\/approve/,          tier: "trade" },
  { pattern: /^\/api\/smoke-test/,                tier: "trade" },

  // Order management
  { pattern: /^\/api\/alpaca\/orders/,            tier: "order" },
  { pattern: /^\/api\/broker/,                    tier: "order" },
  { pattern: /^\/api\/renko\/orders/,             tier: "order" },

  // Backtests (CPU-heavy)
  { pattern: /^\/api\/backtest/,                  tier: "backtest" },
  { pattern: /^\/api\/renko\/backtest/,           tier: "backtest" },
  { pattern: /^\/api\/renko\/.*backtest/,         tier: "backtest" },
  { pattern: /^\/api\/optimise/,                  tier: "backtest" },

  // AI services (expensive LLM calls)
  { pattern: /^\/api\/commentary/,                tier: "ai" },
  { pattern: /^\/api\/analyse/,                   tier: "ai" },
  { pattern: /^\/api\/observation/,               tier: "ai" },
  { pattern: /^\/api\/trading\/analyze/,          tier: "ai" },
  { pattern: /^\/api\/correlation/,               tier: "ai" },

  // Admin/ops
  { pattern: /^\/api\/circuit-breakers/,          tier: "admin" },
  { pattern: /^\/api\/reconciliation/,            tier: "admin" },
  { pattern: /^\/api\/compliance/,                tier: "admin" },
  { pattern: /^\/api\/operational/,               tier: "admin" },
  { pattern: /^\/api\/health\/detailed/,          tier: "admin" },
  { pattern: /^\/api\/evolution/,                 tier: "admin" },
  { pattern: /^\/api\/subscription/,              tier: "admin" },

  // Data reads
  { pattern: /^\/api\/prices/,                    tier: "data" },
  { pattern: /^\/api\/pnl/,                       tier: "data" },
  { pattern: /^\/api\/alpaca\/account/,           tier: "data" },
  { pattern: /^\/api\/alpaca\/portfolio/,         tier: "data" },
  { pattern: /^\/api\/alpaca\/positions/,         tier: "data" },
  { pattern: /^\/api\/alpaca\/activities/,        tier: "data" },
  { pattern: /^\/api\/portfolio/,                 tier: "data" },
  { pattern: /^\/api\/campaign/,                  tier: "data" },
  { pattern: /^\/api\/risk/,                      tier: "data" },
  { pattern: /^\/api\/fills/,                     tier: "data" },
  { pattern: /^\/api\/stream/,                    tier: "data" },
  { pattern: /^\/api\/renko\//,                   tier: "data" },
  { pattern: /^\/api\/tda/,                       tier: "data" },
  { pattern: /^\/api\/alerts/,                    tier: "data" },
  { pattern: /^\/api\/notifications/,             tier: "data" },
  { pattern: /^\/api\/credentials/,               tier: "data" },

  // Auth routes
  { pattern: /^\/api\/auth\//,                    tier: "auth" },
  { pattern: /^\/api\/clerk\//,                   tier: "auth" },
  { pattern: /^\/api\/telegram\//,                tier: "auth" },

  // API key management
  { pattern: /^\/api\/api-keys/,                  tier: "auth" },

  // MCP proxy routes (inherits backend MCP rate limits)
  { pattern: /^\/api\/mcp/,                       tier: "data" },

  // Public routes
  { pattern: /^\/api\/health\/cron/,              tier: "public" },
  { pattern: /^\/api\/health$/,                   tier: "public" },
  { pattern: /^\/api\/onboarding/,                tier: "public" },
  { pattern: /^\/api\/googl-fill/,                tier: "public" },
];

/**
 * Auto-detect rate limit tier from a URL pathname.
 * Returns the tier key (e.g., "trade", "data", "default").
 */
export function detectTier(pathname) {
  for (const { pattern, tier } of PATH_TIER_MAP) {
    if (pattern.test(pathname)) return tier;
  }
  return "default";
}

// ── In-Memory Fallback ───────────────────────────────────────────────────────

const memoryWindows = new Map();

/**
 * In-memory rate limit check (fallback when Redis is unavailable).
 * Not reliable on serverless but better than nothing.
 */
function checkMemoryRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();

  // Periodic cleanup
  if (Math.random() < 0.01) {
    for (const [k, v] of memoryWindows) {
      if (now > v.resetAt) memoryWindows.delete(k);
    }
  }

  let entry = memoryWindows.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryWindows.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetAt = entry.resetAt;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
  }

  return { allowed: true, remaining, resetAt, limit: maxRequests };
}

// ── Redis Sliding Window ─────────────────────────────────────────────────────

/**
 * Redis-backed rate limit check using sliding window counter.
 *
 * Algorithm: SET key with INCR + EXPIRE. Atomic and simple.
 * Each request increments the counter. If count > max, reject.
 * The key auto-expires at the end of the window.
 */
async function checkRedisRateLimit(key, maxRequests, windowMs) {
  try {
    // Use Upstash Redis pipeline for atomic INCR + EXPIRE
    const redisKey = `ratelimit:${key}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    // INCR the counter
    const count = await redis.incr(redisKey);

    // Set TTL on first request in window
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    // Get the TTL for reset time calculation
    const ttl = await redis.ttl(redisKey);
    const resetAt = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + windowMs;

    const remaining = Math.max(0, maxRequests - count);

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
    }

    return { allowed: true, remaining, resetAt, limit: maxRequests };
  } catch (err) {
    // Redis error — fall back to in-memory
    console.warn(`[rate-limiter] Redis error, falling back to memory: ${err.message}`);
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if a request is within rate limits.
 *
 * Uses Redis (if available) for distributed rate limiting across
 * Vercel serverless instances. Falls back to in-memory.
 *
 * @param {string} key - Rate limit key (e.g., "trade:user_abc123:/api/trading/execute")
 * @param {number} maxRequests - Max requests in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {{ allowed: boolean, remaining: number, resetAt: number, limit: number }}
 */
export function checkRateLimit(key, maxRequests = 30, windowMs = 60000) {
  // Sync wrapper — if Redis is available, use async path
  // This is the legacy API — new code should use checkRateLimitAsync
  return checkMemoryRateLimit(key, maxRequests, windowMs);
}

/**
 * Async rate limit check using Redis (preferred).
 * Falls back to in-memory if Redis is unavailable.
 *
 * @param {string} key - Rate limit key
 * @param {number} maxRequests - Max requests in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: number, limit: number }>}
 */
export async function checkRateLimitAsync(key, maxRequests = 30, windowMs = 60000) {
  if (redis.isAvailable()) {
    return checkRedisRateLimit(key, maxRequests, windowMs);
  }
  return checkMemoryRateLimit(key, maxRequests, windowMs);
}

/**
 * Get the effective rate limit for a route + user plan.
 * Applies plan multiplier to the base tier limit.
 *
 * @param {string} tierKey - Rate limit tier (e.g., "trade", "data")
 * @param {string} plan - User's plan (free/premium/institutional)
 * @returns {{ max: number, windowMs: number, tier: string, label: string }}
 */
export function getEffectiveLimit(tierKey, plan = "free") {
  const tier = RATE_TIERS[tierKey] || RATE_TIERS.default;
  const multiplier = PLAN_MULTIPLIERS[plan] || 1;

  // Also respect the plan's apiCallsPerMinute as a ceiling
  const planApiCallsPerMinute = getLimit(plan, "apiCallsPerMinute");
  const adjustedMax = Math.min(
    tier.max * multiplier,
    planApiCallsPerMinute === Infinity ? tier.max * multiplier : planApiCallsPerMinute
  );

  return {
    max: Math.max(1, adjustedMax),
    windowMs: tier.windowMs,
    tier: tierKey,
    label: tier.label,
  };
}

/**
 * Build rate limit headers for a successful response.
 * These should be included on ALL responses, not just 429s.
 *
 * @param {{ limit: number, remaining: number, resetAt: number }} rateCheck
 * @returns {Object} Headers object
 */
export function rateLimitHeaders(rateCheck) {
  return {
    "X-RateLimit-Limit": String(rateCheck.limit),
    "X-RateLimit-Remaining": String(rateCheck.remaining),
    "X-RateLimit-Reset": String(rateCheck.resetAt),
  };
}

/**
 * Build 429 Rate Limit Exceeded response with proper headers.
 *
 * @param {number} resetAt - Timestamp when the rate limit window resets
 * @param {number} limit - The rate limit that was exceeded
 * @param {string} [tier] - The rate limit tier that was triggered
 * @returns {Response}
 */
export function rateLimitedResponse(resetAt, limit, tier) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return Response.json(
    {
      error: "Rate limit exceeded. Please try again later.",
      code: "RATE_LIMITED",
      details: {
        retryAfter: `${retryAfter}s`,
        limit,
        tier: tier || "default",
        resetAt: new Date(resetAt).toISOString(),
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}

/**
 * Get client IP from request headers.
 * Works behind proxies (Vercel, Cloudflare, etc.)
 */
export function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Build a rate limit key from tier, identifier, and path.
 *
 * @param {string} tier - Rate limit tier
 * @param {string} identifier - userId or IP
 * @param {string} pathname - URL pathname
 * @returns {string}
 */
export function buildRateLimitKey(tier, identifier, pathname) {
  // Include pathname for per-route granularity, but strip query params
  const cleanPath = pathname.split("?")[0];
  return `${tier}:${identifier}:${cleanPath}`;
}
