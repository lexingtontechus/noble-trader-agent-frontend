# Renko HFT Trading Tab — Work Record

## Task: Build Renko HFT Trading Tab for Noble Trader Agent Frontend

### Files Created

1. **`src/lib/renko-client.js`** — API client library following fastapi-client.js patterns
   - `renkoFetch()` with retry + exponential backoff for Render cold starts
   - All 14 endpoint functions: getRenkoState, getRenkoStats, getRenkoBricks, getRenkoClassified, getRenkoSignals, getRenkoTrades, getRenkoSwingPoints, getRenkoBacktestStats, processRenkoTick, processRenkoBatch, updateRenkoRegime, updateRenkoEquity, updateRenkoConfig, resetRenkoPipeline
   - Uses `getFastAPIAuthHeaders()` from fastapi-auth.js

2. **`src/app/api/renko/[action]/route.js`** — BFF proxy route
   - Maps action names to backend paths (e.g., "tick" → "/tick", "backtest-stats" → "/backtest/stats")
   - Handles GET/POST method routing
   - Auth headers via `getFastAPIAuthHeaders()`
   - 3-retry logic with exponential backoff for cold starts
   - Graceful HTML response handling (Render spin-up)

3. **`src/components/renko/BrickChart.jsx`** — Custom Renko brick chart
   - Pure CSS/HTML rendering (no canvas)
   - Green/red bricks for UP/DOWN
   - Swing labels (HH/HL/LH/LL) as DaisyUI badges
   - Horizontal scroll container for last 50 bricks
   - Velocity indicator (bricks per minute)
   - Legend with color coding
   - Responsive design with `overflow-x-auto`

4. **`src/components/renko/SignalsPanel.jsx`** — Signals & patterns tab
   - Active position card with P&L, SL/TP
   - Recent signals table with direction, pattern, price, confidence, velocity
   - Signal filter status cards (session window, regime gate, cooldown, daily loss, max consecutive losses, max trades)
   - Kelly fraction estimate with progress bar
   - Session trades and P&L metrics

5. **`src/components/renko/TradesPanel.jsx`** — Trades & journal tab
   - Trade history table: symbol, direction, entry/exit price, P&L bricks/dollars, status, close reason
   - Session stats: trades taken, win rate, daily P&L, max drawdown
   - Cumulative stats: total trades, total P&L ($), total P&L (bricks), avg P&L per trade
   - Equity curve: SVG line chart for cumulative P&L in bricks
   - Green/red coloring for wins/losses

6. **`src/components/renko/ConfigPanel.jsx`** — Configuration tab
   - Organized into 4 sections: Brick Engine, Pattern Detection, Risk Management, Signal Filter
   - All pipeline parameters with labels, descriptions, proper input types
   - Save config button (calls /renko/config)
   - Reset pipeline button with confirmation dialog
   - Warning about config changes resetting the pipeline
   - Unsaved changes detection

7. **`src/components/renko/RenkoPage.jsx`** — Main page component
   - Header with title, pipeline status badge, symbol selector, auto-refresh toggle, process tick button, refresh button
   - Pipeline State Banner: 6 MetricCards (bricks, direction, swing, position, P&L, trades) + bull/bear run counts
   - 4 DaisyUI sub-tabs: Brick Chart, Signals, Trades, Config
   - Auto-refresh polling every 5s with `AbortController` cleanup
   - Visibility change handler (pause/resume polling)
   - Error boundary component
   - BFF fetch helper using `/api/renko/[action]` pattern
   - Handles backend unavailability gracefully (Render cold starts)
   - Dynamic imports for heavy sub-components (SSR: false)

### Files Modified

1. **`src/components/Navbar.jsx`** — Added Renko nav item
   - `{ key: "renko", label: "Renko", icon: "🧱", shortLabel: "Renko" }` inserted after "Trade"
   - Visible in both desktop tabs and mobile bottom navigation

2. **`src/app/page.js`** — Integrated RenkoPage
   - Import: `import RenkoPage from "@/components/renko/RenkoPage"`
   - Keyboard shortcut: Ctrl+7 → "renko", Ctrl+8 → "admin" (renumbered)
   - Conditional render: `{activeView === "renko" && <RenkoPage />}`

### Design Decisions

- Used BFF pattern (`/api/renko/[action]`) instead of direct client-side calls to FastAPI — avoids CORS issues and centralizes auth
- All data fetching uses `Promise.allSettled` so partial data still renders when some endpoints fail
- Polling interval: 5 seconds for auto-refresh
- Mobile-responsive: horizontal scroll for brick chart, grid layout adapts with `grid-cols-2 lg:grid-cols-4`
- Font: `font-mono` for all numeric values per spec
- Colors: UP = `bg-success`/`text-success`, DOWN = `bg-error`/`text-error` per spec
- DaisyUI components used throughout: `card`, `btn`, `badge`, `tabs-boxed`, `table`, `alert`, `progress`, `toggle`, `select`, `stat`

### Verification

- Dev server starts successfully (HTTP 200)
- All files exist with correct paths
- Navbar shows Renko tab
- Keyboard shortcuts updated
