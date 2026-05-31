# Admin Configuration Panel — Frontend Implementation Guide

**Version:** v7.0.0
**Last Updated:** 2026-05-24
**Status:** Implementation Ready

---

## Overview

This document provides the implementation blueprint for the Admin Configuration Panel on the frontend. It covers file structure, component hierarchy, BFF proxy routes, Clerk auth integration, and specific implementation patterns. For architecture and data flow, see `ADMIN_CONFIG_PANEL.md`. For the backend API, see `ADMIN_CONFIG_API.md` in the backend `docs/` directory.

---

## File Structure

All new files are within the existing Next.js App Router structure:

```
src/
├── app/
│   ├── admin/
│   │   └── config/
│   │       └── page.jsx                  # Main admin config page
│   └── api/
│       └── admin/
│           └── config/
│               └── [...path]/
│                   └── route.js           # BFF proxy to FastAPI /config/*
│
├── components/
│   └── admin/
│       ├── ConfigCategoryNav.jsx          # Category sidebar
│       ├── ConfigEditor.jsx              # Per-key editable fields
│       ├── ConfigSearchBar.jsx           # Search/filter bar
│       ├── ConfigAuditLog.jsx            # Audit log panel
│       ├── ConfigValueInput.jsx          # Type-aware input (float/int/bool/str/json)
│       └── AdminGuard.jsx               # Route protection component
│
└── lib/
    └── admin-config.js                   # API client for admin config endpoints
```

---

## Route Protection

### AdminGuard Component

The admin config page must only be accessible to users with the `admin` role. Use Clerk's `auth()` and `currentUser()` on the server side, and the `useAuth()` hook on the client side.

```jsx
// src/components/admin/AdminGuard.jsx
"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminGuard({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && (!isSignedIn || user?.privateMetadata?.role !== "admin")) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, user, router]);

  if (!isLoaded) return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg" /></div>;
  if (!isSignedIn || user?.privateMetadata?.role !== "admin") return null;

  return children;
}
```

### Server-Side Guard (page.jsx)

The page itself should also have a server-side check for defense-in-depth:

```jsx
// src/app/admin/config/page.jsx
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdminConfigClient from "./AdminConfigClient";

export default async function AdminConfigPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  if (user?.privateMetadata?.role !== "admin") redirect("/");

  return <AdminConfigClient />;
}
```

---

## BFF Proxy Route

The BFF proxy injects the Clerk JWT and forwards all requests to the FastAPI backend:

```javascript
// src/app/api/admin/config/[...path]/route.js
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL;

async function proxyConfigRequest(request, pathSegments) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the Clerk JWT with FastAPI template
  const session = await auth();
  const token = await session.getToken({ template: "fastapi" });

  if (!token) {
    return NextResponse.json({ error: "Failed to get auth token" }, { status: 401 });
  }

  const path = pathSegments.join("/");
  const url = `${FASTAPI_BASE}/config/${path}`;
  const method = request.method;

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const fetchOptions = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = await request.text();
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}

export async function GET(request, { params }) {
  return proxyConfigRequest(request, params.path || []);
}

export async function PATCH(request, { params }) {
  return proxyConfigRequest(request, params.path || []);
}

export async function POST(request, { params }) {
  return proxyConfigRequest(request, params.path || []);
}
```

---

## API Client

```javascript
// src/lib/admin-config.js

const BASE = "/api/admin/config";

export async function fetchAllConfig() {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function fetchCategory(category) {
  const res = await fetch(`${BASE}/${category}`);
  if (!res.ok) throw new Error(`Failed to fetch category ${category}: ${res.status}`);
  return res.json();
}

export async function fetchConfigKey(key) {
  const res = await fetch(`${BASE}/key/${key}`);
  if (!res.ok) throw new Error(`Failed to fetch key ${key}: ${res.status}`);
  return res.json();
}

export async function updateConfigKey(key, value, reason = null) {
  const body = { value };
  if (reason) body.reason = reason;

  const res = await fetch(`${BASE}/key/${key}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || `Failed to update ${key}`);
  }

  return res.json();
}

export async function resetConfigKey(key) {
  const res = await fetch(`${BASE}/key/${key}/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to reset ${key}: ${res.status}`);
  return res.json();
}

export async function reloadConfig() {
  const res = await fetch(`${BASE}/reload`);
  if (!res.ok) throw new Error(`Failed to reload config: ${res.status}`);
  return res.json();
}

export async function fetchAuditLog(key = null, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (key) params.set("key", key);

  const res = await fetch(`${BASE}/audit?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch audit log: ${res.status}`);
  return res.json();
}

export async function fetchCategories() {
  const res = await fetch(`${BASE}/categories`);
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  return res.json();
}

export async function fetchSchema() {
  const res = await fetch(`${BASE}/schema`);
  if (!res.ok) throw new Error(`Failed to fetch schema: ${res.status}`);
  return res.json();
}
```

---

## Component Implementation Details

### ConfigCategoryNav

The category sidebar shows all 8 categories with their key counts. The active category is highlighted.

**Props:**
- `categories: Array<{ name: string, count: number }>` — from `GET /config/categories` + counts
- `activeCategory: string` — currently selected category
- `onSelect: (category: string) => void` — callback when a category is clicked

**Implementation Notes:**
- Use DaisyUI `menu` component for the sidebar
- Show category icons (emoji or Lucide icon): renko=🧱, execution=⚡, alpaca=📊, risk=🛡, sizing=📐, stream=📡, auth=🔐, regime=🌊
- Show key count as a badge next to each category name
- The active category gets the `active` class

### ConfigEditor

The main editor panel that renders all config keys for the selected category.

**Props:**
- `entries: Dict<string, ConfigEntryResponse>` — config entries from the active category
- `onUpdate: (key, value, reason) => Promise<void>` — callback for saving changes
- `onReset: (key) => Promise<void>` — callback for resetting to default
- `searchQuery: string` — current search filter

**Implementation Notes:**
- Each config key is rendered as a card with:
  - Key name (bold)
  - Description (muted text)
  - Type badge (float/int/bool/str/json)
  - Default value indicator
  - Range or allowed values indicator
  - Editable input (via `ConfigValueInput`)
  - Reset button (↩)
  - "Modified" indicator if value differs from default
- Filter entries by `searchQuery` (match against key name and description)
- Sort entries alphabetically within the category
- Track dirty state: which keys have been modified but not yet saved
- "Save All Changes" button: batch calls to `onUpdate` for each dirty key
- Disable save button when no changes are pending

### ConfigValueInput

Type-aware input component that renders the appropriate control based on `value_type`.

**Props:**
- `entry: ConfigEntryResponse` — the config entry being edited
- `value: any` — current edited value
- `onChange: (value: any) => void` — callback when value changes
- `error: string | null` — validation error message

**Rendering Logic:**

```jsx
switch (entry.value_type) {
  case "float":
    return <input type="number" step="0.01" min={entry.min_value} max={entry.max_value} />;
  case "int":
    return <input type="number" step="1" min={entry.min_value} max={entry.max_value} />;
  case "bool":
    return <input type="checkbox" className="toggle" />;
  case "str":
    if (entry.allowed_values?.length > 0) {
      return <select>{entry.allowed_values.map(v => <option>{v}</option>)}</select>;
    }
    return <input type="text" />;
  case "json":
    return <textarea rows={3} />; // with JSON validation on blur
}
```

**Validation:**
- Client-side validation fires on blur or on save
- Show red border + error message when invalid
- For `float`/`int`: check `min_value` and `max_value`
- For `json`: try `JSON.parse()` and show error if invalid
- For `str` with `allowed_values`: dropdown prevents invalid values

### ConfigSearchBar

A search input that filters the config entries across all categories.

**Props:**
- `onSearch: (query: string) => void` — callback when search query changes

**Implementation Notes:**
- Debounce the search callback (300ms) to avoid excessive re-renders
- Show a "clear" button (X) when the search query is non-empty
- When searching, switch the view to show results across all categories (not just the selected one)
- Match against key name and description (case-insensitive)

### ConfigAuditLog

The audit log panel shows recent config changes.

**Props:**
- `entries: Array<ConfigAuditEntry>` — audit log entries
- `onLoadMore: () => void` — callback to load more entries

**Implementation Notes:**
- Show each entry as a row with: timestamp, admin email/sub, key, old → new value, reason
- Color-code the old value (red) and new value (green) for quick visual scanning
- Paginate: load 20 at a time, "Load More" button at the bottom
- Optional: filter by key name (reuse search bar)

---

## Page Layout (AdminConfigClient)

The main client component that orchestrates all the pieces:

```jsx
"use client";

import { useState, useEffect } from "react";
import AdminGuard from "@/components/admin/AdminGuard";
import ConfigCategoryNav from "@/components/admin/ConfigCategoryNav";
import ConfigEditor from "@/components/admin/ConfigEditor";
import ConfigSearchBar from "@/components/admin/ConfigSearchBar";
import ConfigAuditLog from "@/components/admin/ConfigAuditLog";
import {
  fetchAllConfig,
  updateConfigKey,
  resetConfigKey,
  reloadConfig,
  fetchAuditLog,
} from "@/lib/admin-config";

export default function AdminConfigClient() {
  const [configData, setConfigData] = useState(null);
  const [activeCategory, setActiveCategory] = useState("renko");
  const [searchQuery, setSearchQuery] = useState("");
  const [auditEntries, setAuditEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all config on mount
  useEffect(() => {
    async function load() {
      try {
        const [config, audit] = await Promise.all([
          fetchAllConfig(),
          fetchAuditLog(null, 20),
        ]);
        setConfigData(config);
        setAuditEntries(audit);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ... handlers for update, reset, reload

  return (
    <AdminGuard>
      <div className="flex h-screen">
        <ConfigCategoryNav categories={...} activeCategory={activeCategory} onSelect={setActiveCategory} />
        <div className="flex-1 flex flex-col">
          <ConfigSearchBar onSearch={setSearchQuery} />
          <ConfigEditor entries={...} onUpdate={handleUpdate} onReset={handleReset} searchQuery={searchQuery} />
          <ConfigAuditLog entries={auditEntries} onLoadMore={loadMoreAudit} />
        </div>
      </div>
    </AdminGuard>
  );
}
```

---

## Styling

Use the existing DaisyUI v5 + Tailwind CSS 4 stack:

- **Sidebar:** `menu` component with `bg-base-200`
- **Config cards:** `card` component with `card-body`
- **Input fields:** DaisyUI `input`, `select`, `toggle` components
- **Buttons:** `btn` with `btn-primary` for save, `btn-ghost` for reset
- **Badges:** `badge` for type indicators and modified status
- **Toast:** DaisyUI `toast` for success/error notifications
- **Loading:** `loading loading-spinner` while fetching
- **Responsive:** The sidebar collapses to a horizontal tab bar on mobile (sm breakpoint)

---

## Navigation Integration

Add an "Admin" link to the main navigation that only appears for admin users:

```jsx
// In the main nav component (e.g., Navbar.jsx)
const { user } = useUser();
const isAdmin = user?.privateMetadata?.role === "admin";

{isAdmin && (
  <Link href="/admin/config" className="btn btn-ghost btn-sm">
    <ShieldIcon className="w-4 h-4" />
    Admin
  </Link>
)}
```

---

## Error States

| Scenario | UI Response |
|----------|------------|
| Backend unavailable | Full-page error with "Backend Unavailable" message + retry button |
| Auth failure (401/403) | Redirect to sign-in or home page |
| Validation error (422) | Red border on input + error message from backend |
| Save failure (500) | Error toast with error detail |
| Audit log failure | Empty audit panel with "Could not load audit log" message |
| Rate limited (429) | "Too many requests" toast |

---

## Testing Checklist

- [ ] Admin can access /admin/config
- [ ] Non-admin is redirected away
- [ ] Unauthenticated user is redirected to sign-in
- [ ] All 8 categories load with correct key counts
- [ ] Category switching works without API calls
- [ ] Search filters across all categories
- [ ] Float input validates min/max range
- [ ] Int input validates min/max range
- [ ] Bool toggle works correctly
- [ ] String dropdown renders for allowed_values
- [ ] JSON textarea validates JSON syntax
- [ ] Save sends PATCH for each modified key
- [ ] Reset sends POST /reset and updates value
- [ ] Reload button calls POST /reload
- [ ] Audit log shows recent changes
- [ ] Error states display correctly
- [ ] Mobile responsive (sidebar → tabs)
