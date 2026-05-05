"use client";

import { useState } from "react";
import { useStream } from "@/context/StreamContext";

/**
 * AlertHistory — Phase 3
 * Displays a scrolling list of recent regime-change alerts with severity badges.
 *
 * Features:
 * - Severity filter (All / Critical / Warning / Info)
 * - Time-ago formatting
 * - Color-coded border-left indicators
 * - Clear all button
 * - Empty state with helpful message
 */

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warning" },
  { key: "info", label: "Info" },
];

function getSeverityBadge(severity) {
  switch (severity) {
    case "critical":
      return "badge-error";
    case "warning":
      return "badge-warning";
    case "info":
    default:
      return "badge-info";
  }
}

function getSeverityIcon(severity) {
  switch (severity) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "info":
    default:
      return "🔵";
  }
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(
    typeof timestamp === "number" ? timestamp * 1000 : timestamp,
  );
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeAgo(receivedAt) {
  const diff = Date.now() - receivedAt;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function AlertHistory() {
  const { alerts, clearAlerts } = useStream();
  const [severityFilter, setSeverityFilter] = useState("all");

  // Filter alerts
  const filteredAlerts =
    severityFilter === "all"
      ? alerts
      : alerts.filter((a) => a.severity === severityFilter);

  // Severity counts for badge display
  const severityCounts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  if (alerts.length === 0) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body p-4">
          <h3 className="card-title text-base flex items-center gap-2">
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Regime Alerts
          </h3>
          <p className="text-sm text-base-content/50">
            No regime change alerts yet. Alerts appear when a symbol transitions
            to a new regime state during live streaming.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        {/* Header with filter + clear */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-base flex items-center gap-2">
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Regime Alerts
            <span className="badge badge-sm badge-error">{alerts.length}</span>
          </h3>
          <button className="btn btn-xs btn-ghost" onClick={clearAlerts}>
            Clear All
          </button>
        </div>

        {/* Severity filter tabs */}
        <div className="flex gap-1 mb-3">
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`btn btn-xs ${
                severityFilter === f.key
                  ? "btn-active btn-primary"
                  : "btn-ghost"
              }`}
              onClick={() => setSeverityFilter(f.key)}
            >
              {f.label}
              {f.key !== "all" && severityCounts[f.key] > 0 && (
                <span
                  className={`badge badge-xs ml-1 ${getSeverityBadge(f.key)}`}
                >
                  {severityCounts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Alert list */}
        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {filteredAlerts.length === 0 ? (
            <p className="text-sm text-base-content/40 text-center py-4">
              No {severityFilter} alerts found.
            </p>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border-l-4 ${
                  alert.severity === "critical"
                    ? "bg-error/10 border-error"
                    : alert.severity === "warning"
                      ? "bg-warning/10 border-warning"
                      : "bg-info/10 border-info"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {getSeverityIcon(alert.severity)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">
                          {alert.symbol}
                        </span>
                        <span
                          className={`badge badge-xs ${getSeverityBadge(alert.severity)}`}
                        >
                          {alert.severity || "info"}
                        </span>
                      </div>
                      <div className="text-xs text-base-content/70 mt-0.5">
                        <span className="font-mono">
                          {alert.previous || "?"}
                        </span>
                        <span className="mx-1">→</span>
                        <span className="font-mono font-bold">
                          {alert.current || "?"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-base-content/40">
                      {formatTime(alert.ts)}
                    </div>
                    <div className="text-[10px] text-base-content/30">
                      {alert.receivedAt ? formatTimeAgo(alert.receivedAt) : ""}
                    </div>
                  </div>
                </div>
                {alert.message && (
                  <p className="text-xs text-base-content/50 mt-1 leading-relaxed">
                    {alert.message}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
