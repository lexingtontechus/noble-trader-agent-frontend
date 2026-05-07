"use client";

import { useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";
import { useStream } from "@/context/StreamContext";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "orders", label: "Orders", icon: "📋" },
  { key: "simulate", label: "Simulate", icon: "🎲" },
  { key: "portfolio", label: "Portfolio", icon: "📊" },
  { key: "search", label: "Search", icon: "🔍" },
  { key: "admin", label: "Admin", icon: "🔐" },
  {
    key: "docs",
    label: "Docs",
    icon: "📖",
    external: true,
    href: "/docs.html",
  },
];

const THEMES = [
  "noble",
  "dark",
  "light",
  "cupcake",
  "business",
  "synthwave",
  "nord",
];

export default function Navbar({ activeView, setActiveView }) {
  const [backendHealthy, setBackendHealthy] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      // Skip health check when tab is hidden to reduce unnecessary API calls
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error("unhealthy");
        const data = await res.json();
        if (!cancelled)
          setBackendHealthy(data?.status === "ok" || data?.healthy === true);
      } catch {
        if (!cancelled) setBackendHealthy(false);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    // Re-check when tab becomes visible
    const handleVisibility = () => {
      if (!document.hidden) checkHealth();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
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

      {/* Navigation Tabs - center on desktop, hidden on mobile */}
      <div className="navbar-center hidden sm:flex">
        <div role="tablist" className="tabs tabs-bordered">
          {NAV_ITEMS.map((item) =>
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

      {/* Mobile nav tabs - icons only */}
      <div className="navbar-center flex sm:hidden">
        <div role="tablist" className="tabs tabs-bordered">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`tab tab-sm ${activeView === item.key ? "tab-active" : ""}`}
                aria-label={item.label}
              >
                {item.icon}
              </a>
            ) : (
              <button
                key={item.key}
                role="tab"
                className={`tab tab-sm ${activeView === item.key ? "tab-active" : ""}`}
                onClick={() => setActiveView(item.key)}
                aria-label={item.label}
              >
                {item.icon}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Right side: Theme, Health, User */}
      <div className="navbar-end gap-2">
        <ThemeSwitcher />

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

        {/* Clerk UserButton */}
        <UserButton afterSignOutUrl="/">
          <UserButton.MenuItems>
            <UserButton.Link
              label="Docs"
              labelIcon="📖"
              href="/public/docs.html"
              target="_blank"
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </div>
  );
}
