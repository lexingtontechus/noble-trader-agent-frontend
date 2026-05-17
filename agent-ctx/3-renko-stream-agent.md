# Task 3: Real-time Renko WebSocket Stream

## Agent: renko-stream-agent

## Summary
Implemented real-time price streaming for the Renko HFT Pipeline, enabling live brick building during market hours.

## Files Created
1. **`/src/hooks/useRenkoStream.js`** (434 lines) — Custom React hook bridging live prices into the Renko pipeline
2. **`/src/app/api/renko/tick-stream/route.js`** (113 lines) — BFF batch tick streaming endpoint

## Files Modified
3. **`/src/components/renko/RenkoPage.jsx`** — Surgical edits to add streaming integration

## Implementation Details

### useRenkoStream.js Hook
- Finnhub WebSocket connection (`wss://ws.finnhub.io/websocket?token=${API_KEY}`)
- Subscribes with `{"type":"subscribe","symbol":"SPY"}` format
- Parses trade messages: `{"type":"trade","data":[{"p":price,"s":symbol,"t":timestamp,"v":volume}]}`
- Throttles to max 1 tick per second per symbol
- Feeds throttled ticks to `POST /api/renko/tick` with `{price, symbol}`
- Callbacks: `onBrick` (bricks_created), `onSignal` (signal detected), `onError`
- Auto-reconnect with exponential backoff (max 30s delay)
- Market hours check: Mon-Fri 9:30-16:00 ET — falls back to polling when closed
- Visibility API: pauses WebSocket when tab is hidden
- Graceful fallback to polling via `/api/stream/latest-price` if WebSocket fails or no API key
- Returns: `{ connected, lastPrice, lastTickTime, tickCount, brickCount, streaming, toggle, setStreaming }`

### tick-stream/route.js BFF Route
- POST endpoint accepts `{ symbol, ticks: [{ price, timestamp }, ...] }`
- Validates tick structure (price must be a number)
- Proxies to FastAPI `/renko/tick/batch` with auth headers
- Handles cold starts and backend errors
- Optionally updates price cache (fire-and-forget)
- Returns processed results including bricks_created, trades, and signal

### RenkoPage.jsx Modifications
- Added imports: `notifyWarning`, `useRenkoStream`
- Added `streaming` state: `const [streaming, setStreaming] = useState(false)`
- Added `useRenkoStream` hook with callbacks that trigger notifications and data refresh
- Added "🔴 Live"/"⚪ Stream" toggle button (btn-accent when active, btn-outline when idle)
- Added stream status indicator in pipeline state banner:
  - "LIVE" badge with ping animation when connected
  - "Connecting..." badge with spinner when connecting
  - "Idle" badge when not streaming
  - Last tick price and time when connected
  - Tick and brick counts during streaming

## Key Design Decisions
- Streaming is opt-in (toggle button) — no auto-start
- Market hours check prevents unnecessary WebSocket connections outside 9:30-16:00 ET
- Throttling (1 tick/sec) avoids overwhelming the backend
- Fallback to polling ensures streaming works even without Finnhub API key
- All existing functionality preserved — surgical edits only
