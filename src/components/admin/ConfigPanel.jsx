"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  AlertTriangle,
  Check,
  X,
  Info,
  Database,
  Wifi,
  ChevronsUpDown,
  ChevronsDownUp,
  RotateCcwSquare,
  Keyboard,
  Clock,
  Layers,
  Edit3,
} from "lucide-react";

/**
 * Admin Config Panel — runtime configuration management.
 *
 * Enhanced version with:
 *   - Direct DB mode (primary) with FastAPI proxy fallback
 *   - Connection mode indicator (Direct DB vs FastAPI Proxy)
 *   - Summary stats bar (total keys, categories, modified, last updated)
 *   - Expand All / Collapse All buttons
 *   - Reset All Modified button
 *   - Category emojis for visual grouping
 *   - Dirty state indicator (unsaved edits)
 *   - Prominent "Click value to edit" hint
 *   - Search, inline editing, validation, reset, audit log, force reload
 */

const API_BASE = "/api/admin/config";
const FALLBACK_BASE = "/api/config";

const CATEGORY_ICONS = {
  renko: "🧱",
  sizing: "📐",
  risk: "🛡️",
  regime: "🌊",
  execution: "⚡",
  stream: "📡",
  alpaca: "🔌",
  auth: "🔐",
  general: "⚙️",
};

const CATEGORY_ORDER = [
  "renko",
  "sizing",
  "risk",
  "regime",
  "execution",
  "stream",
  "alpaca",
  "auth",
  "general",
];

export default function ConfigPanel() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionMode, setConnectionMode] = useState("unknown"); // "direct_db" | "fastapi_proxy" | "unknown"
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [reloading, setReloading] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState(new Set()); // keys with unsaved edits
  const [resettingAll, setResettingAll] = useState(false);

  // ── Fetch config (try direct DB first, fallback to FastAPI proxy) ────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary: direct Supabase DB
      const res = await fetch(API_BASE);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConnectionMode(data.source === "direct_db" ? "direct_db" : "fastapi_proxy");
        if (data?.categories && expandedCats.size === 0) {
          const cats = Object.keys(data.categories);
          if (cats.length > 0) setExpandedCats(new Set([cats[0]]));
        }
        return;
      }
      // Fallback: FastAPI proxy
      console.warn("[ConfigPanel] Direct DB failed, falling back to FastAPI proxy");
      const fallbackRes = await fetch(`${FALLBACK_BASE}/`);
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        setConfig(data);
        setConnectionMode("fastapi_proxy");
        if (data?.categories && expandedCats.size === 0) {
          const cats = Object.keys(data.categories);
          if (cats.length > 0) setExpandedCats(new Set([cats[0]]));
        }
        return;
      }
      throw new Error("Both direct DB and FastAPI proxy failed");
    } catch (err) {
      setError(err.message);
      setConnectionMode("unknown");
    } finally {
      setLoading(false);
    }
  }, [expandedCats.size]);

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Get active API base based on connection mode ─────────────────────────
  const getApiBase = useCallback(() => {
    return connectionMode === "direct_db" ? API_BASE : FALLBACK_BASE;
  }, [connectionMode]);

  // ── Toggle category expansion ────────────────────────────────────────────
  const toggleCat = (cat) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const expandAll = () => {
    if (!config?.categories) return;
    setExpandedCats(new Set(Object.keys(config.categories)));
  };

  const collapseAll = () => {
    setExpandedCats(new Set());
  };

  // ── Start editing a config value ─────────────────────────────────────────
  const startEdit = (key, entry) => {
    setEditingKey(key);
    let displayVal = entry.value;
    if (entry.value_type === "json") {
      displayVal = JSON.stringify(entry.value, null, 2);
    } else if (typeof entry.value === "boolean") {
      displayVal = entry.value ? "true" : "false";
    }
    setEditValue(String(displayVal));
    setEditReason("");
    setSaveResult(null);
  };

  // ── Cancel editing ───────────────────────────────────────────────────────
  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setEditReason("");
    setSaveResult(null);
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      next.delete(editingKey);
      return next;
    });
  };

  // ── Save edited value ────────────────────────────────────────────────────
  const saveEdit = async (key) => {
    setSaving(true);
    setSaveResult(null);
    try {
      let parsedValue = editValue;
      const entry = findEntry(key);
      if (!entry) throw new Error("Entry not found");

      if (entry.value_type === "float") {
        parsedValue = parseFloat(editValue);
        if (isNaN(parsedValue)) throw new Error("Invalid float value");
      } else if (entry.value_type === "int") {
        parsedValue = parseInt(editValue, 10);
        if (isNaN(parsedValue)) throw new Error("Invalid integer value");
      } else if (entry.value_type === "bool") {
        parsedValue = editValue.toLowerCase() === "true";
      } else if (entry.value_type === "json") {
        parsedValue = JSON.parse(editValue);
      }

      const base = getApiBase();
      const res = await fetch(`${base}/key/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parsedValue, reason: editReason || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      setSaveResult({ key, success: true, message: "Saved" });
      setEditingKey(null);
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      await fetchConfig();
    } catch (err) {
      setSaveResult({ key, success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset a key to default ───────────────────────────────────────────────
  const resetKey = async (key) => {
    if (!confirm(`Reset "${key}" to its default value?`)) return;
    try {
      const base = getApiBase();
      const res = await fetch(
        `${base}/key/${encodeURIComponent(key)}/reset`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Reset failed" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      await fetchConfig();
    } catch (err) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  // ── Reset ALL modified keys to default ───────────────────────────────────
  const resetAllModified = async () => {
    if (!config?.categories) return;
    const modifiedKeys = getModifiedKeys();
    if (modifiedKeys.length === 0) return;
    if (!confirm(`Reset ${modifiedKeys.length} modified key(s) to their defaults?`)) return;

    setResettingAll(true);
    let successCount = 0;
    let failCount = 0;
    const base = getApiBase();

    for (const key of modifiedKeys) {
      try {
        const res = await fetch(
          `${base}/key/${encodeURIComponent(key)}/reset`,
          { method: "POST" }
        );
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    await fetchConfig();
    setResettingAll(false);

    if (failCount > 0) {
      alert(`Reset complete: ${successCount} succeeded, ${failCount} failed`);
    }
  };

  // ── Force reload from DB ─────────────────────────────────────────────────
  const forceReload = async () => {
    setReloading(true);
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/reload`, { method: "GET" });
      if (!res.ok) throw new Error("Reload failed");
      await fetchConfig();
    } catch (err) {
      alert(`Reload failed: ${err.message}`);
    } finally {
      setReloading(false);
    }
  };

  // ── Fetch audit log ──────────────────────────────────────────────────────
  const fetchAudit = async () => {
    if (showAudit) {
      setShowAudit(false);
      return;
    }
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/audit?limit=30`);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      const data = await res.json();
      setAuditLog(Array.isArray(data) ? data : []);
      setShowAudit(true);
    } catch (err) {
      alert(`Audit fetch failed: ${err.message}`);
    }
  };

  // ── Helper: find entry by key across all categories ──────────────────────
  const findEntry = (key) => {
    if (!config?.categories) return null;
    for (const cat of Object.values(config.categories)) {
      if (cat.entries[key]) return cat.entries[key];
    }
    return null;
  };

  // ── Get all modified keys ────────────────────────────────────────────────
  const getModifiedKeys = () => {
    if (!config?.categories) return [];
    const modified = [];
    for (const cat of Object.values(config.categories)) {
      for (const [key, entry] of Object.entries(cat.entries)) {
        if (
          entry.default_value != null &&
          JSON.stringify(entry.value) !== JSON.stringify(entry.default_value)
        ) {
          modified.push(key);
        }
      }
    }
    return modified;
  };

  // ── Get last updated timestamp ───────────────────────────────────────────
  const getLastUpdated = () => {
    if (!config?.categories) return null;
    let latest = null;
    for (const cat of Object.values(config.categories)) {
      for (const entry of Object.values(cat.entries)) {
        if (entry.updated_at) {
          const d = new Date(entry.updated_at);
          if (!latest || d > latest) latest = d;
        }
      }
    }
    return latest;
  };

  // ── Filter entries by search query ───────────────────────────────────────
  const matchesSearch = (key, entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      entry.description?.toLowerCase().includes(q) ||
      String(entry.value).toLowerCase().includes(q)
    );
  };

  // ── Render type-aware input for editing ──────────────────────────────────
  const renderEditInput = (entry) => {
    if (entry.value_type === "bool") {
      return (
        <div className="flex gap-2">
          <button
            className={`btn btn-sm ${editValue === "true" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setEditValue("true");
              setDirtyKeys((prev) => new Set(prev).add(editingKey));
            }}
          >
            True
          </button>
          <button
            className={`btn btn-sm ${editValue === "false" ? "btn-error" : "btn-ghost"}`}
            onClick={() => {
              setEditValue("false");
              setDirtyKeys((prev) => new Set(prev).add(editingKey));
            }}
          >
            False
          </button>
        </div>
      );
    }

    if (entry.allowed_values) {
      return (
        <select
          className="select select-bordered select-sm w-full max-w-xs"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setDirtyKeys((prev) => new Set(prev).add(editingKey));
          }}
        >
          {entry.allowed_values.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      );
    }

    if (entry.value_type === "json") {
      return (
        <textarea
          className="textarea textarea-bordered textarea-sm w-full font-mono text-xs"
          rows={3}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setDirtyKeys((prev) => new Set(prev).add(editingKey));
          }}
        />
      );
    }

    return (
      <input
        type={entry.value_type === "int" || entry.value_type === "float" ? "number" : "text"}
        step={entry.value_type === "float" ? "any" : undefined}
        min={entry.min_value != null ? entry.min_value : undefined}
        max={entry.max_value != null ? entry.max_value : undefined}
        className="input input-bordered input-sm w-full max-w-xs font-mono"
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
          setDirtyKeys((prev) => new Set(prev).add(editingKey));
        }}
      />
    );
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const modifiedKeys = getModifiedKeys();
  const modifiedCount = modifiedKeys.length;
  const categoryCount = config?.categories ? Object.keys(config.categories).length : 0;
  const totalEntries = config?.total_entries || 0;
  const lastUpdated = getLastUpdated();
  const hasDirty = dirtyKeys.size > 0;

  // ── Loading / Error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
        <span className="text-base-content/60">Loading config...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <AlertTriangle className="w-5 h-5" />
        <span>Failed to load config: {error}</span>
        <button className="btn btn-sm btn-ghost" onClick={fetchConfig}>
          Retry
        </button>
      </div>
    );
  }

  if (!config?.categories) {
    return (
      <div className="alert alert-warning">
        <Info className="w-5 h-5" />
        <span>No config entries found. Run the Supabase migration first.</span>
      </div>
    );
  }

  const sortedCategories = Object.entries(config.categories).sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-4">
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Runtime Configuration
        </h2>

        {/* Connection mode indicator */}
        <div
          className={`badge gap-1 ${
            connectionMode === "direct_db"
              ? "badge-success"
              : connectionMode === "fastapi_proxy"
                ? "badge-warning"
                : "badge-ghost"
          }`}
        >
          {connectionMode === "direct_db" ? (
            <Database className="w-3 h-3" />
          ) : connectionMode === "fastapi_proxy" ? (
            <Wifi className="w-3 h-3" />
          ) : null}
          {connectionMode === "direct_db"
            ? "Direct DB"
            : connectionMode === "fastapi_proxy"
              ? "FastAPI Proxy"
              : "Unknown"}
        </div>

        <div className="flex-1" />

        {/* Expand/Collapse buttons */}
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={expandAll}
          title="Expand all categories"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          Expand All
        </button>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={collapseAll}
          title="Collapse all categories"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" />
          Collapse All
        </button>

        <div className="divider divider-horizontal mx-0" />

        <button
          className="btn btn-sm btn-outline gap-1"
          onClick={fetchAudit}
        >
          <Info className="w-4 h-4" />
          {showAudit ? "Hide Audit" : "Audit Log"}
        </button>
        <button
          className="btn btn-sm btn-outline gap-1"
          onClick={forceReload}
          disabled={reloading}
        >
          <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
          {reloading ? "Reloading..." : "Force Reload"}
        </button>
      </div>

      {/* ── Summary stats bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="badge badge-lg badge-outline gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          {totalEntries} keys
        </div>
        <div className="badge badge-lg badge-outline gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          {categoryCount} categories
        </div>
        {modifiedCount > 0 && (
          <div className="badge badge-lg badge-warning gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            {modifiedCount} modified
          </div>
        )}
        {lastUpdated && (
          <div className="badge badge-lg badge-ghost gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last updated: {lastUpdated.toLocaleString()}
          </div>
        )}
        {hasDirty && (
          <div className="badge badge-lg badge-error gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {dirtyKeys.size} unsaved
          </div>
        )}
        {modifiedCount > 0 && (
          <button
            className="btn btn-xs btn-warning gap-1 ml-auto"
            onClick={resetAllModified}
            disabled={resettingAll}
          >
            <RotateCcwSquare className="w-3.5 h-3.5" />
            {resettingAll ? "Resetting..." : "Reset All Modified"}
          </button>
        )}
      </div>

      {/* ── Search bar + hint ───────────────────────────────────────────────── */}
      <div className="form-control">
        <div className="relative">
          <Search className="w-5 h-5 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search keys, descriptions, values..."
            className="input input-bordered w-full pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/40 flex items-center gap-1">
            <Keyboard className="w-3 h-3" />
            Click any value to edit inline · Changes are saved immediately
          </span>
        </label>
      </div>

      {/* ── Audit log panel ─────────────────────────────────────────────────── */}
      {showAudit && auditLog.length > 0 && (
        <div className="card bg-base-200 shadow">
          <div className="card-body p-4">
            <h3 className="text-sm font-bold mb-2">Recent Config Changes</h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Key</th>
                    <th>Old</th>
                    <th>New</th>
                    <th>By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-xs opacity-60">
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="font-mono text-xs">{entry.key}</td>
                      <td className="font-mono text-xs text-error">
                        {entry.old_value != null ? String(entry.old_value) : "—"}
                      </td>
                      <td className="font-mono text-xs text-success">
                        {entry.new_value != null ? String(entry.new_value) : "—"}
                      </td>
                      <td className="text-xs">{entry.changed_by}</td>
                      <td className="text-xs opacity-60">{entry.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Categories ──────────────────────────────────────────────────────── */}
      {sortedCategories.map(([catName, catData]) => {
        const isExpanded = expandedCats.has(catName);
        const filteredEntries = Object.entries(catData.entries).filter(
          ([key, entry]) => matchesSearch(key, entry)
        );
        if (searchQuery && filteredEntries.length === 0) return null;

        const catIcon = CATEGORY_ICONS[catName] || CATEGORY_ICONS.general;

        // Count modified entries in this category
        const catModified = Object.entries(catData.entries).filter(
          ([_, entry]) =>
            entry.default_value != null &&
            JSON.stringify(entry.value) !== JSON.stringify(entry.default_value)
        ).length;

        return (
          <div key={catName} className="card bg-base-100 shadow">
            <div
              className="card-body p-0 cursor-pointer"
              onClick={() => toggleCat(catName)}
            >
              {/* Category header */}
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="text-lg leading-none">{catIcon}</span>
                <span className="font-bold capitalize">{catName}</span>
                <span className="badge badge-ghost badge-sm">
                  {catData.count}
                </span>
                {catModified > 0 && (
                  <span className="badge badge-warning badge-sm gap-1">
                    {catModified} modified
                  </span>
                )}
                {searchQuery && filteredEntries.length < catData.count && (
                  <span className="badge badge-outline badge-sm">
                    {filteredEntries.length} match
                    {filteredEntries.length !== 1 ? "es" : ""}
                  </span>
                )}
              </div>

              {/* Entries */}
              {isExpanded && (
                <div className="border-t border-base-300">
                  <div className="divide-y divide-base-200">
                    {filteredEntries.map(([key, entry]) => {
                      const isEditing = editingKey === key;
                      const saveMsg = saveResult?.key === key ? saveResult : null;
                      const isModified =
                        entry.default_value != null &&
                        JSON.stringify(entry.value) !==
                          JSON.stringify(entry.default_value);
                      const isDirty = dirtyKeys.has(key);

                      return (
                        <div
                          key={key}
                          className={`px-4 py-3 ${
                            isEditing
                              ? "bg-primary/5"
                              : isDirty
                                ? "bg-warning/5"
                                : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Key + description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium">
                                  {key}
                                </span>
                                <span className="badge badge-outline badge-xs uppercase">
                                  {entry.value_type}
                                </span>
                                {isDirty && (
                                  <span className="badge badge-error badge-xs gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-error-content inline-block" />
                                    unsaved
                                  </span>
                                )}
                                {isModified && !isDirty && (
                                  <span className="badge badge-warning badge-xs">
                                    modified
                                  </span>
                                )}
                                {entry.requires_restart && (
                                  <span className="badge badge-error badge-xs">
                                    restart needed
                                  </span>
                                )}
                                {entry.is_sensitive && (
                                  <span className="badge badge-ghost badge-xs">
                                    sensitive
                                  </span>
                                )}
                              </div>
                              {entry.description && (
                                <p className="text-xs text-base-content/50 mt-0.5">
                                  {entry.description}
                                </p>
                              )}
                              {/* Range info */}
                              {(entry.min_value != null ||
                                entry.max_value != null) && (
                                <p className="text-xs text-base-content/40 mt-0.5">
                                  Range: [{entry.min_value ?? "—"},{" "}
                                  {entry.max_value ?? "—"}]
                                  {entry.default_value != null && (
                                    <> · Default: {String(entry.default_value)}</>
                                  )}
                                </p>
                              )}
                              {entry.env_var && (
                                <p className="text-xs text-base-content/30 mt-0.5 font-mono">
                                  env: {entry.env_var}
                                </p>
                              )}
                            </div>

                            {/* Value display / edit */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isEditing ? (
                                <div className="space-y-2 w-64">
                                  {renderEditInput(entry)}
                                  <input
                                    type="text"
                                    placeholder="Reason (optional)"
                                    className="input input-bordered input-xs w-full"
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      className="btn btn-xs btn-primary gap-1"
                                      onClick={() => saveEdit(key)}
                                      disabled={saving}
                                    >
                                      <Save className="w-3 h-3" />
                                      {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      className="btn btn-xs btn-ghost"
                                      onClick={cancelEdit}
                                    >
                                      <X className="w-3 h-3" />
                                      Cancel
                                    </button>
                                  </div>
                                  {saveMsg && (
                                    <div
                                      className={`text-xs ${
                                        saveMsg.success ? "text-success" : "text-error"
                                      }`}
                                    >
                                      {saveMsg.message}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <span
                                    className="font-mono text-sm cursor-pointer hover:bg-base-200 px-2 py-1 rounded transition-colors group relative"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(key, entry);
                                    }}
                                    title="Click to edit"
                                  >
                                    {entry.is_sensitive
                                      ? "••••••"
                                      : entry.value_type === "json"
                                        ? JSON.stringify(entry.value).slice(0, 40) +
                                          (JSON.stringify(entry.value).length > 40
                                            ? "..."
                                            : "")
                                        : String(entry.value)}
                                    {/* Subtle edit indicator on hover */}
                                    <span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Edit3 className="w-3 h-3 text-primary" />
                                    </span>
                                  </span>
                                  <button
                                    className="btn btn-xs btn-ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(key, entry);
                                    }}
                                    title="Edit"
                                  >
                                    <Save className="w-3 h-3" />
                                  </button>
                                  {isModified && (
                                    <button
                                      className="btn btn-xs btn-ghost text-warning"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        resetKey(key);
                                      }}
                                      title="Reset to default"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Unsaved changes warning ─────────────────────────────────────────── */}
      {hasDirty && (
        <div className="alert alert-warning">
          <AlertTriangle className="w-5 h-5" />
          <span>
            You have {dirtyKeys.size} unsaved edit{dirtyKeys.size !== 1 ? "s" : ""}.
            Save or cancel to discard.
          </span>
        </div>
      )}
    </div>
  );
}
