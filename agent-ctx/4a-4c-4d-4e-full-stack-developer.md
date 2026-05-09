# Task 4-a, 4-c, 4-d, 4-e — full-stack-developer

## Task: Optimize cache, dashboard, API client, and commentary route

### Files Modified

1. **src/lib/cache.js** — LRU cache upgrade
   - `CACHE_MAX_SIZE = 100` (exported constant, was 200)
   - `hits`/`misses` counters for diagnostics
   - `getCacheStats()` returns `{ size, hits, misses, hitRate }`
   - `invalidatePattern(pattern)` — alias for `clearCache(pattern)`
   - LRU promotion in `getCached()` — delete+re-insert moves key to end
   - Proper `while` loop eviction in `setCache()`
   - Backward compatible: existing `getCached`, `setCache`, `clearCache` all work

2. **src/components/dashboard/Dashboard.jsx** — Dashboard optimization
   - Auto-refresh changed from 2min → 5min (`AUTO_REFRESH_INTERVAL = 5 * 60 * 1000`)
   - Period change debounced with 300ms delay (`PERIOD_DEBOUNCE_MS = 300`)
   - Optimistic stale data: `handlePeriodChange` no longer clears `tickerData`
   - `notifySuccess('Dashboard refreshed')` after successful fetch
   - Badge text updated from "auto 2m" to "auto 5m"

3. **src/lib/fastapi-client.js** — API client optimization
   - Request deduplication via `pendingRequests` Map + `fetchWithDedup()` wrapper
   - Exponential backoff: `1000 * 2^i` (1s, 2s, 4s) — was linear
   - Default timeout: 30s (`DEFAULT_TIMEOUT`) — was 60s
   - Simulate timeout: 60s (`SIMULATE_TIMEOUT`)
   - All API functions use `fetchWithDedup` instead of `fetchWithRetry`

4. **src/app/api/commentary/route.js** — Commentary route with dual provider
   - Primary: z-ai-web-dev-sdk (`ZAI.create()` + `zai.chat.completions.create()`)
   - Fallback: Groq (OpenAI-compatible API with `llama-3.3-70b-versatile`)
   - 10-minute caching via `getCached`/`setCache`
   - Cache key: `commentary:${symbol}:${regimeLabel}`
   - Returns `provider` field in response for diagnostics
   - Robust error handling for both providers

### Verification
- All .js files pass `node --check` or acorn parse
- Dashboard.jsx uses valid JSX (Next.js compiler handles it)
- Backward compatibility maintained for all existing exports
