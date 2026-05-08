# Task 4-b: Optimize useStreamPrice hook

## Agent: full-stack-developer

## Summary of Changes

Rewrote `src/hooks/useStreamPrice.js` with all 5 requested optimizations:

1. **Removed direct SSE to FastAPI** — defaults to polling mode; SSE code uses BFF proxy `/api/stream/sse?symbol=`
2. **Simplified pushTick()** — single API call to `/api/stream/latest-price` instead of two calls
3. **Adaptive polling interval** — 15s on failure, 30s default, 60s after 3 consecutive successes
4. **Periodic SSE reconnect** — every 5 minutes, tries SSE via BFF proxy; switches back if successful
5. **Clean unmount** — all timers and refs properly cleaned

## Key Technical Decisions

- Used `setTimeout` recursively instead of `setInterval` to allow per-tick interval adjustment
- Added `sseModeRef` as a ref mirror of `sseMode` state to avoid stale closures in async callbacks
- Preserved hook interface: `useStreamPrice(symbol, updateStreamState, addAlert)` — no breaking changes
- SSE code structure preserved for future activation when BFF SSE proxy is confirmed working

## Files Modified

- `src/hooks/useStreamPrice.js` — full rewrite
- `worklog.md` — appended task log
