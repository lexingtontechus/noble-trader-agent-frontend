# Admin Configuration Panel — Architecture & Data Flow

**Version:** v7.0.0
**Last Updated:** 2026-05-24
**Status:** Implementation Ready

---

## Overview

The Admin Configuration Panel is a frontend UI that allows platform administrators to browse, edit, and manage all 148 runtime-configurable system parameters without redeploying the backend. Every change is persisted to Supabase, logged in an immutable audit trail, and automatically propagated to all backend services within 30 seconds via the TTL-based cache.

This document describes the architecture, data flow, and design decisions for the admin config panel. For the API reference, see `ADMIN_CONFIG_API.md` in the backend `docs/` directory. For the full list of config keys, see `ADMIN_CONFIG_KEY_CATALOG.md` in the backend `docs/` directory.

---

## Motivation

Previously, all system parameters (brick sizes, risk limits, ATR periods, etc.) were hardcoded in Python modules. Changing any value required:

1. Modifying the source code
2. Committing to Git
3. Waiting for Render to rebuild and redeploy (3-5 minutes)
4. Verifying the change took effect

This workflow is unacceptable for production trading where risk parameters need to be adjusted in real-time in response to market conditions. The runtime config system and admin panel eliminate this bottleneck entirely.

---

## Architecture

### System Context

```
┌───────────────────────────────────────────────────────────────────┐
│                        ADMIN BROWSER                             │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  /admin/config  (Next.js Page)                             │  │
│  │  ┌───────────┐ ┌──────────────┐ ┌────────────────────┐    │  │
│  │  │ Category  │ │ Config Editor│ │ Audit Log Panel    │    │  │
│  │  │ Sidebar   │ │ (type-aware) │ │ (last N changes)   │    │  │
│  │  └───────────┘ └──────────────┘ └────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│       │ GET/PATCH          │ Clerk JWT              │           │
│       ▼                    ▼                        │           │
│  ┌──────────────────────────────────────────────────┼────────┐  │
│  │  Next.js BFF (api/admin/config/*)               │        │  │
│  │  - Auth check (requireAdmin)                    │        │  │
│  │  - Clerk JWT injection                          │        │  │
│  │  - Proxy to FastAPI backend                     │        │  │
│  └──────────────────────────────────────────────────┼────────┘  │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND (Render)                      │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  /config/* (config_router)                                  │ │
│  │  - require_admin for all mutations                          │ │
│  │  - Validate type, range, allowed_values                    │ │
│  │  - Persist to Supabase + write audit log                    │ │
│  │  - Invalidate TTL cache immediately                         │ │
│  └───────────────┬──────────────────────────────────────────────┘ │
│                  │                                                │
│  ┌───────────────▼──────────────────────────────────────────────┐ │
│  │  RuntimeConfig (singleton)                                  │ │
│  │  - 30-second TTL in-memory cache                            │ │
│  │  - Resolution: DB → env var → hardcoded default             │ │
│  │  - All backend modules read config via runtime_config       │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                         │
│  ┌──────────────────────┐  ┌────────────────────────────────┐    │
│  │  system_config       │  │  system_config_audit           │    │
│  │  - 148 rows (keys)   │  │  - Immutable change log        │    │
│  │  - JSONB values      │  │  - old_value → new_value       │    │
│  │  - RLS: read=auth,   │  │  - changed_by, changed_at      │    │
│  │  - write=service_role│  │  - reason (optional)           │    │
│  └──────────────────────┘  └────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Location | Responsibility |
|-----------|----------|---------------|
| **AdminConfigPage** | `src/app/admin/config/page.jsx` | Page layout, category sidebar, editor panel, audit log |
| **ConfigCategoryNav** | `src/components/admin/ConfigCategoryNav.jsx` | Sidebar with 8 category tabs and key counts |
| **ConfigEditor** | `src/components/admin/ConfigEditor.jsx` | Per-key editable fields with type-aware inputs |
| **ConfigSearchBar** | `src/components/admin/ConfigSearchBar.jsx` | Search/filter across all 148 keys |
| **ConfigAuditLog** | `src/components/admin/ConfigAuditLog.jsx` | Scrollable audit log panel |
| **BFF Proxy** | `src/app/api/admin/config/[...path]/route.js` | Clerk JWT injection + proxy to FastAPI |
| **config_router** | Backend `routers/config.py` | 9 REST endpoints for config CRUD |
| **RuntimeConfig** | Backend `core/runtime_config.py` | Singleton cache engine with TTL |

---

## Data Flow

### Read Flow (Admin Opens the Panel)

```
1. Admin navigates to /admin/config
2. Frontend: useAuth() checks Clerk session → user.role
3. If role !== "admin" → redirect to / (403 forbidden)
4. Frontend: fetch("/api/admin/config/")
5. BFF: auth().getToken({ template: "fastapi" }) → Clerk JWT
6. BFF: proxy GET to FastAPI /config/ with Authorization header
7. FastAPI: get_authed_user() verifies JWT → require_admin
8. RuntimeConfig: _ensure_cache() checks TTL
   - Cache valid (<30s old) → return from memory
   - Cache expired → fetch all from Supabase → update cache → return
9. Response: { categories: {...}, total_entries: 148 }
10. Frontend: render category sidebar + config editor
```

### Write Flow (Admin Changes a Value)

```
1. Admin edits renko.brick_size from 0.50 to 0.75
2. Frontend validates: type=float, min=0.01, max=100.0 → PASS
3. Frontend: PATCH /api/admin/config/key/renko.brick_size
   Body: { "value": 0.75, "reason": "Testing wider bricks in high-vol regime" }
4. BFF: inject Clerk JWT, proxy PATCH to FastAPI
5. FastAPI: require_admin → verify JWT role
6. RuntimeConfig.set_value():
   a. Type coercion: 0.75 → float(0.75) ✓
   b. Range check: 0.01 ≤ 0.75 ≤ 100.0 ✓
   c. Allowed values check: null (any value in range) ✓
   d. Update in-memory cache immediately
   e. Upsert to Supabase system_config
   f. Insert audit row: { key, old_value: 0.50, new_value: 0.75, changed_by, reason }
   g. Fire on-change callbacks
7. Response: { key: "renko.brick_size", value: 0.75, ... }
8. Frontend: green toast "renko.brick_size updated to 0.75"
9. Within 30 seconds: all backend services calling runtime_config.get_float("renko.brick_size")
   receive the new value 0.75 when their TTL expires
```

### Reset Flow (Admin Reverts to Default)

```
1. Admin clicks "Reset to Default" on renko.brick_size
2. Frontend: POST /api/admin/config/key/renko.brick_size/reset
3. FastAPI: require_admin → RuntimeConfig.reset_value()
4. Reads default_value from the config entry (0.50)
5. Calls set_value(key=renko.brick_size, value=0.50, reason="Reset to default")
6. Same persist + audit flow as write
7. Frontend: toast "renko.brick_size reset to default (0.50)"
```

### Reload Flow (Admin Force-Refreshes Cache)

```
1. Admin clicks "Reload from Database" button
2. Frontend: GET /api/admin/config/reload
3. FastAPI: require_admin → RuntimeConfig.reload()
4. TTL set to 0 → full fetch from Supabase → rebuild cache
5. Response: { entries_loaded: 148, message: "Reloaded 148 config entries from database." }
6. All subsequent reads within this process get fresh values immediately
```

---

## Cache Architecture

The `RuntimeConfig` singleton uses a two-level caching strategy:

### Level 1: In-Memory TTL Cache (30 seconds)

- All config entries stored in a `Dict[str, ConfigEntry]`
- Timestamp tracked via `_cache_time`
- On any `get_*()` call, `_ensure_cache()` checks if `now - _cache_time > _ttl`
- If expired, a single `SELECT * FROM system_config` fetches all rows atomically
- Async-safe via `asyncio.Lock` with double-checked locking pattern
- TTL configurable via `RUNTIME_CONFIG_TTL` env var (default 30 seconds)

### Level 2: Supabase PostgreSQL

- `system_config` table with 148 seeded rows
- JSONB `value` column supports all types (float, int, bool, str, json)
- RLS policies: authenticated users can read, service_role can write
- Auto-updating `updated_at` trigger on every row change

### Cache Invalidation

| Event | Invalidation Method | Propagation |
|-------|-------------------|-------------|
| Admin PATCH /config/key/{key} | Immediate — cache entry updated in-place | Instant for current process |
| Admin POST /config/reload | Full cache flush + re-fetch | Instant for current process |
| TTL expiry (30s) | Automatic on next read | Up to 30s lag |
| Multiple Render instances | Each instance has its own cache | Up to 30s lag per instance |

### Why Not Real-Time Sync?

The 30-second TTL is a deliberate trade-off. Real-time sync (e.g., Supabase Realtime subscriptions or Redis pub/sub) would add complexity and a new failure mode. The TTL approach is:

- **Simple**: No additional infrastructure (no Redis, no WebSocket, no pub/sub)
- **Resilient**: If Supabase is temporarily unavailable, the cache serves stale values rather than crashing
- **Fast enough**: 30 seconds is well within acceptable latency for parameter changes — trading systems should not change risk parameters more frequently than this
- **Consistent**: All reads within a TTL window get the same value, avoiding split-brain scenarios

If sub-second propagation becomes necessary, the `register_on_change()` callback hook is already in place to support Redis pub/sub or Supabase Realtime integration.

---

## Resolution Order

When any backend module calls `runtime_config.get_float("renko.brick_size", 0.50)`, the value is resolved in this priority order:

```
1. DB Override (Supabase system_config)  ← highest priority
2. Environment Variable (RENKO_BRICK_SIZE)
3. Hardcoded Default (0.50)              ← lowest priority
```

This means:
- If an admin sets `renko.brick_size = 0.75` in the DB, that value wins over everything
- If no DB row exists or the DB is unreachable, the env var `RENKO_BRICK_SIZE` is checked
- If neither DB nor env var is set, the hardcoded default `0.50` from the calling module is used

The `sync_config` proxy (used in non-async contexts like dataclass defaults) skips the DB layer entirely and only checks env vars and hardcoded defaults.

---

## Category Organization

All 148 config keys are organized into 8 categories:

| Category | Key Prefix | Count | Description |
|----------|-----------|-------|-------------|
| **renko** | `renko.*` | 56 | Brick engine, swing classifier, pattern detector, signal filter, risk manager, sizing, costs, execution, pipeline, optimization, backend |
| **execution** | `exec.*` | 23 | Almgren-Chriss impact, fill probability, financing (borrow/margin/dividend), volume penalties |
| **alpaca** | `alpaca.*` | 17 | WebSocket reconnection, ping/timeout, snapshot frequency, bootstrap/position HTTP timeouts, throttling |
| **risk** | `risk.*` | 15 | Annualization, daily loss limit, CVaR multipliers, stress test scenarios (crash, flash, vol spike, rate shock, liquidity) |
| **sizing** | `sizing.*` | 13 | Masaniello base risk, risk bounds, probability/RR gates, drawdown limits, batch parameters, Monte Carlo |
| **stream** | `stream.*` | 11 | HMM fit requirements, price buffer, Kelly/vol/risk defaults, refit frequency, debounce, queue sizes |
| **auth** | `auth.*` | 6 | Clerk role/JWKS/enrich cache TTLs, circuit breaker thresholds, API key cache |
| **regime** | `regime.*` | 7 | Vol/trend feature windows, HMM seed/iterations, stability lookback |

---

## Type-Aware Input Rendering

The frontend editor renders different input controls based on `value_type`:

| `value_type` | Input Control | Validation |
|--------------|--------------|------------|
| `float` | Number input (step=0.01) | `min_value` / `max_value` bounds |
| `int` | Number input (step=1) | `min_value` / `max_value` bounds |
| `bool` | Toggle switch | No additional validation |
| `str` | Text input or dropdown | If `allowed_values` exists → `<select>` dropdown |
| `json` | Textarea with JSON validation | Must parse as valid JSON |

### Validation Pipeline

```
User types value
  → Frontend validates type (float/int/bool/str/json)
  → Frontend checks min/max range
  → Frontend checks allowed_values enum (if present)
  → PATCH request sent
  → Backend re-validates (type coercion + range + enum)
  → Backend persists + audits
  → Response: success or 422 with error detail
```

---

## UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Noble Trader — System Configuration                    [Admin Badge]│
├────────────┬─────────────────────────────────────────────────────────┤
│            │  🔍 Search all config keys...                          │
│ CATEGORIES ├─────────────────────────────────────────────────────────┤
│            │  Category: renko (56 keys)                             │
│ 🧱 Renko   │                                                         │
│   (56)     │  ┌─────────────────────────────────────────────────┐   │
│ ⚡ Exec    │  │ renko.brick_size                                 │   │
│   (23)     │  │ Fixed dollar brick size                         │   │
│ 📊 Alpaca  │  │ Type: float  │  Default: 0.50  │  Range: [0.01, │   │
│   (17)     │  │ 100.0]                                          │   │
│ 🛡 Risk    │  │ [  0.75  ]  ✏️  ↩ Reset                        │   │
│   (15)     │  ├─────────────────────────────────────────────────┤   │
│ 📐 Sizing  │  │ renko.brick_size_mode                            │   │
│   (13)     │  │ Brick sizing mode: fixed|atr|dynamic            │   │
│ 📡 Stream  │  │ Type: str  │  Default: "fixed"                  │   │
│   (11)     │  │ [fixed ▼]  ✏️  ↩ Reset                         │   │
│ 🔐 Auth    │  ├─────────────────────────────────────────────────┤   │
│   (6)      │  │ renko.atr_period                                 │   │
│ 🌊 Regime  │  │ ATR lookback period                             │   │
│   (7)      │  │ Type: int  │  Default: 14  │  Range: [2, 100]   │   │
│            │  │ [  14  ]  ✏️  ↩ Reset                           │   │
│            │  └─────────────────────────────────────────────────┘   │
│            │                                                         │
│            │  [💾 Save All Changes]  [🔄 Reload from DB]            │
│            ├─────────────────────────────────────────────────────────┤
│            │  📋 Audit Log (last 20 changes)                        │
│            │  ┌─────────────────────────────────────────────────┐   │
│            │  │ 2026-05-24 14:32  admin@0xdweb.com             │   │
│            │  │ renko.brick_size: 0.50 → 0.75                  │   │
│            │  │ Reason: Testing wider bricks in high-vol regime │   │
│            │  ├─────────────────────────────────────────────────┤   │
│            │  │ 2026-05-24 14:28  admin@0xdweb.com             │   │
│            │  │ risk.base_risk_limit: 0.02 → 0.03              │   │
│            │  │ Reason: Increased for earnings season           │   │
│            │  └─────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## Edge Cases & Error Handling

### Backend Unavailable

If the FastAPI backend is down when the admin tries to load the config panel:
- The BFF proxy returns a 502/504 error
- The frontend shows a "Backend Unavailable" banner with a retry button
- No stale data is shown — the panel is either fully loaded or shows an error state

### Validation Failure

If an admin enters a value outside the allowed range:
- Frontend shows a red border on the input field with the constraint message (e.g., "Must be between 0.01 and 100.0")
- The "Save" button is disabled until all values are valid
- If somehow an invalid value reaches the backend, it returns 422 with a descriptive error

### Concurrent Edits

If two admins edit the same key simultaneously:
- Last-write-wins — the second PATCH overwrites the first
- Both changes are recorded in the audit log with timestamps
- The admin panel does not implement optimistic locking (intentionally — config changes are infrequent and the audit log provides full traceability)

### Sensitive Values

Keys with `is_sensitive: true` have their values masked as `"********"` for non-admin users. Since the admin panel is already behind an admin-only route, admins always see the real values. This masking is a defense-in-depth measure for the API (e.g., if a non-admin calls `GET /config/` directly).

### Requires Restart

Some keys have `requires_restart: true`, meaning the change won't take full effect until the backend process restarts. The frontend will show a warning badge on these keys: "Requires restart to take effect." Currently no keys use this flag, but the schema supports it for future use.

---

## Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| Initial page load | ~500ms | One GET /config/ call returns all 148 entries |
| Category switch | 0ms | Client-side filter — no API call needed |
| Value edit + save | ~200ms | One PATCH call per changed key |
| Search/filter | 0ms | Client-side — all data loaded upfront |
| Audit log load | ~200ms | GET /config/audit?limit=20 |
| Cache propagation | ≤30s | TTL-based; instant after reload |

The panel loads all 148 config entries on initial page load and performs all category navigation, search, and filtering client-side. This avoids per-category API calls and makes the UI feel instant. The total payload is approximately 50-80 KB, which is well within acceptable limits.

---

## Future Enhancements

1. **Bulk Edit**: Select multiple keys and change them in a single batch request
2. **Config Diff**: Compare current values against a saved snapshot or another environment
3. **Environment Parity**: Show dev/staging/prod values side-by-side (requires multi-environment backend)
4. **Real-Time Push**: Supabase Realtime subscription for instant cross-instance propagation
5. **Config Versioning**: Tag and name config snapshots (e.g., "Earnings Season 2026-Q2")
6. **Approval Workflow**: Two-admin approval for high-impact changes (e.g., risk limits)
