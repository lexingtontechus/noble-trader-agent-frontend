"use client";

import { usePlan } from "@/hooks/usePlan";
import { PLAN_HIERARCHY } from "@/lib/plans";

/**
 * PlanGate — Conditionally render children based on user plan.
 *
 * Uses the plan hierarchy: free (0) → premium (1) → institutional (2)
 *
 * @param {"free"|"premium"|"institutional"} minPlan — Minimum plan required to see children
 * @param {React.ReactNode} children — Content to render if authorized
 * @param {React.ReactNode} [fallback=null] — Optional fallback if unauthorized
 * @param {string} [feature] — Optional specific feature to check (e.g., "liveTrading")
 * @param {boolean} [showUpgrade=false] — If true, shows an upgrade CTA instead of fallback
 *
 * @example
 * <PlanGate minPlan="premium">
 *   <LiveTradingPanel />
 * </PlanGate>
 *
 * <PlanGate feature="portfolioOptimization" showUpgrade>
 *   <PortfolioOptimizer />
 * </PlanGate>
 */
export default function PlanGate({
  minPlan = "free",
  children,
  fallback = null,
  feature,
  showUpgrade = false,
}) {
  const { plan, isLoaded, hasFeature, hasPlanAccess, planDetails } = usePlan();

  // While loading, don't flash restricted content
  if (!isLoaded) return fallback;

  // Check feature-specific access if feature prop provided
  const hasAccess = feature
    ? hasFeature(feature)
    : hasPlanAccess(minPlan);

  if (hasAccess) return children;

  // Show upgrade CTA if requested
  if (showUpgrade) {
    return (
      <div className="card bg-base-200 shadow-lg max-w-md mx-auto">
        <div className="card-body items-center text-center p-6">
          <div className="text-4xl mb-2">
            {feature === "liveTrading" ? "🔒" : "⭐"}
          </div>
          <h3 className="card-title text-lg">
            {feature === "liveTrading"
              ? "Live Trading Requires Premium"
              : "Upgrade to Unlock"}
          </h3>
          <p className="text-sm text-base-content/60 mt-1">
            {feature === "liveTrading"
              ? "Connect a live Alpaca account and trade with real capital. Premium unlocks live trading, real-time P&L, and priority execution."
              : `This feature requires the ${minPlan} plan or higher.`}
          </p>
          <div className="card-actions mt-4">
            <a
              href="#settings-plan"
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.preventDefault();
                // Dispatch a custom event that SettingsPage listens to
                window.dispatchEvent(
                  new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "plan" } })
                );
              }}
            >
              Upgrade Plan
            </a>
          </div>
        </div>
      </div>
    );
  }

  return fallback;
}
