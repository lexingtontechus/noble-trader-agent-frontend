"use client";

/**
 * NotificationCenter — In-app notification center with bell icon dropdown.
 *
 * Features:
 *   - Bell icon button with unread count badge
 *   - Dropdown panel showing recent alerts
 *   - Color-coded severity badges
 *   - Auto-refresh every 30s
 *   - Mark all read / Clear all buttons
 *
 * Alert type icons:
 *   SIGNAL: 📊  TRADE: 💰  RISK: ⚠️  REGIME: 🔄  SYSTEM: 🔧
 *
 * Designed for lazy-loading via next/dynamic.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── Constants ───────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  SIGNAL: "📊",
  TRADE: "💰",
  RISK: "⚠️",
  REGIME: "🔄",
  SYSTEM: "🔧",
};

const SEVERITY_COLORS = {
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

const SEVERITY_BORDER = {
  success: "border-l-success",
  warning: "border-l-warning",
  error: "border-l-error",
  info: "border-l-info",
};

// ── Time formatting ─────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Alert Row ───────────────────────────────────────────────────────────────

function AlertRow({ alert, onDismiss }) {
  const icon = TYPE_ICONS[alert.type] || "🔔";
  const severityBadge = SEVERITY_COLORS[alert.severity] || "badge-ghost";
  const borderClass = SEVERITY_BORDER[alert.severity] || "border-l-base-300";

  return (
    <div
      className={`flex items-start gap-2 bg-base-200/50 hover:bg-base-300/50 rounded-lg px-3 py-2 text-xs border-l-2 ${borderClass} transition-colors`}
    >
      <span className="text-base leading-none mt-0.5 shrink-0" role="img" aria-hidden="true">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {alert.symbol && (
            <span className="font-mono font-bold text-primary">{alert.symbol}</span>
          )}
          <span className={`badge badge-xs ${severityBadge}`}>
            {alert.severity}
          </span>
          <span className="badge badge-xs badge-ghost">{alert.type}</span>
        </div>
        <div className="text-base-content/80 leading-relaxed break-words">
          {alert.message}
        </div>
      </div>
      <span className="text-base-content/40 whitespace-nowrap shrink-0 mt-0.5">
        {timeAgo(alert.createdAt)}
      </span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState(new Set());
  const dropdownRef = useRef(null);
  const intervalRef = useRef(null);

  // Fetch alerts from API
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?limit=50");
      if (res.ok) {
        const data = await res.json();
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      }
    } catch (err) {
      console.warn("[NotificationCenter] Fetch failed:", err.message);
    }
  }, []);

  // Initial fetch + auto-refresh every 30s
  useEffect(() => {
    fetchAlerts();

    intervalRef.current = setInterval(fetchAlerts, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAlerts]);

  // Pause auto-refresh when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        fetchAlerts();
        intervalRef.current = setInterval(fetchAlerts, 30000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchAlerts]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Mark all as read
  const handleMarkAllRead = () => {
    const newReadIds = new Set(readIds);
    for (const alert of alerts) {
      newReadIds.add(alert.id);
    }
    setReadIds(newReadIds);
  };

  // Clear all (client-side only — just empties the view)
  const handleClearAll = () => {
    setAlerts([]);
    setReadIds(new Set());
  };

  // Compute unread count
  const unreadCount = alerts.filter((a) => !readIds.has(a.id)).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm btn-circle relative"
        onClick={() => {
          setOpen(!open);
          // Mark as read when opening
          if (!open) handleMarkAllRead();
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 badge badge-error badge-sm text-[10px] font-bold min-w-[18px] h-[18px] p-0 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-base-100 border border-base-300 rounded-xl shadow-2xl z-[100] overflow-hidden"
          role="menu"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-200/50">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <span role="img" aria-hidden="true">🔔</span>
              Notifications
              {unreadCount > 0 && (
                <span className="badge badge-error badge-sm">{unreadCount}</span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {alerts.length > 0 && (
                <>
                  <button
                    className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost"
                    onClick={handleMarkAllRead}
                    aria-label="Mark all as read"
                  >
                    ✓ Read
                  </button>
                  <button
                    className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost text-error"
                    onClick={handleClearAll}
                    aria-label="Clear all notifications"
                  >
                    ✕ Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Alert list */}
          <div className="max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {loading && alerts.length === 0 ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <span className="loading loading-spinner loading-sm text-primary" />
                <span className="text-sm text-base-content/50">Loading alerts...</span>
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🔕</div>
                <p className="text-sm text-base-content/60 mb-1">No alerts yet</p>
                <p className="text-xs text-base-content/40">
                  Notifications will appear here when signals, trades, or risk events occur
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    read={readIds.has(alert.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div className="px-4 py-2 border-t border-base-300 bg-base-200/30 text-center">
              <span className="text-[10px] text-base-content/40">
                Auto-refreshes every 30s · {alerts.length} total
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
