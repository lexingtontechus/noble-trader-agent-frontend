"use client";
import { useStream } from "@/context/StreamContext";

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const SEVERITY_MAP = {
  critical: "badge-error",
  warning: "badge-warning",
  info: "badge-info",
};

export default function AlertHistory() {
  const { alerts, clearAlerts } = useStream();

  return (
    <div className="card bg-base-200 shadow-xl h-full">
      <div className="card-body p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-sm">
            🔔 Regime Alerts
            {alerts.length > 0 && (
              <span className="badge badge-error badge-sm ml-2">
                {alerts.length}
              </span>
            )}
          </h3>
          {alerts.length > 0 && (
            <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={clearAlerts}>
              Clear
            </button>
          )}
        </div>

        {/* Empty state */}
        {alerts.length === 0 && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-sm text-base-content/60 mb-2">
              No regime alerts
            </p>
            <p className="text-xs text-base-content/40">
              Alerts will appear here when regime changes are detected in live
              streams
            </p>
          </div>
        )}

        {/* Alert list */}
        {alerts.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-2 bg-base-300 rounded-lg px-3 py-2 text-xs"
              >
                <span
                  className={`badge badge-xs ${SEVERITY_MAP[alert.severity] || "badge-ghost"}`}
                >
                  {alert.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-semibold">{alert.symbol}</div>
                  <div className="text-base-content/70 truncate">
                    {alert.message}
                  </div>
                </div>
                <span className="text-base-content/40 whitespace-nowrap">
                  {timeAgo(alert.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
