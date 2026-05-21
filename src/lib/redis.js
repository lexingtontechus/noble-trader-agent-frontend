/**
 * Upstash Redis client — L1 cache for Renko snapshots.
 * Supabase is L2 (persistent, slower). Redis is L1 (fast, in-memory).
 *
 * Cache keys:
 *   renko:snapshot:{symbol}:{brickSize} — full pipeline snapshot JSON
 *   renko:price:{symbol}                — latest price (15s TTL)
 *   renko:regime:{symbol}               — current regime label (5min TTL)
 *
 * All methods gracefully degrade: if Redis is not configured or an
 * operation fails, they silently return null/false without breaking
 * the application.
 */

import { Redis } from "@upstash/redis";
import { CACHE_TTL } from "@/lib/config";

// ── Singleton client ────────────────────────────────────────────────────────

let _client = undefined; // undefined = not yet initialised; null = unavailable

/**
 * Lazily create the Upstash Redis client.
 * Returns null if env vars are not configured.
 */
function getClient() {
  if (_client !== undefined) return _client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — L1 cache disabled");
    _client = null;
    return null;
  }

  try {
    _client = new Redis({ url, token });
    return _client;
  } catch (err) {
    console.error("[redis] Failed to create client:", err.message);
    _client = null;
    return null;
  }
}

// ── Core operations ─────────────────────────────────────────────────────────

/**
 * Get a JSON value from Redis.
 * Returns null on miss, error, or if Redis is unavailable.
 */
async function get(key) {
  try {
    const client = getClient();
    if (!client) return null;
    const value = await client.get(key);
    return value ?? null;
  } catch (err) {
    console.warn(`[redis] GET ${key} failed:`, err.message);
    return null;
  }
}

/**
 * Set a JSON value with optional TTL (seconds).
 * Returns false on error or if Redis is unavailable.
 */
async function set(key, value, ttlSeconds) {
  try {
    const client = getClient();
    if (!client) return false;
    // @upstash/redis handles JSON serialization automatically
    if (ttlSeconds && ttlSeconds > 0) {
      await client.setex(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (err) {
    console.warn(`[redis] SET ${key} failed:`, err.message);
    return false;
  }
}

/**
 * Delete a key from Redis.
 * Returns false on error or if Redis is unavailable.
 */
async function del(key) {
  try {
    const client = getClient();
    if (!client) return false;
    await client.del(key);
    return true;
  } catch (err) {
    console.warn(`[redis] DEL ${key} failed:`, err.message);
    return false;
  }
}

// ── Convenience: Renko snapshots ─────────────────────────────────────────────

/**
 * Get a cached Renko snapshot from Redis L1.
 */
async function getSnapshot(symbol, brickSize) {
  const key = `renko:snapshot:${symbol}:${brickSize}`;
  return get(key);
}

/**
 * Save a Renko snapshot to Redis L1.
 * Default TTL: 4 hours (matches Supabase TTL).
 */
async function setSnapshot(symbol, brickSize, data, ttlSeconds = CACHE_TTL.REDIS.SNAPSHOT) {
  const key = `renko:snapshot:${symbol}:${brickSize}`;
  return set(key, data, ttlSeconds);
}

/**
 * Delete a Renko snapshot from Redis L1.
 */
async function delSnapshot(symbol, brickSize) {
  const key = `renko:snapshot:${symbol}:${brickSize}`;
  return del(key);
}

// ── Convenience: Latest price ────────────────────────────────────────────────

/**
 * Get the latest price for a symbol from Redis.
 */
async function getPrice(symbol) {
  const key = `renko:price:${symbol}`;
  return get(key);
}

/**
 * Save the latest price for a symbol to Redis.
 * Default TTL: 15 seconds.
 */
async function setPrice(symbol, price, ttlSeconds = CACHE_TTL.REDIS.PRICE) {
  const key = `renko:price:${symbol}`;
  return set(key, price, ttlSeconds);
}

// ── Convenience: Regime ──────────────────────────────────────────────────────

/**
 * Get the current regime label for a symbol from Redis.
 */
async function getRegime(symbol) {
  const key = `renko:regime:${symbol}`;
  return get(key);
}

/**
 * Save the current regime label for a symbol to Redis.
 * Default TTL: 5 minutes.
 */
async function setRegime(symbol, regime, ttlSeconds = CACHE_TTL.REDIS.REGIME) {
  const key = `renko:regime:${symbol}`;
  return set(key, regime, ttlSeconds);
}

// ── Convenience: Backtest results ──────────────────────────────────────────

/**
 * Build a deterministic cache key from a backtest config.
 * Uses a hash of the sorted config params to ensure identical configs
 * produce the same key regardless of key ordering.
 */
function backtestCacheKey(symbol, config) {
  // Sort keys for determinism
  const sorted = Object.keys(config)
    .sort()
    .map((k) => `${k}=${JSON.stringify(config[k])}`)
    .join("&");
  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash + sorted.charCodeAt(i)) & 0xffffffff;
  }
  return `renko:backtest:${symbol}:${hash.toString(36)}`;
}

/**
 * Get a cached backtest result from Redis.
 * Returns null on cache miss, error, or if Redis is unavailable.
 */
async function getBacktestCache(symbol, config) {
  const key = backtestCacheKey(symbol, config);
  return get(key);
}

/**
 * Save a backtest result to Redis with 1h TTL.
 * Returns false on error or if Redis is unavailable.
 */
async function setBacktestCache(symbol, config, data, ttlSeconds = CACHE_TTL.REDIS.BACKTEST) {
  const key = backtestCacheKey(symbol, config);
  return set(key, data, ttlSeconds);
}

// ── Availability check ───────────────────────────────────────────────────────

/**
 * Check if Redis is configured (env vars present).
 * Does NOT guarantee connectivity — just that configuration exists.
 */
function isAvailable() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url && token);
}

// ── Rate Limiting Primitives ────────────────────────────────────────────────

/**
 * Increment a counter in Redis (atomic INCR).
 * Returns the new value after increment.
 * Returns -1 on error or if Redis is unavailable.
 */
async function incr(key) {
  try {
    const client = getClient();
    if (!client) return -1;
    return await client.incr(key);
  } catch (err) {
    console.warn(`[redis] INCR ${key} failed:`, err.message);
    return -1;
  }
}

/**
 * Set expiry on a key (seconds).
 * Returns false on error or if Redis is unavailable.
 */
async function expire(key, seconds) {
  try {
    const client = getClient();
    if (!client) return false;
    return await client.expire(key, seconds);
  } catch (err) {
    console.warn(`[redis] EXPIRE ${key} failed:`, err.message);
    return false;
  }
}

/**
 * Get remaining TTL of a key (seconds).
 * Returns -2 if key doesn't exist, -1 if no expiry, -3 on error.
 */
async function ttl(key) {
  try {
    const client = getClient();
    if (!client) return -3;
    return await client.ttl(key);
  } catch (err) {
    console.warn(`[redis] TTL ${key} failed:`, err.message);
    return -3;
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const redis = {
  get,
  set,
  del,
  incr,
  expire,
  ttl,
  getSnapshot,
  setSnapshot,
  delSnapshot,
  getPrice,
  setPrice,
  getRegime,
  setRegime,
  getBacktestCache,
  setBacktestCache,
  isAvailable,
};
