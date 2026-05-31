# API Keys — SaaS API Key Management

> **Version**: 1.0.0 | **Last Updated**: 2026-05-22 | **Feature**: P5 — API Key System

## Overview

Noble Trader supports SaaS API keys for programmatic access to the platform via the `X-API-Key` header. API keys are the recommended authentication method for:

- **MCP Server** — Model Context Protocol integrations
- **Programmatic trading** — Automated strategy execution
- **Data pipelines** — Portfolio/P&L data retrieval
- **CI/CD workflows** — Smoke tests and health checks

API keys use the same RBAC, plan enforcement, and rate limiting as browser sessions — no special-casing downstream.

---

## Plan Entitlements

| Plan | Keys | Expiry | Rate Multiplier | Rotation | MCP Access |
|------|------|--------|-----------------|----------|------------|
| **Free** | 1 | 30 days from creation | 1x (10 req/min) | No (revoke & recreate) | Read-only |
| **Premium** | 1 | Permanent | 3x (60 req/min) | Yes (24hr grace) | Read + Write |
| **Institutional** | 5 | Permanent | 10x (300 req/min) | Yes (24hr grace) | Full access |

**Key design decisions:**
- Keys are created lazily (on first request), not at signup
- Free users get 1 key to drive upgrade conversion — the 30-day wall creates urgency
- Key rotation preserves the old key for 24 hours (grace period)
- Institutional users can have multiple concurrent keys for different services

---

## Authentication Flow

### With API Key

```
Client → X-API-Key header → Next.js proxy.js
  → withAuth() detects nt_live_ prefix
  → SHA-256 hash lookup in api_keys table
  → Loads user context (role, plan, expiry)
  → Same RBAC + rate limiting as Clerk JWT
  → Handler receives authContext with isApiKey: true
```

### Priority Order in withAuth()

1. **CRON bypass** — `CRON_SECRET` header (background jobs)
2. **API Key** — `X-API-Key: nt_live_...` header (SaaS keys)
3. **Clerk JWT** — `Authorization: Bearer ...` (browser sessions)
4. All subsequent checks (role, plan, org, rate limit) are identical

### Security Properties

- **SHA-256 + pepper** hashing — Full key never stored, only its hash
- **Key prefix** stored for UI display (`nt_live_a3f2`)
- **Auto-expiry** — Expired keys are deactivated on first use
- **Plan downgrade** — Keys get 30-day expiry when subscription expires
- **Org isolation** — API keys are user-scoped, not org-scoped (use Clerk JWT for org context)

---

## API Endpoints

### List API Keys

```http
GET /api/api-keys
Authorization: Bearer <clerk_jwt>
```

Response:
```json
{
  "keys": [
    {
      "id": "uuid",
      "prefix": "nt_live_a3f2",
      "name": "Production Key",
      "plan": "premium",
      "role": "trader",
      "expiresAt": null,
      "lastUsedAt": "2026-05-21T10:00:00Z",
      "isActive": true,
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ],
  "meta": {
    "activeCount": 1,
    "maxKeys": 1,
    "canCreate": false,
    "plan": "premium",
    "expiryInfo": "Keys are permanent"
  }
}
```

### Create API Key

```http
POST /api/api-keys
Authorization: Bearer <clerk_jwt>
Content-Type: application/json

{
  "action": "create",
  "name": "Production Key"
}
```

Response (key shown **only at creation time**):
```json
{
  "success": true,
  "action": "create",
  "key": "nt_live_a3f2e1d8c4b6...64hex",
  "prefix": "nt_live_a3f2",
  "id": "uuid",
  "expiresAt": null,
  "warning": "Save this key now. It will not be shown again."
}
```

### Rotate API Key (Premium+)

```http
POST /api/api-keys
Authorization: Bearer <clerk_jwt>
Content-Type: application/json

{
  "action": "rotate",
  "keyId": "uuid-of-key-to-rotate",
  "name": "Rotated Key"
}
```

Response includes both the new key and the old key's grace period:
```json
{
  "success": true,
  "action": "rotate",
  "key": "nt_live_b7d9f2e1a5c3...64hex",
  "prefix": "nt_live_b7d9",
  "id": "new-uuid",
  "expiresAt": null,
  "oldKeyGraceUntil": "2026-05-23T10:00:00Z",
  "warning": "Save this key now. It will not be shown again."
}
```

### Revoke API Key

```http
DELETE /api/api-keys?id=uuid
Authorization: Bearer <clerk_jwt>
```

Response:
```json
{
  "success": true,
  "action": "revoke",
  "message": "API key revoked. Any services using this key will lose access immediately."
}
```

---

## Using API Keys

### cURL Example

```bash
curl -H "X-API-Key: nt_live_your_key_here" \
  https://your-domain.com/api/portfolio
```

### Python Example

```python
import requests

API_KEY = "nt_live_your_key_here"
BASE_URL = "https://your-domain.com"

# Get portfolio data
response = requests.get(
    f"{BASE_URL}/api/portfolio",
    headers={"X-API-Key": API_KEY}
)
print(response.json())
```

### Node.js Example

```javascript
const API_KEY = "nt_live_your_key_here";
const BASE_URL = "https://your-domain.com";

const response = await fetch(`${BASE_URL}/api/portfolio`, {
  headers: { "X-API-Key": API_KEY },
});
const data = await response.json();
```

---

## Subscription Lifecycle

API keys automatically adjust when a user's subscription changes via Helio webhooks:

| Webhook Event | API Key Effect |
|---------------|----------------|
| `subscription.active` | Remove expiry, update `plan_at_creation` to premium/institutional |
| `subscription.expired` | Set 30-day expiry, revoke excess keys beyond free limit |
| `subscription.cancelled` | No immediate change (active until period end) |
| `payment.failed` | No key change (plan marked `past_due`, not downgraded yet) |

---

## Database Schema

### `api_keys` Table (Migration 027)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `clerk_user_id` | TEXT | Clerk user ID (owner) |
| `key_hash` | TEXT | SHA-256 hash of full key (unique) |
| `key_prefix` | TEXT | Display prefix (e.g., `nt_live_a3f2`) |
| `name` | TEXT | User-friendly label |
| `plan_at_creation` | TEXT | Plan when key was created |
| `role_at_creation` | TEXT | Role when key was created |
| `scopes` | JSONB | Future: granular scopes (null = role-based) |
| `expires_at` | TIMESTAMPTZ | Expiry time (null = permanent) |
| `last_used_at` | TIMESTAMPTZ | Last authenticated request |
| `last_used_ip` | TEXT | Hashed IP of last request |
| `rotated_from` | UUID | Previous key in rotation chain |
| `rotation_grace_until` | TIMESTAMPTZ | Old key stays valid until this time |
| `is_active` | BOOLEAN | Active flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `revoked_at` | TIMESTAMPTZ | Revocation timestamp |

### Helper Functions

- `count_active_api_keys(user_id)` — Count active keys for a user
- `expire_stale_api_keys()` — Revoke all expired keys (for pg_cron)

---

## Rate Limiting

API key requests use the **same rate limit tiers and plan multipliers** as Clerk JWT requests:

| Tier | Base Limit | Route Examples |
|------|-----------|----------------|
| trade | 10/min | `/api/trading/execute` |
| order | 15/min | `/api/broker/`, `/api/alpaca/orders` |
| data | 60/min | `/api/portfolio`, `/api/pnl/`, `/api/prices` |
| ai | 10/min | `/api/commentary`, `/api/analyse` |
| default | 30/min | Everything else |

Effective limit = `min(tier.max × plan_multiplier, plan.apiCallsPerMinute)`

Rate limit violations from API keys are logged to `rate_limit_violations` with `identifier_type: "api_key"`.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTH FLOW COMPARISON                        │
│                                                                 │
│  BROWSER SESSION:                                               │
│  Browser → Clerk JWT → proxy.js → withAuth() → Handler         │
│                                                                 │
│  API KEY (NEW):                                                 │
│  External Client → X-API-Key → proxy.js → withAuth() → Handler │
│       │                               │                         │
│       │                    ┌──────────┴──────────┐              │
│       │                    │ SHA-256 hash lookup  │              │
│       │                    │ api_keys table       │              │
│       │                    │ Check expiry         │              │
│       │                    │ Load role + plan     │              │
│       │                    │ Apply rate limits    │              │
│       │                    └─────────────────────┘              │
│       │                                                         │
│  MCP SERVER (FUTURE):                                           │
│  MCP Client → MCP Server → X-API-Key → Same validation         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/00000000000027_api_keys.sql` | New table + RLS + indexes |
| `src/lib/api-keys.js` | New: key generation, hashing, CRUD |
| `src/lib/withAuth.js` | Extended: API key auth branch |
| `src/lib/rate-limiter.js` | Added: `/api/api-keys` tier mapping |
| `src/lib/plans.js` | Updated: `apiAccess` on all plans, key limits |
| `src/app/api/api-keys/route.js` | New: BFF CRUD routes |
| `src/app/api/subscription/webhook/route.js` | Updated: key lifecycle hooks |
| `src/components/settings/ApiKeyManager.jsx` | New: Settings UI component |
| `src/components/settings/SettingsPage.jsx` | Updated: Added API Keys tab |
| `backend/regime_platform/auth/jwt_auth.py` | Updated: DB-backed SaaS API key lookup |
| `docs/api-keys.md` | This document |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_ENCRYPTION_KEY` | Yes | Pepper for API key hashing |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for DB access |
| `HELIO_WEBHOOK_SECRET` | Yes | Helio webhook signature verification |
| `DATABASE_URL` | Backend | PostgreSQL connection for API key lookups |

---

## Future Enhancements

- **Scopes** — The `scopes` JSONB column is ready for granular permissions (e.g., `read:portfolio`, `write:trades`)
- **pg_cron job** — `expire_stale_api_keys()` can be scheduled for automatic cleanup
- **API key analytics** — Track usage patterns, detect anomalies
- **Webhook for key events** — Notify external services on key creation/revocation
- **MCP server** — First-class MCP integration using the same `api_keys` table
