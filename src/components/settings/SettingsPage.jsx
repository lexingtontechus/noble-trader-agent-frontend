"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useRole } from "@/hooks/useRole";
import { usePlan } from "@/hooks/usePlan";
import { PLANS, PLAN_HIERARCHY } from "@/lib/plans";
import PlanGate from "@/components/shared/PlanGate";
import CredentialCard from "./CredentialCard";
import PlanCard from "./PlanCard";
import NotificationPreferences from "./NotificationPreferences";
import ApiKeyManager from "./ApiKeyManager";
import McpIntegrationPanel from "./McpIntegrationPanel";

/**
 * SettingsPage — Centralized account management.
 *
 * Tabs: Profile | Paper Account | Live Account | Notifications | Plan
 * Accessible from Clerk UserButton menu.
 */
const TABS = [
  { key: "profile", label: "Profile", icon: "👤" },
  { key: "paper", label: "Paper Account", icon: "📝" },
  { key: "live", label: "Live Account", icon: "🔴" },
  { key: "apikeys", label: "API Keys", icon: "🔑" },
  { key: "mcp", label: "MCP", icon: "🤖" },
  { key: "notifications", label: "Notifications", icon: "🔔" },
  { key: "plan", label: "Plan & Billing", icon: "💎" },
];

export default function SettingsPage({ initialTab = "profile" }) {
  const { user, isLoaded: userLoaded } = useUser();
  const { role, isAdmin } = useRole();
  const { plan, planDetails, isLoaded: planLoaded, refreshPlan } = usePlan();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [credStatus, setCredStatus] = useState({ paper: { configured: false, isValid: null }, live: { configured: false, isValid: null } });
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);

  // Listen for navigation events from PlanGate upgrade buttons
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.view === "settings") {
        setActiveTab(e.detail.tab || "plan");
      }
    };
    window.addEventListener("noble:navigate", handler);
    return () => window.removeEventListener("noble:navigate", handler);
  }, []);

  // Fetch credential status
  const fetchCredStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/credentials/paper");
      const paper = await res.json();
      const liveRes = await fetch("/api/credentials/live");
      const live = await liveRes.json();
      setCredStatus({ paper, live });
    } catch {
      // Ignore — stale data is fine
    }
  }, []);

  useEffect(() => {
    fetchCredStatus();
  }, [fetchCredStatus]);

  // One-time Clerk → Supabase migration
  const handleMigration = async () => {
    setMigrating(true);
    try {
      const res = await fetch("/api/onboarding", { method: "PATCH" });
      const data = await res.json();
      setMigrationResult(data);
      if (data.migrated) {
        fetchCredStatus();
      }
    } catch (err) {
      setMigrationResult({ migrated: false, error: err.message });
    } finally {
      setMigrating(false);
    }
  };

  if (!userLoaded || !planLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Settings</h1>
          <p className="text-sm text-base-content/60 mt-1">
            Manage your account, credentials, and subscription
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-sm ${
            plan === "premium" ? "badge-warning" :
            plan === "institutional" ? "badge-secondary" :
            "badge-ghost"
          }`}>
            {planDetails?.name || "Free"}
          </span>
          <span className={`badge badge-sm ${
            role === "admin" ? "badge-error" :
            role === "trader" ? "badge-info" :
            "badge-ghost"
          }`}>
            {role}
          </span>
        </div>
      </div>

      {/* Migration Banner — show if paper keys exist in Clerk but not Supabase */}
      {credStatus.paper.configured === false && !migrationResult && (
        <div className="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm">
            Your Alpaca keys are stored in the legacy Clerk format. Migrate to encrypted database storage for improved security.
          </span>
          <button
            className={`btn btn-warning min-h-[44px] sm:min-h-0 sm:btn-sm ${migrating ? "btn-disabled" : ""}`}
            onClick={handleMigration}
            disabled={migrating}
          >
            {migrating ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Migrating...
              </>
            ) : (
              "Migrate Now"
            )}
          </button>
        </div>
      )}

      {migrationResult?.migrated && (
        <div className="alert alert-success">
          <span className="text-sm">Successfully migrated your paper trading keys to encrypted storage!</span>
        </div>
      )}

      {/* Tab Navigation — scrollable on mobile, icon-only on small screens */}
      <div role="tablist" className="tabs tabs-bordered overflow-x-auto flex-nowrap scrollbar-none -mx-2 px-2 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            className={`tab whitespace-nowrap min-h-[44px] ${activeTab === tab.key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="mr-1 text-base">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.key === "live" && plan !== "premium" && plan !== "institutional" && (
              <span className="badge badge-xs badge-error ml-1">PRO</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in-up">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="card bg-base-200 shadow">
              <div className="card-body">
                <h3 className="card-title text-lg">Account Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="text-xs text-base-content/50 uppercase">Email</label>
                    <p className="font-medium">{user?.emailAddresses?.[0]?.emailAddress || "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 uppercase">User ID</label>
                    <p className="font-mono text-sm">{user?.id?.slice(0, 16)}...</p>
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 uppercase">Role</label>
                    <p className="font-medium capitalize">{role}</p>
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 uppercase">Plan</label>
                    <p className="font-medium">{planDetails?.name || "Free"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-200 shadow">
              <div className="card-body">
                <h3 className="card-title text-lg">Clerk Profile</h3>
                <p className="text-sm text-base-content/60 mb-3">
                  Manage your name, email, password, and two-factor authentication through Clerk.
                </p>
                {/* Clerk UserProfile link — opens in a modal/panel */}
                <a
                  href="/user-profile"
                  className="btn btn-outline min-h-[44px] sm:min-h-0 sm:btn-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Clerk Profile Manager
                </a>
              </div>
            </div>

            {isAdmin && (
              <div className="card bg-base-200 shadow">
                <div className="card-body">
                  <h3 className="card-title text-lg text-error">Admin Controls</h3>
                  <p className="text-sm text-base-content/60 mb-3">
                    You have admin privileges. Access the admin panel for advanced diagnostics.
                  </p>
                  <button
                    className="btn btn-error min-h-[44px] sm:min-h-0 sm:btn-sm"
                    onClick={() => window.dispatchEvent(
                      new CustomEvent("noble:navigate", { detail: { view: "admin" } })
                    )}
                  >
                    Open Admin Panel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paper Account Tab */}
        {activeTab === "paper" && (
          <CredentialCard
            type="paper"
            status={credStatus.paper}
            onStatusChange={fetchCredStatus}
            alpacaBaseUrl="https://paper-api.alpaca.markets"
            alpacaSignUpUrl="https://app.alpaca.markets/signup"
            description="Paper trading uses simulated capital with real market data. Perfect for testing strategies without financial risk."
          />
        )}

        {/* Live Account Tab — Plan-gated */}
        {activeTab === "live" && (
          <PlanGate minPlan="premium" showUpgrade feature="liveTrading">
            <CredentialCard
              type="live"
              status={credStatus.live}
              onStatusChange={fetchCredStatus}
              alpacaBaseUrl="https://api.alpaca.markets"
              alpacaSignUpUrl="https://app.alpaca.markets/signup"
              description="Live trading uses real capital. Ensure your risk management settings are configured before trading."
              dangerZone
            />
          </PlanGate>
        )}

        {/* API Keys Tab */}
        {activeTab === "apikeys" && (
          <ApiKeyManager />
        )}

        {/* MCP Integration Tab */}
        {activeTab === "mcp" && (
          <McpIntegrationPanel />
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <NotificationPreferences />
        )}

        {/* Plan & Billing Tab */}
        {activeTab === "plan" && (
          <PlanCard currentPlan={plan} onPlanChange={refreshPlan} />
        )}
      </div>
    </div>
  );
}
