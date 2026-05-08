export const CACHE_MAX_SIZE = 100;

const cache = new Map();

// ── LRU & Stats tracking ──────────────────────────────────────────────────
let hits = 0;
let misses = 0;

// Periodically clean expired entries (every 2 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiry) cache.delete(key);
    }
  }, 2 * 60 * 1000);
}

/**
 * Retrieve a cached value by key.
 * On hit: promotes the key (LRU freshness) and increments hit counter.
 * On miss or expiry: increments miss counter.
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) {
    misses++;
    return null;
  }
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    misses++;
    return null;
  }
  // Promote key for LRU — delete and re-insert so it moves to the end
  cache.delete(key);
  cache.set(key, entry);
  hits++;
  return entry.data;
}

/**
 * Store a value in cache with TTL.
 * Evicts least-recently-used entries when cache is full.
 */
export function setCache(key, data, ttlMs = 5 * 60 * 1000) {
  // If key already exists, delete first so re-insert puts it at the end (LRU fresh)
  if (cache.has(key)) {
    cache.delete(key);
  }

  // LRU eviction: evict oldest (first) entries when at capacity
  while (cache.size >= CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
    else break;
  }

  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Clear cache entries matching a pattern (substring match).
 * If no pattern is provided, clears the entire cache.
 */
export function clearCache(pattern) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

/**
 * Invalidate cache entries matching a pattern (substring match).
 * Alias for clearCache with a more descriptive name.
 * If no pattern is provided, clears the entire cache.
 */
export function invalidatePattern(pattern) {
  clearCache(pattern);
}

/**
 * Get cache stats for diagnostics.
 * Returns { size, hits, misses, hitRate }.
 */
export function getCacheStats() {
  const total = hits + misses;
  return {
    size: cache.size,
    hits,
    misses,
    hitRate: total > 0 ? hits / total : 0,
  };
}
