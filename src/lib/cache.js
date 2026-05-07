const MAX_CACHE_SIZE = 200;

const cache = new Map();

// Periodically clean expired entries (every 2 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of cache) {
        if (now > entry.expiry) cache.delete(key);
      }
    },
    2 * 60 * 1000,
  );
}

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data, ttlMs = 5 * 60 * 1000) {
  // LRU eviction: if cache is full, delete the oldest entry
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

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
 * Get cache stats for diagnostics.
 */
export function getCacheStats() {
  let expired = 0;
  const now = Date.now();
  for (const entry of cache.values()) {
    if (now > entry.expiry) expired++;
  }
  return {
    size: cache.size,
    expired,
    maxSize: MAX_CACHE_SIZE,
  };
}
