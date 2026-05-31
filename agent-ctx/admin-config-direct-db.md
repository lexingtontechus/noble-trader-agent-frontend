# Admin Config Panel — Direct Supabase API + Enhanced UI

## Task Summary
Built a direct Supabase config API as the primary data path for the admin ConfigPanel, replacing the unreliable FastAPI proxy. Enhanced the ConfigPanel with multiple UX improvements.

## Files Created

### 1. `/src/lib/supabase/service-role.js`
- Singleton Supabase client using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Used by all admin config API routes for direct DB access

### 2. `/src/app/api/admin/config/route.js`
- **GET** → List all config entries grouped by category (viewer+)
  - Supports `?category=renko` filter
  - Returns `{ categories, total_entries, source: "direct_db" }`
- **PATCH** → Update a config value (admin+)
  - Body: `{key, value, reason}`
  - Validates type, range, and allowed_values
  - Writes to `system_config` + inserts audit row to `system_config_audit`
- **POST** → Reset to default or force reload (admin+)
  - `{action: "reset", key}` — resets value to default_value
  - `{action: "reload"}` — no-op for direct DB, returns count

### 3. `/src/app/api/admin/config/audit/route.js`
- **GET** → Fetches from `system_config_audit` ordered by `changed_at DESC` (admin+)
  - Supports `?limit=50` (max 200) and `?key=renko.brick_size` filter

### 4. `/src/app/api/admin/config/[...path]/route.js`
- **GET** `/reload` → Force reload (returns count)
- **GET** `/key/{key}` → Get single config entry
- **PATCH** `/key/{key}` → Update value (with validation + audit)
- **POST** `/key/{key}/reset` → Reset to default (with audit)

## Files Modified

### 5. `/src/components/admin/ConfigPanel.jsx`
Enhancements:
- **Primary API switched**: Uses `/api/admin/config` as primary, `/api/config/` (FastAPI) as fallback
- **Connection mode indicator**: Green "Direct DB" badge or yellow "FastAPI Proxy" badge
- **Summary stats bar**: Total keys, categories count, modified keys count, last updated timestamp
- **Expand All / Collapse All buttons**: In header bar
- **Reset All Modified button**: Resets all non-default values in one click
- **Category emojis**: 🧱 renko, 📐 sizing, 🛡️ risk, 🌊 regime, ⚡ execution, 📡 stream, 🔌 alpaca, 🔐 auth, ⚙️ general
- **Keyboard shortcut hint**: Prominent "Click any value to edit inline" below search bar
- **Dirty state indicator**: Red "unsaved" badge when editing, yellow highlight on row
- **Hover edit indicator**: Subtle Edit3 icon appears on hover over values
- **Per-category modified count**: Shows modified badge on category headers
- **Unsaved changes alert**: Warning bar when dirty edits exist

## Preserved
- Original `/api/config/[...path]/route.js` FastAPI proxy kept as fallback
- All existing ConfigPanel functionality: search, inline editing, reset, audit log, force reload

## Syntax Validation
- All JS files pass `node --check`
- Bracket balance verified: braces ✓, parens ✓, brackets ✓
