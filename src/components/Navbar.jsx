"use client";

import { useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";
import { useStream } from "@/context/StreamContext";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "orders", label: "Orders", icon: "📋" },
  { key: "simulate", label: "Simulate", icon: "🎲" },
  { key: "portfolio", label: "Portfolio", icon: "📁" },
  { key: "search", label: "Search", icon: "🔍" },
  {
    key: "docs",
    label: "Docs",
    icon: "📖",
    href: "/docs.html",
    external: true,
  },
];

export default function Navbar({ activeView, setActiveView }) {
  const [backendHealthy, setBackendHealthy] = useState(null);
  const { activeStreamCount, anyConnected, totalTicks } = useStream();

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
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
    return () => {
      cancelled = true;
      clearInterval(interval);
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
                className="tab"
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-3 h-3 ml-1 opacity-50 inline-block"
                >
                  <path d="M6.22 8.72a.75.75 0 001.06 0l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69L6.22 7.66a.75.75 0 000 1.06z" />
                  <path d="M3.5 6.25a.75.75 0 00-.75.75v5.25c0 .414.336.75.75.75h5.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-1.5 0v1.75H4.25V7.75h1.75a.75.75 0 000-1.5H3.5z" />
                </svg>
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
                className="tab tab-sm"
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

      {/* Right side: Stream, Theme, Health, User */}
      <div className="navbar-end gap-2">
        {/* Streaming indicator */}
        {activeStreamCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="relative flex h-2.5 w-2.5">
              {anyConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
              )}
            </span>
            <span className="badge badge-xs badge-outline">
              {activeStreamCount}{" "}
              {activeStreamCount === 1 ? "stream" : "streams"}
              {totalTicks > 0 && (
                <span className="ml-1 opacity-60">· {totalTicks}t</span>
              )}
            </span>
          </div>
        )}

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
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  );
}
