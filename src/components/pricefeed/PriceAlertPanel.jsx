"use client";

/**
 * PriceAlertPanel — Sidebar panel for managing price alerts.
 *
 * Shows list of active + triggered alerts with toggle/delete/rearm actions.
 * Integrates with usePriceAlerts hook for real-time checking.
 */

import { useState } from "react";
import usePriceAlerts from "@/hooks/usePriceAlerts";
import PriceAlertDialog from "./PriceAlertDialog";

const DIRECTION_ICONS = {
  above: "▲",
  below: "▼",
  crosses: "⇅",
};

const DIRECTION_LABELS = {
  above: "Above",
  below: "Below",
  crosses: "Crosses",
};

const SEVERITY_BADGES = {
  info: "badge-info",
  warning: "badge-warning",
  error: "badge-error",
};

export default function PriceAlertPanel({ onSymbolSelect, currentPrices = {} }) {
  const {
    alerts,
    activeAlerts,
    triggeredAlerts,
    loading,
    createAlert,
    deleteAlert,
    toggleAlert,
    rearmAlert,
  } = usePriceAlerts();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createSymbol, setCreateSymbol] = useState("");
  const [showTriggered, setShowTriggered] = useState(false);

  function handleCreateFromSymbol(symbol) {
    setCreateSymbol(symbol);
    setShowCreateDialog(true);
  }

  async function handleCreate(alertData) {
    return createAlert(alertData);
  }

  const displayedAlerts = showTriggered ? triggeredAlerts : activeAlerts;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-base-300">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
              <path d="M10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-xs font-medium text-base-content/60 uppercase tracking-wider">Alerts</span>
            {activeAlerts.length > 0 && (
              <span className="badge badge-primary badge-xs">{activeAlerts.length}</span>
            )}
          </div>
          <button
            className="btn btn-primary btn-xs min-h-[32px] sm:min-h-0"
            onClick={() => {
              setCreateSymbol("");
              setShowCreateDialog(true);
            }}
          >
            + Set
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-base-300">
          <button
            className={`flex-1 text-xs py-2 font-medium transition-colors ${!showTriggered ? "text-primary border-b-2 border-primary" : "text-base-content/50"}`}
            onClick={() => setShowTriggered(false)}
          >
            Active ({activeAlerts.length})
          </button>
          <button
            className={`flex-1 text-xs py-2 font-medium transition-colors ${showTriggered ? "text-warning border-b-2 border-warning" : "text-base-content/50"}`}
            onClick={() => setShowTriggered(true)}
          >
            Triggered ({triggeredAlerts.length})
          </button>
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="loading loading-spinner loading-sm text-primary"></span>
            </div>
          ) : displayedAlerts.length === 0 ? (
            <div className="text-center py-8 text-base-content/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 opacity-30" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
              </svg>
              <p className="text-xs">
                {showTriggered ? "No triggered alerts yet" : "No active alerts"}
              </p>
              {!showTriggered && (
                <button
                  className="btn btn-primary btn-xs mt-3 min-h-[32px]"
                  onClick={() => setShowCreateDialog(true)}
                >
                  Set Your First Alert
                </button>
              )}
            </div>
          ) : (
            displayedAlerts.map(alert => {
              const currentPrice = currentPrices[alert.symbol]?.price;
              const targetPrice = alert.targetPrice || alert.target_price;
              const direction = alert.direction || "above";
              const severity = alert.severity || "info";
              const cooldownMin = alert.cooldownMinutes || alert.cooldown_minutes || 15;
              const pctFromTarget = currentPrice
                ? ((currentPrice - targetPrice) / targetPrice * 100).toFixed(1)
                : null;

              return (
                <div
                  key={alert.id}
                  className={`bg-base-300/40 rounded-lg p-2.5 ${alert.triggered ? "border border-warning/30" : "border border-transparent"}`}
                >
                  {/* Top row: Symbol + Direction + Target */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm">{alert.symbol}</span>
                      <span className={`text-[10px] ${direction === "above" ? "text-success" : direction === "below" ? "text-error" : "text-primary"}`}>
                        {DIRECTION_ICONS[direction]}
                      </span>
                      <span className="font-mono text-xs font-medium">${targetPrice.toFixed(2)}</span>
                    </div>
                    <span className={`badge badge-xs ${SEVERITY_BADGES[severity]}`}>{severity}</span>
                  </div>

                  {/* Progress indicator */}
                  {currentPrice && !alert.triggered && (
                    <div className="mb-1.5">
                      <div className="flex items-center justify-between text-[10px] text-base-content/40 mb-0.5">
                        <span>Now: ${currentPrice.toFixed(2)}</span>
                        <span className={parseFloat(pctFromTarget) > 0 ? "text-success" : "text-error"}>
                          {pctFromTarget}%
                        </span>
                      </div>
                      <div className="h-1 bg-base-300 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            direction === "above"
                              ? (currentPrice >= targetPrice ? "bg-success" : "bg-primary/60")
                              : (currentPrice <= targetPrice ? "bg-success" : "bg-primary/60")
                          }`}
                          style={{
                            width: `${Math.min(100, direction === "above"
                              ? Math.max(0, (currentPrice / targetPrice) * 100)
                              : Math.max(0, (targetPrice > 0 ? (1 - (currentPrice - targetPrice) / targetPrice) : 0) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Triggered info */}
                  {alert.triggered && (
                    <div className="text-[10px] text-warning mb-1.5">
                      Triggered {alert.triggeredAt || alert.triggered_at
                        ? new Date(alert.triggeredAt || alert.triggered_at).toLocaleTimeString()
                        : "recently"}
                      {" "}(x{alert.triggerCount || alert.trigger_count || 1})
                    </div>
                  )}

                  {/* Label + Cooldown */}
                  <div className="flex items-center justify-between text-[10px] text-base-content/40">
                    <span>
                      {alert.label || DIRECTION_LABELS[direction]}
                      {" · "}{cooldownMin}m cooldown
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {alert.triggered ? (
                      <button
                        className="btn btn-xs btn-ghost text-warning min-h-[32px]"
                        onClick={() => rearmAlert(alert.id)}
                        title="Re-arm alert"
                      >
                        ↻ Re-arm
                      </button>
                    ) : (
                      <button
                        className={`btn btn-xs btn-ghost min-h-[32px] ${alert.enabled ? "text-success" : "text-base-content/30"}`}
                        onClick={() => toggleAlert(alert.id, !alert.enabled)}
                        title={alert.enabled ? "Disable" : "Enable"}
                      >
                        {alert.enabled ? "● On" : "○ Off"}
                      </button>
                    )}
                    {onSymbolSelect && (
                      <button
                        className="btn btn-xs btn-ghost min-h-[32px]"
                        onClick={() => onSymbolSelect(alert.symbol)}
                        title="View chart"
                      >
                        Chart
                      </button>
                    )}
                    <button
                      className="btn btn-xs btn-ghost text-error min-h-[32px] ml-auto"
                      onClick={() => deleteAlert(alert.id)}
                      title="Delete alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-base-300 text-[10px] text-base-content/30 text-center">
          {activeAlerts.length} active · {triggeredAlerts.length} triggered · Checks on every tick
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <PriceAlertDialog
          symbol={createSymbol}
          currentPrice={createSymbol ? currentPrices[createSymbol]?.price : null}
          onClose={() => {
            setShowCreateDialog(false);
            setCreateSymbol("");
          }}
          onCreate={handleCreate}
        />
      )}
    </>
  );
}
