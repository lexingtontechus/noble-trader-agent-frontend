"use client";

import { useState, useEffect, useCallback } from "react";
import { usePlan } from "@/hooks/usePlan";

/**
 * TradingModeToggle — Paper/Live toggle for the navbar.
 *
 * - Reads current mode from backend /operational/mode (source of truth)
 * - Falls back to localStorage if backend unavailable
 * - Clicking navigates to Ops page for full mode management
 * - Live mode pulses red as a visual warning
 * - Dispatches `noble:trading-mode` event when mode changes
 */
export default function TradingModeToggle() {
  const { canUseLive, isLoaded } = usePlan();
  const [mode, setMode] = useState("paper");
  const [backendMode, setBackendMode] = useState(null);

  // Fetch real mode from backend
  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch("/api/operational/mode");
      if (res.ok) {
        const data = await res.json();
        if (data.current_mode) {
          setBackendMode(data.current_mode);
          setMode(data.current_mode);
        }
      }
    } catch {
      // Backend unavailable — use localStorage fallback
    }
  }, []);

  useEffect(() => {
    fetchMode();
    const interval = setInterval(fetchMode, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchMode]);

  // Load saved preference as fallback
  useEffect(() => {
    if (!backendMode) {
      const saved = localStorage.getItem("noble-trading-mode");
      if (saved) setMode(saved);
    }
  }, [backendMode]);

  // Dispatch mode change event
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("noble:trading-mode", { detail: { mode } })
    );
  }, [mode]);

  // Click navigates to Ops page for full mode management
  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("noble:navigate", { detail: { view: "ops" } })
    );
  };

  if (!isLoaded) {
    return (
      <div className="badge badge-ghost badge-sm gap-1">
        ...
      </div>
    );
  }

  const isLive = mode === "live";

  return (
    <button
      className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleClick}
      title={isLive ? "LIVE TRADING — Click to manage" : "Paper Trading — Click to manage"}
    >
      {isLive ? (
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
  );
}
