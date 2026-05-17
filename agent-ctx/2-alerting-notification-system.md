# Task 2: Alerting & Notification System

## Agent: alerting-notification-system

## Summary
Implemented a comprehensive alerting and notification system for the Noble Trader Agent, including server-side alerting service, BFF routes, in-app notification center UI, and wiring into existing Renko pipeline events.

## Files Created
1. `src/lib/alerting.js` — Server-side alerting service (Supabase persistence + Telegram push)
2. `src/app/api/alerts/route.js` — BFF route for GET/POST/DELETE alerts
3. `src/components/renko/NotificationCenter.jsx` — In-app notification center (bell icon, dropdown, auto-refresh)
4. `src/app/api/renko/signal-alert/route.js` — Signal/trade/risk alert BFF route

## Files Modified
5. `src/app/api/renko/warmup/route.js` — Added SYSTEM alert on warmup completion
6. `src/components/Navbar.jsx` — Integrated NotificationCenter (lazy-loaded)
7. `src/proxy.js` — Added /api/alerts(.*) and /api/renko/(.*) to public routes

## Key Design Decisions
- Reused `ta_telegram_notification` Supabase table as general notification store
- `messageType` column stores alert type (SIGNAL|TRADE|RISK|REGIME|SYSTEM)
- `chatId` column stores symbol (or "system" for system-wide alerts)
- `error` column stores JSON metadata `{ severity, data }` (creative reuse of nullable field)
- All Telegram operations wrapped in try/catch, never break core functionality
- NotificationCenter lazy-loaded via `next/dynamic` with `ssr: false`
- Auto-refresh every 30s with visibility-based pause/resume

## Environment Dependencies
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars for Telegram push (optional)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` for Supabase persistence
