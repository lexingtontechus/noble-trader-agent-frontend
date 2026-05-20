"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { UserButton } from "@clerk/nextjs";
import { useRole } from "@/hooks/useRole";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";

// Lazy-load NotificationCenter — not needed on initial render
const NotificationCenter = dynamic(
  () => import("@/components/renko/NotificationCenter"),
  { ssr: false }
);

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊", shortLabel: "Home" },
  { key: "orders", label: "Orders", icon: "📋", shortLabel: "Orders" },
  { key: "trade", label: "Trade", icon: "⚡", shortLabel: "Trade" },
  { key: "renko", label: "Renko", icon: "🧱", shortLabel: "Renko" },
  { key: "simulate", label: "Simulate", icon: "🎲", shortLabel: "Sim" },
  { key: "portfolio", label: "Portfolio", icon: "📈", shortLabel: "Port" },
  { key: "search", label: "Search", icon: "🔍", shortLabel: "Search" },
  { key: "ops", label: "Ops", icon: "🛡️", shortLabel: "Ops" },
  // Admin is role-gated — only shown for admin users via useRole()
  // Also accessible via UserButton custom menu item
  { key: "admin", label: "Admin", icon: "⚙️", shortLabel: "Admin", minRole: "admin" },
];

export default function Navbar({ activeView, setActiveView }) {
  const { isAdmin, isTrader, isLoaded: roleLoaded } = useRole();
  const [backendHealthy, setBackendHealthy] = useState(null);
  const [tradingMode, setTradingMode] = useState("paper");

  // Role hierarchy for nav filtering
  const ROLE_LEVEL = { viewer: 0, trader: 1, admin: 2 };
  const userLevel = isAdmin ? 2 : isTrader ? 1 : 0;

  // Filter nav items based on role
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.minRole) return userLevel >= (ROLE_LEVEL[item.minRole] ?? 0);
    return true;
  });

  // Navigate to Ops when clicking mode badge
  const handleModeClick = useCallback(() => {
    setActiveView("ops");
  }, [setActiveView]);

  useEffect(() => {
    let cancelled = false;
    let interval = null;

    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error("unhealthy");
        const data = await res.json();
        if (!cancelled) {
          setBackendHealthy(data?.status === "ok" || data?.healthy === true);
          // Also extract trading mode from health response
          if (data?.operational?.trading_mode) {
            setTradingMode(data.operational.trading_mode);
          }
        }
      } catch {
        if (!cancelled) setBackendHealthy(false);
      }
    }

    function startInterval() {
      stopInterval();
      interval = setInterval(checkHealth, 30000);
    }

    function stopInterval() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    // Initial check + start interval
    checkHealth();
    startInterval();

    const handleVisibility = () => {
      if (document.hidden) {
        // Stop health check interval when tab is hidden
        stopInterval();
      } else {
        // Immediate check + restart interval when tab becomes visible
        checkHealth();
        startInterval();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Desktop tabs use filtered nav items (role-gated)
  const allDesktopItems = visibleNavItems;

  return (
    <>
      {/* Desktop + Mobile Top Navbar */}
      <div className="navbar bg-base-100 border-b border-base-300 sticky top-0 z-50">
        {/* Logo */}
        <div className="navbar-start">
          <div className="flex items-center gap-2">
            <div className="badge badge-lg bg-primary text-primary-content font-bold text-lg p-3">
              N
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-primary leading-tight">
                Noble Trader
              </span>
              <span className="text-xs text-base-content/40">REGIME RISK</span>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs — hidden on mobile */}
        <div className="navbar-center hidden sm:flex">
          <div role="tablist" className="tabs tabs-bordered">
            {allDesktopItems.map((item) =>
              item.external ? (
                <a
                  key={item.key}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`tab ${activeView === item.key ? "tab-active" : ""}`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.key}
                  role="tab"
                  className={`tab ${activeView === item.key ? "tab-active" : ""}`}
                  onClick={() => setActiveView(item.key)}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Right side: Notifications, Theme, Health, Mode, User */}
        <div className="navbar-end gap-2">
          <NotificationCenter />
          <ThemeSwitcher />

          {/* Trading mode indicator — clickable to navigate to Ops */}
          <button
            className="hidden sm:flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleModeClick}
            title="Go to Operational Controls"
          >
            {tradingMode === "live" ? (
              <span className="badge badge-error badge-sm animate-pulse gap-1">
                LIVE <span className="text-[10px]">&rarr;</span>
              </span>
            ) : tradingMode === "simulation" ? (
              <span className="badge badge-ghost badge-sm gap-1">
                SIM <span className="text-[10px]">&rarr;</span>
              </span>
            ) : (
              <span className="badge badge-success badge-sm gap-1">
                PAPER <span className="text-[10px]">&rarr;</span>
              </span>
            )}
          </button>

          {/* Backend health indicator */}
          <div className="hidden sm:flex items-center gap-1">
            <span
              className={`badge badge-sm ${
                backendHealthy === null
                  ? "badge-ghost"
                  : backendHealthy
                    ? "badge-success"
                    : "badge-error"
              }`}
            >
              {backendHealthy === null
                ? "..."
                : backendHealthy
                  ? "Online"
                  : "Offline"}
            </span>
          </div>
          <div className="flex sm:hidden items-center">
            <span
              className={`badge badge-sm ${
                backendHealthy === null
                  ? "badge-ghost"
                  : backendHealthy
                    ? "badge-success"
                    : "badge-error"
              }`}
            >
              {backendHealthy === null ? "●" : backendHealthy ? "●" : "●"}
            </span>
          </div>

          {/* Clerk UserButton with Admin custom menu items */}
          <UserButton afterSignOutUrl="/">
            {isAdmin && (
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Admin Panel"
                  labelIcon={<span style={{ fontSize: 14 }}>⚙️</span>}
                  onClick={() => setActiveView("admin")}
                />
                <UserButton.Action
                  label="Ops Controls"
                  labelIcon={<span style={{ fontSize: 14 }}>🛡️</span>}
                  onClick={() => setActiveView("ops")}
                />
              </UserButton.MenuItems>
            )}
          </UserButton>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar — hidden on desktop */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-base-100 border-t border-base-300 sm:hidden"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch justify-around" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {visibleNavItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`flex flex-col items-center justify-center py-2 px-1 min-h-[56px] min-w-[48px] transition-colors ${
                activeView === item.key
                  ? "text-primary"
                  : "text-base-content/50 hover:text-base-content/80"
              }`}
              aria-label={item.label}
              aria-current={activeView === item.key ? "page" : undefined}
            >
              <span className="text-lg leading-none" role="img" aria-hidden="true">
                {item.icon}
              </span>
              <span className="text-[10px] mt-1 font-medium leading-none">
                {item.shortLabel}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
