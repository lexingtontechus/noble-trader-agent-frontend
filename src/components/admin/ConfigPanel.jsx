"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  ArrowLeft,
  Filter,
  History,
  ToggleLeft,
  ToggleRight,
  Minus,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * Admin Config Panel — runtime configuration management.
 *
 * v2.0 — Enhanced with:
 *   - Category sidebar navigation (desktop) + dropdown (mobile)
 *   - Type-aware editors: toggle for bool, slider for numeric ranges,
 *     dropdown for allowed_values, textarea for JSON, text for strings
 *   - Per-key Reset to Default button with visual feedback
 *   - Enhanced audit log with filtering and better formatting
 *   - Search/filter across all 148 keys
 *   - Unsaved changes guard (beforeunload + navigation)
 *   - Dual data source: Direct DB (primary) → FastAPI proxy (fallback)
 *   - Connection mode indicator
 *   - Summary stats bar
 *   - Expand All / Collapse All
 *   - Reset All Modified
 *   - Dirty state tracking
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

const CATEGORY_DESCRIPTIONS = {
  renko: "Renko brick construction, thresholds, and analysis parameters",
  sizing: "Position sizing, Kelly fraction, and allocation controls",
  risk: "Risk management, circuit breakers, and stop-loss parameters",
  regime: "HMM regime detection model configuration",
  execution: "Order execution, timing, and fill management",
  stream: "Real-time data streaming and WebSocket settings",
  alpaca: "Alpaca broker API integration settings",
  auth: "Authentication, API keys, and session management",
  general: "General system configuration",
};

export default function ConfigPanel() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionMode, setConnectionMode] = useState("unknown");
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [reloading, setReloading] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState(new Set());
  const [resettingAll, setResettingAll] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(null); // { key, success }
  const [showSensitive, setShowSensitive] = useState(new Set());

  // ── Unsaved changes guard ────────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (dirtyKeys.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyKeys.size]);

  // ── Fetch config ────────────────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConnectionMode(data.source === "direct_db" ? "direct_db" : "fastapi_proxy");
        if (data?.categories && !activeCategory) {
          const cats = Object.keys(data.categories).sort(
            (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
          );
          if (cats.length > 0) setActiveCategory(cats[0]);
        }
        return;
      }
      console.warn("[ConfigPanel] Direct DB failed, falling back to FastAPI proxy");
      const fallbackRes = await fetch(`${FALLBACK_BASE}/`);
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        setConfig(data);
        setConnectionMode("fastapi_proxy");
        if (data?.categories && !activeCategory) {
          const cats = Object.keys(data.categories);
          if (cats.length > 0) setActiveCategory(cats[0]);
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
  }, [activeCategory]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const getApiBase = useCallback(() => {
    return connectionMode === "direct_db" ? API_BASE : FALLBACK_BASE;
  }, [connectionMode]);

  // ── Start editing ───────────────────────────────────────────────────────
  const startEdit = (key, entry) => {
    setEditingKey(key);
    let displayVal = entry.value;
    if (entry.value_type === "json") {
      displayVal = JSON.stringify(entry.value, null, 2);
    } else if (typeof entry.value === "boolean") {
      displayVal = String(entry.value);
    }
    setEditValue(String(displayVal));
    setEditReason("");
    setSaveResult(null);
  };

  // ── Cancel editing ──────────────────────────────────────────────────────
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

  // ── Save edited value ───────────────────────────────────────────────────
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
        parsedValue = editValue === "true";
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

  // ── Reset a key to default ──────────────────────────────────────────────
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
      setResetFeedback({ key, success: true });
      setTimeout(() => setResetFeedback(null), 2000);
      await fetchConfig();
    } catch (err) {
      setResetFeedback({ key, success: false });
      setTimeout(() => setResetFeedback(null), 3000);
      alert(`Reset failed: ${err.message}`);
    }
  };

  // ── Reset ALL modified keys ─────────────────────────────────────────────
  const resetAllModified = async () => {
    if (!config?.categories) return;
    const modifiedKeys = getModifiedKeys();
    if (modifiedKeys.length === 0) return;
    if (!confirm(`Reset ${modifiedKeys.length} modified key(s) to their defaults? This cannot be undone.`)) return;

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

  // ── Force reload ────────────────────────────────────────────────────────
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

  // ── Fetch audit log ─────────────────────────────────────────────────────
  const fetchAudit = async () => {
    if (showAudit) {
      setShowAudit(false);
      return;
    }
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/audit?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      const data = await res.json();
      setAuditLog(Array.isArray(data) ? data : data.entries || []);
      setShowAudit(true);
    } catch (err) {
      alert(`Audit fetch failed: ${err.message}`);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const findEntry = (key) => {
    if (!config?.categories) return null;
    for (const cat of Object.values(config.categories)) {
      if (cat.entries[key]) return cat.entries[key];
    }
    return null;
  };

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

  const matchesSearch = (key, entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      entry.description?.toLowerCase().includes(q) ||
      String(entry.value).toLowerCase().includes(q) ||
      entry.category?.toLowerCase().includes(q)
    );
  };

  // ── Toggle sensitive visibility ─────────────────────────────────────────
  const toggleSensitive = (key) => {
    setShowSensitive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Computed values ─────────────────────────────────────────────────────
  const modifiedKeys = getModifiedKeys();
  const modifiedCount = modifiedKeys.length;
  const categoryCount = config?.categories ? Object.keys(config.categories).length : 0;
  const totalEntries = config?.total_entries || 0;
  const lastUpdated = getLastUpdated();
  const hasDirty = dirtyKeys.size > 0;

  const sortedCategories = useMemo(() => {
    if (!config?.categories) return [];
    return Object.entries(config.categories).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [config]);

  // Compute search results across all categories
  const searchResults = useMemo(() => {
    if (!searchQuery) return null;
    const results = [];
    for (const [catName, catData] of sortedCategories) {
      for (const [key, entry] of Object.entries(catData.entries)) {
        if (matchesSearch(key, entry)) {
          results.push({ key, entry, category: catName });
        }
      }
    }
    return results;
  }, [searchQuery, sortedCategories]);

  // ── Render type-aware input for editing ──────────────────────────────────
  const renderEditInput = (entry) => {
    // Bool → toggle switch
    if (entry.value_type === "bool") {
      const isTrue = editValue === "true";
      return (
        <div className="flex items-center gap-3">
          <button
            className={`btn btn-sm gap-2 ${isTrue ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setEditValue(isTrue ? "false" : "true");
              setDirtyKeys((prev) => new Set(prev).add(editingKey));
            }}
          >
            {isTrue ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
            {isTrue ? "Enabled" : "Disabled"}
          </button>
        </div>
      );
    }

    // Allowed values → dropdown select
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

    // JSON → textarea
    if (entry.value_type === "json") {
      return (
        <textarea
          className="textarea textarea-bordered textarea-sm w-full font-mono text-xs"
          rows={5}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setDirtyKeys((prev) => new Set(prev).add(editingKey));
          }}
        />
      );
    }

    // Numeric with range → slider + number input
    if ((entry.value_type === "int" || entry.value_type === "float") &&
        (entry.min_value != null || entry.max_value != null)) {
      const min = entry.min_value ?? 0;
      const max = entry.max_value ?? 100;
      const step = entry.value_type === "float" ? (max - min) / 100 : 1;
      const numVal = entry.value_type === "float" ? parseFloat(editValue) : parseInt(editValue, 10);

      return (
        <div className="space-y-2 w-full max-w-xs">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={isNaN(numVal) ? min : numVal}
              className="range range-sm range-primary flex-1"
              onChange={(e) => {
                const v = entry.value_type === "float"
                  ? parseFloat(e.target.value)
                  : parseInt(e.target.value, 10);
                setEditValue(String(v));
                setDirtyKeys((prev) => new Set(prev).add(editingKey));
              }}
            />
            <input
              type="number"
              step={entry.value_type === "float" ? "any" : "1"}
              min={entry.min_value != null ? entry.min_value : undefined}
              max={entry.max_value != null ? entry.max_value : undefined}
              className="input input-bordered input-sm w-24 font-mono text-center"
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setDirtyKeys((prev) => new Set(prev).add(editingKey));
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-base-content/40 px-1">
            <span>Min: {min}</span>
            <span>Default: {String(entry.default_value)}</span>
            <span>Max: {max}</span>
          </div>
        </div>
      );
    }

    // Plain number or string
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

  // ── Sidebar category list for desktop ─────────────────────────────────
  const renderSidebar = () => (
    <div className="hidden lg:block w-56 flex-shrink-0">
      <div className="sticky top-4 space-y-1">
        {sortedCategories.map(([catName, catData]) => {
          const isActive = activeCategory === catName;
          const catIcon = CATEGORY_ICONS[catName] || CATEGORY_ICONS.general;
          const catModified = Object.entries(catData.entries).filter(
            ([_, entry]) =>
              entry.default_value != null &&
              JSON.stringify(entry.value) !== JSON.stringify(entry.default_value)
          ).length;

          return (
            <button
              key={catName}
              className={`btn btn-ghost btn-sm w-full justify-start gap-2 ${
                isActive ? "btn-active bg-primary/10 text-primary" : ""
              }`}
              onClick={() => { setActiveCategory(catName); setSearchQuery(""); }}
            >
              <span className="text-base leading-none">{catIcon}</span>
              <span className="capitalize font-medium text-sm">{catName}</span>
              <span className="badge badge-ghost badge-xs ml-auto">{catData.count}</span>
              {catModified > 0 && (
                <span className="badge badge-warning badge-xs">{catModified}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Mobile category dropdown ──────────────────────────────────────────
  const renderMobileCategorySelect = () => (
    <div className="lg:hidden">
      <select
        className="select select-bordered select-sm w-full"
        value={activeCategory || ""}
        onChange={(e) => { setActiveCategory(e.target.value); setSearchQuery(""); }}
      >
        {sortedCategories.map(([catName, catData]) => (
          <option key={catName} value={catName}>
            {CATEGORY_ICONS[catName] || "⚙️"} {catName} ({catData.count})
          </option>
        ))}
      </select>
    </div>
  );

  // ── Single config entry row ───────────────────────────────────────────
  const renderEntry = (key, entry, category) => {
    const isEditing = editingKey === key;
    const saveMsg = saveResult?.key === key ? saveResult : null;
    const isModified =
      entry.default_value != null &&
      JSON.stringify(entry.value) !== JSON.stringify(entry.default_value);
    const isDirty = dirtyKeys.has(key);
    const isResetting = resetFeedback?.key === key;

    return (
      <div
        key={key}
        className={`px-4 py-3 transition-colors ${
          isEditing
            ? "bg-primary/5"
            : isDirty
              ? "bg-warning/5"
              : isResetting && resetFeedback?.success
                ? "bg-success/10"
                : ""
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Key + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">{key}</span>
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
                <span className="badge badge-warning badge-xs">modified</span>
              )}
              {entry.requires_restart && (
                <span className="badge badge-error badge-xs">restart needed</span>
              )}
              {entry.is_sensitive && (
                <span className="badge badge-ghost badge-xs">sensitive</span>
              )}
              {category && (
                <span className="badge badge-ghost badge-xs capitalize lg:hidden">
                  {category}
                </span>
              )}
            </div>
            {entry.description && (
              <p className="text-xs text-base-content/50 mt-0.5">{entry.description}</p>
            )}
            {/* Range info */}
            {(entry.min_value != null || entry.max_value != null) && (
              <p className="text-xs text-base-content/40 mt-0.5">
                Range: [{entry.min_value ?? "—"}, {entry.max_value ?? "—"}]
                {entry.default_value != null && (
                  <> &middot; Default: <span className="font-mono">{String(entry.default_value)}</span></>
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
              <div className="space-y-2 w-72">
                {renderEditInput(entry)}
                <input
                  type="text"
                  placeholder="Reason for change (optional)"
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
                    className={`text-xs flex items-center gap-1 ${
                      saveMsg.success ? "text-success" : "text-error"
                    }`}
                  >
                    {saveMsg.success ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {saveMsg.message}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Value display */}
                <span
                  className="font-mono text-sm cursor-pointer hover:bg-base-200 px-2 py-1 rounded transition-colors group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(key, entry);
                  }}
                  title="Click to edit"
                >
                  {entry.is_sensitive && !showSensitive.has(key)
                    ? "••••••"
                    : entry.value_type === "json"
                      ? JSON.stringify(entry.value).slice(0, 40) +
                        (JSON.stringify(entry.value).length > 40 ? "..." : "")
                      : entry.value_type === "bool"
                        ? entry.value
                          ? "✓ true"
                          : "✗ false"
                        : String(entry.value)}
                  <span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 className="w-3 h-3 text-primary" />
                  </span>
                </span>

                {/* Sensitive toggle */}
                {entry.is_sensitive && (
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSensitive(key);
                    }}
                    title={showSensitive.has(key) ? "Hide value" : "Show value"}
                  >
                    {showSensitive.has(key) ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                )}

                {/* Edit button */}
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(key, entry);
                  }}
                  title="Edit"
                >
                  <Edit3 className="w-3 h-3" />
                </button>

                {/* Reset to default button — always visible for modified keys */}
                {isModified && (
                  <button
                    className={`btn btn-xs gap-1 ${
                      isResetting && resetFeedback?.success
                        ? "btn-success"
                        : "btn-ghost text-warning"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      resetKey(key);
                    }}
                    title="Reset to default"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {isResetting && resetFeedback?.success ? "Reset!" : "Reset"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Category content panel ────────────────────────────────────────────
  const renderCategoryContent = (catName, catData) => {
    const filteredEntries = Object.entries(catData.entries).filter(
      ([key, entry]) => matchesSearch(key, entry)
    );
    if (searchQuery && filteredEntries.length === 0) return null;

    const catIcon = CATEGORY_ICONS[catName] || CATEGORY_ICONS.general;
    const catModified = Object.entries(catData.entries).filter(
      ([_, entry]) =>
        entry.default_value != null &&
        JSON.stringify(entry.value) !== JSON.stringify(entry.default_value)
    ).length;

    return (
      <div key={catName} className="card bg-base-100 shadow">
        {/* Category header */}
        <div className="px-4 py-3 border-b border-base-300 bg-base-200/30">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{catIcon}</span>
            <span className="font-bold capitalize text-base">{catName}</span>
            <span className="badge badge-ghost badge-sm">{catData.count} keys</span>
            {catModified > 0 && (
              <span className="badge badge-warning badge-sm">{catModified} modified</span>
            )}
            {CATEGORY_DESCRIPTIONS[catName] && (
              <span className="text-xs text-base-content/40 ml-2 hidden md:inline">
                {CATEGORY_DESCRIPTIONS[catName]}
              </span>
            )}
          </div>
        </div>

        {/* Entries */}
        <div className="divide-y divide-base-200">
          {filteredEntries.map(([key, entry]) => renderEntry(key, entry, null))}
        </div>

        {filteredEntries.length === 0 && (
          <div className="px-4 py-6 text-center text-base-content/40 text-sm">
            No matching keys found
          </div>
        )}
      </div>
    );
  };

  // ── Audit log panel ───────────────────────────────────────────────────
  const renderAuditLog = () => {
    if (!showAudit) return null;

    const filteredLog = auditFilter
      ? auditLog.filter(
          (e) =>
            e.key?.toLowerCase().includes(auditFilter.toLowerCase()) ||
            e.changed_by?.toLowerCase().includes(auditFilter.toLowerCase()) ||
            e.reason?.toLowerCase().includes(auditFilter.toLowerCase())
        )
      : auditLog;

    return (
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <History className="w-4 h-4" />
              Config Change History
              <span className="badge badge-ghost badge-sm">{auditLog.length} entries</span>
            </h3>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setShowAudit(false)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Audit filter */}
          <div className="form-control mb-3">
            <div className="relative">
              <Filter className="w-4 h-4 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by key, user, or reason..."
                className="input input-bordered input-sm w-full pl-9"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Key</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                  <th>Changed By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-base-content/40 py-4">
                      No audit entries found
                    </td>
                  </tr>
                ) : (
                  filteredLog.map((entry) => (
                    <tr key={entry.id} className="hover">
                      <td className="whitespace-nowrap text-xs opacity-60">
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="font-mono text-xs">{entry.key}</td>
                      <td className="font-mono text-xs text-error max-w-[12rem] truncate">
                        {entry.old_value != null ? String(entry.old_value) : "—"}
                      </td>
                      <td className="font-mono text-xs text-success max-w-[12rem] truncate">
                        {entry.new_value != null ? String(entry.new_value) : "—"}
                      </td>
                      <td className="text-xs">{entry.changed_by || "—"}</td>
                      <td className="text-xs opacity-60 max-w-[16rem] truncate">
                        {entry.reason || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Header bar ──────────────────────────────────────────────────── */}
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

        <button
          className="btn btn-sm btn-outline gap-1"
          onClick={fetchAudit}
        >
          <History className="w-4 h-4" />
          {showAudit ? "Hide Audit" : "Audit Log"}
        </button>
        <button
          className="btn btn-sm btn-outline gap-1"
          onClick={forceReload}
          disabled={reloading}
        >
          <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
          {reloading ? "Reloading..." : "Refresh"}
        </button>
      </div>

      {/* ── Summary stats bar ───────────────────────────────────────────── */}
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
          <div className="badge badge-lg badge-error gap-1.5 animate-pulse">
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

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div className="form-control">
        <div className="relative">
          <Search className="w-5 h-5 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search keys, descriptions, values, categories..."
            className="input input-bordered w-full pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="btn btn-xs btn-ghost absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/40 flex items-center gap-1">
            <Keyboard className="w-3 h-3" />
            Click any value to edit inline &middot; Changes are saved immediately
          </span>
          {searchQuery && searchResults && (
            <span className="label-text-alt text-base-content/40">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </span>
          )}
        </label>
      </div>

      {/* ── Audit log panel ─────────────────────────────────────────────── */}
      {renderAuditLog()}

      {/* ── Main content: sidebar + category panel ──────────────────────── */}
      <div className="flex gap-4">
        {renderSidebar()}

        <div className="flex-1 min-w-0 space-y-4">
          {/* Mobile category select */}
          {renderMobileCategorySelect()}

          {/* Search results mode */}
          {searchQuery && searchResults ? (
            <div className="card bg-base-100 shadow">
              <div className="px-4 py-3 border-b border-base-300 bg-base-200/30">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-base-content/40" />
                  <span className="font-bold text-sm">
                    Search Results: &ldquo;{searchQuery}&rdquo;
                  </span>
                  <span className="badge badge-ghost badge-sm">
                    {searchResults.length} match{searchResults.length !== 1 ? "es" : ""}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-base-200">
                {searchResults.map(({ key, entry, category }) =>
                  renderEntry(key, entry, category)
                )}
                {searchResults.length === 0 && (
                  <div className="px-4 py-8 text-center text-base-content/40 text-sm">
                    No matching config keys found
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Category view */
            sortedCategories.map(([catName, catData]) =>
              activeCategory === catName ? renderCategoryContent(catName, catData) : null
            )
          )}
        </div>
      </div>

      {/* ── Unsaved changes warning ──────────────────────────────────────── */}
      {hasDirty && (
        <div className="alert alert-warning sticky bottom-4 shadow-lg">
          <AlertTriangle className="w-5 h-5" />
          <span>
            You have {dirtyKeys.size} unsaved edit{dirtyKeys.size !== 1 ? "s" : ""}.
            Save or cancel to discard.
          </span>
          <button className="btn btn-sm btn-ghost" onClick={cancelEdit}>
            Discard All
          </button>
        </div>
      )}
    </div>
  );
}
