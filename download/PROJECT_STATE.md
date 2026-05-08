# Noble Trader — Project State Snapshot
**Saved:** 2025-05-07 08:53 UTC

## Architecture
- **Frontend:** Next.js 16 (App Router) + DaisyUI v5 + Clerk Auth
- **Backend:** FastAPI on Render (`https://noble-trader-fastapi-backend.onrender.com/`)
- **Broker API:** Alpaca (paper trading)
- **Auth:** Clerk JWT → BFF proxy → FastAPI JWKS verification

## Deployed FastAPI Endpoints (Working ✅)
| Endpoint | Method | Auth | Status |
|---|---|---|---|
| `/health` | GET | None | ✅ |
| `/analyse/full` | POST | Clerk JWT | ✅ |
| `/regime/detect` | POST | Clerk JWT | ✅ |
| `/size/kelly` | POST | Clerk JWT | ✅ |
| `/risk/analyse` | POST | Clerk JWT | ✅ |
| `/auth/clerk/me` | GET | Clerk JWT | ✅ |
| `/auth/clerk/verify` | POST | Clerk JWT | ✅ |
| `/portfolio` | GET | Clerk JWT | ✅ |
| `/simulate/{symbol}` | POST | Clerk JWT | ✅ |

## NOT Deployed (404) — Shows "Coming Soon" UI ❌
| Endpoint | Method | Status |
|---|---|---|
| `/correlation/detect` | POST | ❌ Not deployed |
| `/optimise/full` | POST | ❌ Not deployed |
| `/stream/sessions` | GET | ❌ Not deployed |

## Key Features
1. **Dashboard** — Ticker cards with analysis, regime detection, live price streaming
2. **Portfolio Overview** — Summary metrics, Correlation Detection (Coming Soon), Portfolio Optimizer (Coming Soon)
3. **Orders** — Alpaca key setup, open positions, order creation, order history, portfolio analysis
4. **Search** — Symbol search with Yahoo Finance data, full analysis with charts

## Auth Flow
1. Clerk signs in user → JWT token extracted via `auth().getToken({ template: 'server' })`
2. BFF API routes forward `Authorization: Bearer <token>` to FastAPI
3. FastAPI validates via Clerk JWKS (`get_authed_user()`)
4. Fallback to python-jose JWT only if JWT_SECRET_KEY is configured

## Recent Fixes (This Session)
- **Correlation/Optimizer UX:** Replaced red "Not Found" errors with friendly "Coming Soon" cards
- **Auto-retry prevention:** Once ENDPOINT_NOT_DEPLOYED detected, stops auto-calling
- **Auth headers:** Added `getFastAPIAuthHeaders()` + `fetchWithAuth()` to fastapi-client.js
- **Error handling:** API routes now detect 401/403 auth errors with clear messages

## Environment Variables Required
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_FASTAPI_BASE_URL=https://noble-trader-fastapi-backend.onrender.com
```

## Test Credentials
- Email: `zai@0xdweb.com`
- Password: `zai0xdweb`
