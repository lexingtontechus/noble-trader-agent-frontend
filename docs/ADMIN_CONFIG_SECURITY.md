# Admin Configuration Panel — Security & Access Control

**Version:** v7.0.0
**Last Updated:** 2026-05-24
**Status:** Implementation Ready

---

## Overview

The Admin Configuration Panel provides direct control over runtime system behavior, including risk limits, position sizing parameters, and authentication settings. This document details the multi-layered security model that protects these controls from unauthorized access and misuse.

---

## Threat Model

| Threat | Risk Level | Mitigation |
|--------|-----------|------------|
| Non-admin reads sensitive config | Medium | Value masking for non-admin API users |
| Non-admin modifies config | Critical | Multi-layer auth: frontend route guard + BFF check + backend require_admin |
| Privilege escalation (trader → admin) | Critical | Clerk privateMetadata.role is server-side only; not client-settable |
| CSRF (cross-site config change) | Medium | Clerk JWT is HttpOnly cookie + BFF proxy validates session |
| Brute-force config changes | Low | Rate limiting on all API routes |
| Audit log tampering | Medium | RLS policies + append-only design + no DELETE endpoint |
| Stale cache serving wrong values | Low | TTL expiry + manual reload + immediate cache update on write |

---

## Authentication Layers

The admin config panel is protected by four independent authentication layers. If any single layer fails, the others still prevent unauthorized access.

### Layer 1: Frontend Route Guard (Client-Side)

**Implementation:** `AdminGuard` component + server-side `page.jsx` redirect

**How it works:**
1. The page component calls `auth()` and `currentUser()` on the server side
2. If `user.privateMetadata.role !== "admin"`, the server redirects to `/`
3. On the client side, `AdminGuard` double-checks `useAuth()` and `useUser()`
4. If the role check fails on the client, the user sees nothing (blank page, then redirect)

**Bypass resistance:** A user could modify client-side JavaScript to skip the redirect. This is why Layers 2-4 exist.

**Purpose:** UX optimization — prevents non-admins from ever seeing the config panel. Not a security boundary by itself.

### Layer 2: BFF Proxy (Server-Side)

**Implementation:** `src/app/api/admin/config/[...path]/route.js`

**How it works:**
1. The BFF route handler calls `auth()` to verify the user has an active Clerk session
2. It obtains a Clerk JWT via `getToken({ template: "fastapi" })`
3. The JWT is injected into the `Authorization: Bearer` header
4. The request is forwarded to the FastAPI backend

**Bypass resistance:** The BFF runs on the Next.js server — users cannot modify its behavior. Even if they call the BFF endpoint directly (e.g., `curl /api/admin/config/`), they need a valid Clerk session cookie to pass `auth()`.

**Purpose:** Ensures all backend calls go through the authenticated BFF with a valid JWT. Eliminates direct browser-to-FastAPI calls.

### Layer 3: FastAPI Auth Dependency (Backend)

**Implementation:** `require_admin` dependency in `routers/config.py`

**How it works:**
1. Every mutation endpoint uses `user: TokenData = Depends(require_admin)`
2. `require_admin` calls `get_authed_user()` which verifies the JWT:
   - Clerk JWT: verified via JWKS endpoint, role extracted from claims
   - Local JWT: verified via `JWT_SECRET_KEY`, role from token claims
   - API Key: hashed and looked up in Supabase, role from key owner
3. If `user.role !== "admin"`, the dependency raises `HTTPException(403)`
4. Read endpoints use `get_authed_user` (any role) but mask sensitive values for non-admins

**Bypass resistance:** This is the authoritative security boundary. Even if Layers 1-2 are bypassed, the backend will not execute admin operations without a valid admin JWT or API key.

**Purpose:** The definitive access control point. All security decisions are made here.

### Layer 4: Supabase RLS (Database)

**Implementation:** Row-Level Security policies on `system_config` and `system_config_audit`

**How it works:**
1. `system_config`: authenticated users can SELECT, service_role can do ALL
2. `system_config_audit`: authenticated users can SELECT, service_role can do ALL
3. The FastAPI backend uses the service_role key for DB operations
4. Direct Supabase access from the frontend uses the anon key (read-only)

**Bypass resistance:** Even if someone obtains the anon key and calls Supabase directly, they can only read config (not write), and sensitive values are masked at the API level. The service_role key is only available in backend code.

**Purpose:** Defense-in-depth at the database level. Prevents direct DB writes even if the API is compromised.

---

## Role Assignment

Admin role is determined by Clerk `privateMetadata.role`:

```javascript
// How admin role is set (via Clerk Backend API):
await clerkClient.users.updateUserMetadata(userId, {
  privateMetadata: { role: "admin" }
});
```

Key properties:
- **`privateMetadata`** is server-side only — it cannot be read or modified by the client SDK
- Only the Clerk Backend API (using `CLERK_SECRET_KEY`) can set it
- The role flows through the JWT via the "fastapi" template, which injects it as a claim
- If the template is not configured, the backend enriches the JWT by calling `GET /v1/users/{sub}` (cached 5 min)

### Role Hierarchy

| Role | Config Read | Config Write | Audit Read | Admin Panel Access |
|------|------------|-------------|-----------|-------------------|
| `admin` | Full (unmasked) | All keys | Full | Yes |
| `trader` | Partial (masked) | None | None | No |
| `viewer` | Partial (masked) | None | None | No |

---

## Sensitive Value Masking

Config entries with `is_sensitive = true` have their values masked in API responses for non-admin users:

```json
// Admin response:
{ "key": "auth.api_key_cache_ttl", "value": 60 }

// Non-admin response:
{ "key": "auth.api_key_cache_ttl", "value": "********" }
```

Currently, no config keys have `is_sensitive = true` (all keys are operational parameters, not secrets). However, the schema and API support this flag for future keys that might store API tokens, webhook URLs, or other sensitive configuration.

---

## Audit Trail

Every config mutation is recorded in the `system_config_audit` table:

| Field | Purpose | Example |
|-------|---------|---------|
| `key` | Which config was changed | `renko.brick_size` |
| `old_value` | Previous value | `0.50` |
| `new_value` | New value | `0.75` |
| `changed_by` | Clerk user sub of the admin | `user_2xyz...` |
| `changed_at` | Timestamp of the change | `2026-05-24T14:32:00Z` |
| `reason` | Optional human-readable reason | `Testing wider bricks in high-vol regime` |

### Audit Properties

- **Immutable**: There is no UPDATE or DELETE endpoint for audit entries. The RLS policy only allows SELECT for authenticated users and INSERT for service_role.
- **Append-only**: New entries are added via INSERT only. No row is ever modified.
- **Complete**: Every mutation (PATCH, POST /reset) creates an audit entry. Cache-only changes (TTL expiry) do not create audit entries since no value actually changed.
- **Queryable**: The audit endpoint supports filtering by key and limiting results.

### Audit Retention

Audit entries are retained indefinitely. The retention system (`/api/retention`) does not apply to the `system_config_audit` table — this is intentional, as config change history is critical for compliance and incident investigation.

---

## API Key Access

SaaS API keys (`nt_live_...`) inherit the creator's role. An API key created by an admin can be used to call config endpoints:

```bash
# Read all config (admin API key)
curl -H "X-API-Key: nt_live_..." https://backend.onrender.com/config/

# Update a config value (admin API key)
curl -X PATCH -H "X-API-Key: nt_live_..." \
  -d '{"value": 0.75, "reason": "Automated adjustment"}' \
  https://backend.onrender.com/config/key/renko.brick_size
```

This enables programmatic config management (e.g., automated risk parameter adjustment based on market conditions).

### API Key Security Considerations

- API keys are SHA-256 + pepper hashed — the plaintext is never stored
- Key creation is rate-limited
- Keys can be revoked via DELETE `/api/api-keys`
- Keys auto-expire if an expiry date is set (daily cron at 3 AM UTC)
- Key limits per plan: Free=2, Premium=5, Institutional=unlimited

---

## Rate Limiting

All config endpoints are rate-limited under the default tier:

| Endpoint | Method | Rate Limit |
|----------|--------|-----------|
| `/config/` | GET | Default |
| `/config/categories` | GET | Default |
| `/config/{category}` | GET | Default |
| `/config/key/{key}` | GET | Default |
| `/config/key/{key}` | PATCH | Default |
| `/config/key/{key}/reset` | POST | Default |
| `/config/reload` | POST | Default |
| `/config/schema` | GET | Default |
| `/config/audit` | GET | Default |

In practice, config changes are infrequent (a few per day at most), so rate limiting is not a bottleneck. The limits exist to prevent abuse if credentials are compromised.

---

## Incident Response

If an unauthorized config change is detected:

1. **Immediate**: Check the audit log — `GET /config/audit?limit=100`
2. **Revert**: Reset the changed key — `POST /config/key/{key}/reset`
3. **Investigate**: Identify the `changed_by` user sub and check access
4. **Contain**: If the admin account is compromised, revoke their Clerk session and change their role
5. **Verify**: Reload config — `POST /config/reload` — to ensure all instances are consistent

---

## Security Checklist

- [x] Frontend route guard blocks non-admins from seeing the panel
- [x] Server-side auth check redirects non-admins before rendering
- [x] BFF proxy requires active Clerk session + injects JWT
- [x] FastAPI `require_admin` dependency enforces admin role on all mutations
- [x] Supabase RLS prevents direct DB writes from anon key
- [x] Sensitive values masked for non-admin API users
- [x] All mutations recorded in immutable audit trail
- [x] Audit entries cannot be modified or deleted
- [x] API key access inherits admin role (with full audit trail)
- [x] Rate limiting on all endpoints
- [x] No config values logged in plaintext (only in audit DB)
