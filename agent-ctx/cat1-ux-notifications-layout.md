# Category 1: UX, Notifications & Layout Optimizations

## Task Summary
Implemented all 11 sub-tasks for Category 1 UX optimizations across 9 files.

## Changes Made

### 1. Enhanced Notification System (`src/lib/notifications.js`)
- Increased `MAX_NOTIFICATIONS` from 5 to 8
- Added `options` parameter to `notify()` supporting `title`, `action` ({ label, onClick }), and `group` fields
- Added `notifyPersistent(type, message, options)` for notifications that don't auto-dismiss (duration=0)
- Added `dismissByGroup(group)` to dismiss all notifications in a group
- Updated convenience helpers (notifySuccess, notifyError, notifyWarning, notifyInfo) to accept `options` parameter
- Full backward compatibility maintained

### 2. Regime Change Toast Notifications (`src/hooks/useStreamPrice.js`)
- Imported `notifyWarning` and `notifyInfo` from notifications module
- Added `notifyWarning()` call on regime change (6s duration)
- Added `notifyInfo()` call when SSE falls back to polling (3s duration) in both error handler and catch block
- Added visibility-based polling pause: pauses polling when tab hidden, resumes when visible (if not in SSE mode)
- Added cleanup for visibilitychange listener

### 3. Fix Dashboard Refreshed Notification Spam (`src/components/dashboard/Dashboard.jsx`)
- Added `initialLoadDone` ref
- Changed notification effect to only fire on first successful load
- Changed message from "Dashboard refreshed" to "Dashboard loaded" with 3s duration

### 4. Add Error Notification to PortfolioPage (`src/components/portfolio/PortfolioPage.jsx`)
- Imported `notifyError` from notifications
- Added `notifyError('Failed to fetch positions')` in fetchPositions catch block
- Added `notifyError('Failed to fetch account data')` in fetchAccount catch block

### 5. Fix NotificationToast Position for Mobile (`src/components/shared/NotificationToast.jsx`)
- Changed container positioning from `bottom-4` to `bottom-20 sm:bottom-4` (above mobile nav)
- Added support for `title` field in toast rendering
- Added support for `action` field with clickable action button
- Title renders as bold text above message; message uses smaller text when title present

### 6. Fix SimulatePage Data Flash (`src/components/simulation/SimulatePage.jsx`)
- Removed `setPrices([])` and `setCurrentPrice(null)` from before the fetch in `fetchPrices`
- Data now only updates when new data arrives successfully, preventing flash of empty state

### 7. Fix PortfolioOverview Auto-Refresh (`src/components/portfolio/PortfolioOverview.jsx`)
- Removed `autoRefresh` state, `handleAutoRefresh` callback, and auto-refresh `useEffect`
- Removed auto-refresh toggle UI from header
- Changed component to accept `lastUpdated` as prop from parent
- Kept lastUpdated display in header when prop is provided

### 8. Add Global Error Banner to Dashboard (`src/components/dashboard/Dashboard.jsx`)
- Added alert-error banner that shows when ALL tickers fail to load
- Displays "Backend appears offline" message with description
- Includes "Retry All" button that triggers `fetchAllTickers`
- Placed after streaming control bar, before Controls Row

### 9. Centralize Version and Update Footer/Navbar
- **Footer.jsx**: Added `APP_VERSION = "v3.1"` constant, used in footer text
- **Navbar.jsx**: Added `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}` to mobile bottom nav container for safe-area support

### 10. Use LiveBadge Component in Dashboard (`src/components/dashboard/Dashboard.jsx`)
- Imported `LiveBadge` from `@/components/streaming/LiveBadge`
- Replaced inline live status indicator with `<LiveBadge connected={anyConnected} />`
- Kept OFFLINE indicator when not connected
- Kept stream count display

### 11. Remove Duplicate Streaming Controls from Dashboard (`src/components/dashboard/Dashboard.jsx`)
- Simplified streaming control bar: LiveBadge + stream count + Go Live button (when no subscriptions)
- Removed "Go Live All" / "Stop All" duplicate buttons (StreamStatusPanel handles these)
- Removed `unsubscribeAll` from useStream destructuring (unused after cleanup)
- Removed `allDefaultLive` computed variable (no longer needed)

## Files Modified
- `src/lib/notifications.js`
- `src/hooks/useStreamPrice.js`
- `src/components/dashboard/Dashboard.jsx`
- `src/components/portfolio/PortfolioPage.jsx`
- `src/components/shared/NotificationToast.jsx`
- `src/components/simulation/SimulatePage.jsx`
- `src/components/portfolio/PortfolioOverview.jsx`
- `src/components/Footer.jsx`
- `src/components/Navbar.jsx`
