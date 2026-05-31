"use client";

import { Show, SignInButton } from "@clerk/nextjs";
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
import PriceFeedPage from "@/components/pricefeed/PriceFeedPage";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { StreamProvider } from "@/context/StreamContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import NotificationToast from "@/components/shared/NotificationToast";
import RoleGate from "@/components/shared/RoleGate";
import SpeedDialTrade from "@/components/shared/SpeedDialTrade";
import KeyboardShortcutsOverlay from "@/components/shared/KeyboardShortcutsOverlay";

function FeatureCard({ icon, title, description, badge, badgeVariant = "outline" }) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow">
      <div className="card-body p-5">
        <div className="flex items-start justify-between">
          <span className="text-2xl">{icon}</span>
          <span className={`badge badge-${badgeVariant} badge-sm`}>{badge}</span>
        </div>
        <h3 className="card-title text-base mt-2">{title}</h3>
        <p className="text-sm text-base-content/60 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { isAdmin, isTrader, isLoaded: roleLoaded, canAccess } = useRole();
  const [activeView, setActiveView] = useState("dashboard");
  const [settingsTab, setSettingsTab] = useState("profile");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

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
    if (activeView === "pnl" && !isAdmin) setActiveView("dashboard");
  }, [activeView, isAdmin, isTrader, roleLoaded]);

  // Safe view setter that enforces role gating
  const setSafeActiveView = useCallback((view) => {
    if (view === "admin" && !isAdmin) return;
    if (view === "trade" && !isTrader) return;
    if (view === "pnl" && !isAdmin) return;
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

  // Keyboard shortcuts — global hotkey system
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if typing in an input/textarea (unless Escape)
      const inInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;

      // Escape always works — close overlays/modals
      if (e.key === "Escape") {
        if (showShortcuts) {
          e.preventDefault();
          setShowShortcuts(false);
          return;
        }
        // Dispatch close event for any open modal
        window.dispatchEvent(new CustomEvent("noble:escape"));
        return;
      }

      // Don't process other shortcuts when typing
      if (inInput) return;

      // ── Help overlay: `?` or `Cmd/Ctrl + /` ────────────────────────────
      if (e.key === "?" || ((e.metaKey || e.ctrlKey) && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // ── Navigation: Cmd/Ctrl + 1-0 ────────────────────────────────────
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault(); setActiveView("dashboard");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault(); setActiveView("prices");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault(); setActiveView("orders");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault(); setSafeActiveView("trade");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "5") {
        e.preventDefault(); setActiveView("renko");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "6") {
        e.preventDefault(); setActiveView("simulate");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "7") {
        e.preventDefault(); setActiveView("portfolio");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "8") {
        e.preventDefault(); setActiveView("search");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "9") {
        e.preventDefault(); setSafeActiveView("pnl");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault(); setSafeActiveView("admin");
      }
      // ── Quick Trade: T key ─────────────────────────────────────────────
      else if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("noble:quick-trade"));
      }
      // ── Quick Buy: B key ──────────────────────────────────────────────
      else if (e.key === "b" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("noble:quick-trade", { detail: { side: "buy" } }));
      }
      // ── Quick Sell: S key ──────────────────────────────────────────────
      else if (e.key === "s" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("noble:quick-trade", { detail: { side: "sell" } }));
      }
      // ── Focus Search: / key ───────────────────────────────────────────
      else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveView("search");
        // Focus the search input after navigation
        requestAnimationFrame(() => {
          const searchInput = document.querySelector('input[placeholder*="symbol"], input[placeholder*="Search"], input[placeholder*="ticker"]');
          if (searchInput) searchInput.focus();
        });
      }
      // ── Go-to shortcuts (G + key) ─────────────────────────────────────
      else if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Start a go-to sequence — listen for next key within 500ms
        const handleGoTo = (e2) => {
          window.removeEventListener("keydown", handleGoTo);
          if (e2.target.tagName === "INPUT" || e2.target.tagName === "TEXTAREA") return;
          const key = e2.key.toLowerCase();
          if (key === "s") { setSettingsTab("profile"); setActiveView("settings"); }
          else if (key === "d") setActiveView("dashboard");
          else if (key === "p") setActiveView("prices");
          else if (key === "o") setActiveView("orders");
        };
        window.addEventListener("keydown", handleGoTo);
        // Auto-cleanup if no second key pressed within 500ms
        setTimeout(() => window.removeEventListener("keydown", handleGoTo), 500);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShortcuts, setSafeActiveView, setActiveView, setSettingsTab]);

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
                <main className="flex-1 container mx-auto px-4 py-6 pb-16 sm:pb-6 overflow-auto">
                  <div key={activeView} className="animate-fade-in-up">
                    {activeView === "dashboard" && <Dashboard />}
                    {activeView === "prices" && <PriceFeedPage />}
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
                    {activeView === "pnl" && (
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
                <SpeedDialTrade />
                <KeyboardShortcutsOverlay
                  open={showShortcuts}
                  onClose={() => setShowShortcuts(false)}
                />
              </div>
            )}
          </StreamProvider>
        </PortfolioProvider>
      }
    >
      <div className="min-h-screen bg-base-100 flex flex-col">
        {/* Nav bar for landing page */}
        <header className="navbar bg-base-100 border-b border-base-300 sticky top-0 z-50">
          <div className="navbar-start">
            <div className="flex items-center gap-2">
              <div className="badge badge-lg bg-primary text-primary-content font-bold text-lg p-3">N</div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-primary leading-tight">Noble Trader</span>
                <span className="text-xs text-base-content/40">REGIME RISK</span>
              </div>
            </div>
          </div>
          <div className="navbar-end">
            <SignInButton mode="modal">
              <button className="btn btn-primary btn-sm">Sign In</button>
            </SignInButton>
          </div>
        </header>

        {/* Hero Section */}
        <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="badge badge-outline badge-sm mb-6 text-base-content/50">Institutional-Grade Trading Platform</div>
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight max-w-3xl">
            Trade with <span className="text-primary">Regime Awareness</span>, Not Just Intuition
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-base-content/60 max-w-2xl leading-relaxed">
            Noble Trader combines hidden Markov model regime detection, Kelly criterion position sizing,
            and real-time WebSocket price feeds into a unified platform for disciplined, data-driven trading.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center">
            <SignInButton mode="modal">
              <button className="btn btn-primary btn-lg gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Get Started Free
              </button>
            </SignInButton>
            <a href="#features" className="btn btn-ghost btn-lg">Explore Features</a>
          </div>

          {/* Live stats ticker */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-base-content/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>Real-Time WebSocket Feeds</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>100+ Technical Indicators</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span>Multi-Asset Coverage</span>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="px-6 py-20 bg-base-200/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold">Built for Serious Traders</h2>
              <p className="mt-3 text-base-content/50 max-w-xl mx-auto">
                Every feature is designed around quantitative risk management and regime-aware decision making.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature cards */}
              <FeatureCard
                icon="🧠"
                title="HMM Regime Detection"
                description="Hidden Markov Models identify market regimes in real-time. Know when the market shifts from bull to bear, from trending to volatile, and adapt your strategy accordingly."
                badge="Quantitative"
              />
              <FeatureCard
                icon="⚖️"
                title="Kelly Criterion Sizing"
                description="Mathematically optimal position sizing based on your edge. The Kelly criterion maximizes long-term geometric growth while accounting for win rate and payoff ratio."
                badge="Risk Management"
              />
              <FeatureCard
                icon="📊"
                title="VaR / CVaR Analytics"
                description="Value-at-Risk and Conditional VaR provide worst-case loss estimates at configurable confidence intervals. Know your tail risk before it knows you."
                badge="Risk Management"
              />
              <FeatureCard
                icon="🎲"
                title="Monte Carlo Simulation"
                description="Run thousands of simulated portfolio paths to stress-test your positions. Visualize the full distribution of outcomes, not just point estimates."
                badge="Quantitative"
              />
              <FeatureCard
                icon="⚡"
                title="Live WebSocket Feeds"
                description="Sub-second price updates via Finnhub WebSocket with automatic reconnection, tick throttling, and market-hours awareness. No stale data, no surprises."
                badge="Real-Time"
              />
              <FeatureCard
                icon="📈"
                title="Multi-Chart Analysis"
                description="Switch between live candlestick charts with WS data, TradingView advanced charts with 100+ indicators, sector heatmaps, and economic calendars."
                badge="Analysis"
              />
              <FeatureCard
                icon="🔗"
                title="Correlation Detection"
                description="Automatically detect and monitor correlations between portfolio holdings. Avoid concentration risk and discover hidden relationships across asset classes."
                badge="Portfolio"
              />
              <FeatureCard
                icon="🎯"
                title="Weight Optimizer"
                description="Mean-variance portfolio optimization to find the efficient frontier. Allocate capital based on Sharpe ratios, not gut feelings."
                badge="Portfolio"
              />
              <FeatureCard
                icon="🛡️"
                title="Kill Switch & Audit Trail"
                description="One-click emergency position closure with full audit trail. Every order, fill, and reconciliation event is logged for compliance and review."
                badge="Operations"
                badgeVariant="secondary"
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold">Ready to Trade with an Edge?</h2>
            <p className="mt-4 text-base-content/50">
              Join traders who use regime-aware risk management to make disciplined decisions.
              Start with paper trading and upgrade when you are ready.
            </p>
            <div className="mt-8">
              <SignInButton mode="modal">
                <button className="btn btn-primary btn-lg gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Start Trading Now
                </button>
              </SignInButton>
            </div>
          </div>
        </section>

        {/* Landing Footer */}
        <footer className="px-6 py-4 border-t border-base-300 text-center text-xs text-base-content/30">
          Noble Trader v7.0.0 &mdash; For educational & simulation purposes. Past performance does not guarantee future results.
        </footer>
      </div>
    </Show>
  );
}
