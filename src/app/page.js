"use client";

import { Show, SignIn } from "@clerk/nextjs";
import { useState, useEffect, useCallback } from "react";
import { useRole } from "@/hooks/useRole";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Dashboard from "@/components/dashboard/Dashboard";
import OrdersPage from "@/components/orders/OrdersPage";
import TradingWorkflow from "@/components/trading/TradingWorkflow";
import SearchPage from "@/components/search/SearchPage";
import SimulatePage from "@/components/simulation/SimulatePage";
import PortfolioPage from "@/components/portfolio/PortfolioPage";
import AdminPage from "@/components/admin/AdminPage";
import RenkoPage from "@/components/renko/RenkoPage";
import OperationalPage from "@/components/operational/OperationalPage";
import SettingsPage from "@/components/settings/SettingsPage";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { StreamProvider } from "@/context/StreamContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import NotificationToast from "@/components/shared/NotificationToast";
import RoleGate from "@/components/shared/RoleGate";

export default function Home() {
  const { isAdmin, isTrader, isLoaded: roleLoaded, canAccess } = useRole();
  const [activeView, setActiveView] = useState("dashboard");
  const [settingsTab, setSettingsTab] = useState("profile");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Check onboarding status on mount
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const data = await res.json();
          if (!data.onboardingComplete) {
            setShowOnboarding(true);
          }
        }
      } catch {
        // If API fails, skip onboarding check (don't block the user)
      }
      setOnboardingChecked(true);
    }
    checkOnboarding();
  }, []);

  // Listen for navigation events (from PlanGate, Navbar, etc.)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.view === "settings") {
        setSettingsTab(e.detail.tab || "profile");
        setActiveView("settings");
      } else if (e.detail?.view) {
        setActiveView(e.detail.view);
      }
    };
    window.addEventListener("noble:navigate", handler);
    return () => window.removeEventListener("noble:navigate", handler);
  }, []);

  // Guard: redirect users away from views they can't access
  useEffect(() => {
    if (!roleLoaded) return;
    if (activeView === "admin" && !isAdmin) setActiveView("dashboard");
    if (activeView === "trade" && !isTrader) setActiveView("dashboard");
    if (activeView === "ops" && !isAdmin) setActiveView("dashboard");
  }, [activeView, isAdmin, isTrader, roleLoaded]);

  // Safe view setter that enforces role gating
  const setSafeActiveView = useCallback((view) => {
    if (view === "admin" && !isAdmin) return;
    if (view === "trade" && !isTrader) return;
    if (view === "ops" && !isAdmin) return;
    setActiveView(view);
  }, [isAdmin, isTrader]);

  // Global error handler to catch toLowerCase/toUpperCase is not a function errors
  useEffect(() => {
    const handler = (event) => {
      const msg = event.error?.message || '';
      if (msg.includes('toLowerCase') || msg.includes('toUpperCase')) {
        console.error('[CASE-CONVERSION ERROR]', event.error.message, event.error.stack);
        // Prevent the error from crashing the page
        event.preventDefault();
      }
    };
    const rejectionHandler = (event) => {
      const msg = event.reason?.message || '';
      if (msg.includes('toLowerCase') || msg.includes('toUpperCase')) {
        console.error('[CASE-CONVERSION REJECTION]', event.reason.message, event.reason.stack);
      }
    };
    window.addEventListener('error', handler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setActiveView("dashboard");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setActiveView("orders");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        setSafeActiveView("trade");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        setActiveView("simulate");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "5") {
        e.preventDefault();
        setActiveView("portfolio");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "6") {
        e.preventDefault();
        setActiveView("search");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "7") {
        e.preventDefault();
        setActiveView("renko");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "8") {
        e.preventDefault();
        setSafeActiveView("ops");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "9") {
        e.preventDefault();
        setSafeActiveView("admin");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Show
      when="signed-out"
      fallback={
        <PortfolioProvider>
          <StreamProvider>
            {showOnboarding && onboardingChecked ? (
              <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
            ) : (
              <div className="min-h-screen flex flex-col">
                <Navbar activeView={activeView} setActiveView={setSafeActiveView} />
                <main className="flex-1 container mx-auto px-4 py-6 pb-20 sm:pb-6 overflow-auto">
                  <div key={activeView} className="animate-fade-in-up">
                    {activeView === "dashboard" && <Dashboard />}
                    {activeView === "orders" && <OrdersPage />}
                    {activeView === "trade" && (
                      <RoleGate minRole="trader" showUpgrade>
                        <TradingWorkflow />
                      </RoleGate>
                    )}
                    {activeView === "search" && <SearchPage />}
                    {activeView === "simulate" && <SimulatePage />}
                    {activeView === "portfolio" && <PortfolioPage />}
                    {activeView === "renko" && <RenkoPage />}
                    {activeView === "ops" && (
                      <RoleGate minRole="admin" showUpgrade>
                        <OperationalPage />
                      </RoleGate>
                    )}
                    {activeView === "settings" && <SettingsPage initialTab={settingsTab} />}
                    {activeView === "admin" && isAdmin && <AdminPage />}
                  </div>
                </main>
                <Footer />
                <NotificationToast />
              </div>
            )}
          </StreamProvider>
        </PortfolioProvider>
      }
    >
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <h1 className="text-3xl font-bold text-primary">Noble Trader</h1>
            <p className="text-base-content/60 mt-2">
              Dynamic Regime Risk Management Platform
            </p>
            <div className="divider text-base-content/40">
              Sign In to Continue
            </div>
            <SignIn />
          </div>
        </div>
      </div>
    </Show>
  );
}
