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
} from "lucide-react";

/**
 * Admin Config Panel — runtime configuration management.
 *
 * Features:
 *   - Fetches all config entries grouped by category
 *   - Inline editing with type-aware input controls
 *   - Validation feedback (min/max/allowed values)
 *   - Reset to default per key
 *   - Force reload from DB
 *   - Audit log viewer
 *   - Search/filter across all keys
 */
export default function ConfigPanel() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // Fetch all config
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/config/");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Fetch failed" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setConfig(data);
      // Expand first category by default
      if (data?.categories) {
        const cats = Object.keys(data.categories);
        if (cats.length > 0 && expandedCats.size === 0) {
          setExpandedCats(new Set([cats[0]]));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [expandedCats.size]);

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle category expansion
  const toggleCat = (cat) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Start editing a config value
  const startEdit = (key, entry) => {
    setEditingKey(key);
    // Format value for the input
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

  // Cancel editing
  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setEditReason("");
    setSaveResult(null);
  };

  // Save edited value
  const saveEdit = async (key) => {
    setSaving(true);
    setSaveResult(null);
    try {
      let parsedValue = editValue;
      const entry = findEntry(key);
      if (!entry) throw new Error("Entry not found");

      // Type coercion
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

      const res = await fetch(`/api/config/key/${encodeURIComponent(key)}`, {
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
      // Refresh config to pick up the change
      await fetchConfig();
    } catch (err) {
      setSaveResult({ key, success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Reset a key to default
  const resetKey = async (key) => {
    if (!confirm(`Reset "${key}" to its default value?`)) return;
    try {
      const res = await fetch(
        `/api/config/key/${encodeURIComponent(key)}/reset`,
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

  // Force reload from DB
  const forceReload = async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/config/reload", { method: "GET" });
      if (!res.ok) throw new Error("Reload failed");
      await fetchConfig();
    } catch (err) {
      alert(`Reload failed: ${err.message}`);
    } finally {
      setReloading(false);
    }
  };

  // Fetch audit log
  const fetchAudit = async () => {
    if (showAudit) {
      setShowAudit(false);
      return;
    }
    try {
      const res = await fetch("/api/config/audit?limit=30");
      if (!res.ok) throw new Error("Failed to fetch audit log");
      const data = await res.json();
      setAuditLog(data);
      setShowAudit(true);
    } catch (err) {
      alert(`Audit fetch failed: ${err.message}`);
    }
  };

  // Helper: find entry by key across all categories
  const findEntry = (key) => {
    if (!config?.categories) return null;
    for (const cat of Object.values(config.categories)) {
      if (cat.entries[key]) return cat.entries[key];
    }
    return null;
  };

  // Filter entries by search query
  const matchesSearch = (key, entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      entry.description?.toLowerCase().includes(q) ||
      String(entry.value).toLowerCase().includes(q)
    );
  };

  // Render type-aware input for editing
  const renderEditInput = (entry) => {
    if (entry.value_type === "bool") {
      return (
        <div className="flex gap-2">
          <button
            className={`btn btn-sm ${editValue === "true" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setEditValue("true")}
          >
            True
          </button>
          <button
            className={`btn btn-sm ${editValue === "false" ? "btn-error" : "btn-ghost"}`}
            onClick={() => setEditValue("false")}
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
          onChange={(e) => setEditValue(e.target.value)}
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
          onChange={(e) => setEditValue(e.target.value)}
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
        onChange={(e) => setEditValue(e.target.value)}
      />
    );
  };

  // ── Loading / Error states ──────────────────────────────────────

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

  const categoryOrder = [
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
  const sortedCategories = Object.entries(config.categories).sort(([a], [b]) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Runtime Configuration
        </h2>
        <span className="badge badge-ghost">
          {config.total_entries} params
        </span>
        <div className="flex-1" />
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

      {/* Search bar */}
      <div className="form-control">
        <div className="input-group">
          <Search className="w-5 h-5 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search keys, descriptions, values..."
            className="input input-bordered w-full pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Audit log panel */}
      {showAudit && auditLog.length > 0 && (
        <div className="card bg-base-200 shadow">
          <div className="card-body p-4">
            <h3 className="text-sm font-bold mb-2">Recent Config Changes</h3>
            <div className="overflow-x-auto">
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

      {/* Categories */}
      {sortedCategories.map(([catName, catData]) => {
        const isExpanded = expandedCats.has(catName);
        const filteredEntries = Object.entries(catData.entries).filter(
          ([key, entry]) => matchesSearch(key, entry)
        );
        if (searchQuery && filteredEntries.length === 0) return null;

        return (
          <div key={catName} className="card bg-base-100 shadow">
            <div
              className="card-body p-0 cursor-pointer"
              onClick={() => toggleCat(catName)}
            >
              {/* Category header */}
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-bold capitalize">{catName}</span>
                <span className="badge badge-ghost badge-sm">
                  {catData.count}
                </span>
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

                      return (
                        <div
                          key={key}
                          className={`px-4 py-3 ${isEditing ? "bg-primary/5" : ""}`}
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
                                {isModified && (
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
                                      className={`text-xs ${saveMsg.success ? "text-success" : "text-error"}`}
                                    >
                                      {saveMsg.message}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <span
                                    className="font-mono text-sm cursor-pointer hover:bg-base-200 px-2 py-1 rounded"
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
    </div>
  );
}
