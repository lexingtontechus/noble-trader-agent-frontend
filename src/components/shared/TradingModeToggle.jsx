"use client";

import { useState, useEffect } from "react";
import { usePlan } from "@/hooks/usePlan";
import PlanGate from "@/components/shared/PlanGate";

/**
 * TradingModeToggle — Paper/Live toggle for the navbar.
 *
 * - Shows current mode (PAPER/LIVE)
 * - Clicking toggles between modes
 * - Live mode requires Premium+ plan (gated via PlanGate)
 * - Persists preference in localStorage
 * - Dispatches `noble:trading-mode` event when changed
 */
export default function TradingModeToggle() {
  const { canUseLive, isLoaded } = usePlan();
  const [mode, setMode] = useState("paper");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem("noble-trading-mode");
    if (saved === "live" && canUseLive) {
      setMode("live");
    }
  }, [canUseLive]);

  // Dispatch mode change event
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("noble:trading-mode", { detail: { mode } })
    );
  }, [mode]);

  const handleToggle = () => {
    if (mode === "paper") {
      if (!canUseLive) {
        setShowUpgradeModal(true);
        return;
      }
      setMode("live");
      localStorage.setItem("noble-trading-mode", "live");
    } else {
      setMode("paper");
      localStorage.setItem("noble-trading-mode", "paper");
    }
  };

  if (!isLoaded) {
    return (
      <div className="badge badge-ghost badge-sm gap-1">
        ...
      </div>
    );
  }

  return (
    <>
      <button
        className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleToggle}
        title={mode === "paper" ? "Switch to Live Trading" : "Switch to Paper Trading"}
      >
        {mode === "live" ? (
          <span className="badge badge-error badge-sm animate-pulse gap-1">
            LIVE
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        ) : (
          <span className="badge badge-success badge-sm gap-1">
            PAPER
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        )}
      </button>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Live Trading Requires Premium</h3>
            <p className="py-4 text-sm text-base-content/70">
              Live trading with real capital is available on the Premium plan.
              Upgrade to connect a live Alpaca account and execute trades with
              real money, access real-time P&L dashboards, and get priority
              order execution.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowUpgradeModal(false)}
              >
                Maybe Later
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setShowUpgradeModal(false);
                  window.dispatchEvent(
                    new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "plan" } })
                  );
                }}
              >
                Upgrade Plan
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowUpgradeModal(false)}>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
