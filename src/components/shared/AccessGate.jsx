"use client";

import { useRole } from "@/hooks/useRole";
import { usePlan } from "@/hooks/usePlan";

/**
 * Role hierarchy — must match useRole.js, RoleGate.jsx, clerk-metadata.js
 */
const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };

/**
 * AccessGate — Unified access control gate combining role AND plan checks.
 *
 * Provides a single component for cases where both role and plan must be
 * satisfied simultaneously. For role-only gating, use <RoleGate>. For
 * plan-only gating, use <PlanGate>.
 *
 * @param {"viewer"|"trader"|"admin"} [minRole="viewer"] — Minimum role required
 * @param {"free"|"premium"|"institutional"} [minPlan] — Minimum plan required (null = no plan check)
 * @param {string} [feature] — Specific feature to check (e.g., "liveTrading")
 * @param {React.ReactNode} children — Content to render if authorized
 * @param {React.ReactNode} [fallback=null] — Optional fallback if unauthorized
 * @param {React.ReactNode} [loading=null] — Optional loading state while auth resolves
 * @param {boolean} [showUpgrade=false] — If true, shows an upgrade CTA instead of fallback
 * @param {boolean} [requireBoth=true] — If true, BOTH role AND plan must pass. If false, EITHER suffices.
 *
 * @example
 * // Live trading: trader+ role AND premium+ plan
 * <AccessGate minRole="trader" minPlan="premium">
 *   <LiveTradingPanel />
 * </AccessGate>
 *
 * // Feature-gated: just check a specific feature from the plan
 * <AccessGate minRole="trader" feature="liveTrading" showUpgrade>
 *   <LiveOrderForm />
 * </AccessGate>
 *
 * // Admin panel with institutional plan requirement
 * <AccessGate minRole="admin" minPlan="institutional">
 *   <MultiTenantConfig />
 * </AccessGate>
 */
export default function AccessGate({
  minRole = "viewer",
  minPlan = null,
  feature = null,
  children,
  fallback = null,
  loading = null,
  showUpgrade = false,
  requireBoth = true,
}) {
  const { role, isLoaded: roleLoaded } = useRole();
  const { plan, isLoaded: planLoaded, hasFeature, hasPlanAccess, planDetails } = usePlan();

  // While loading, don't flash restricted content
  const isLoaded = roleLoaded && planLoaded;
  if (!isLoaded) return loading ?? fallback;

  // ── Role check ──────────────────────────────────────────────────────
  const userRoleLevel = ROLE_HIERARCHY[role] ?? 0;
  const requiredRoleLevel = ROLE_HIERARCHY[minRole] ?? 0;
  const rolePass = userRoleLevel >= requiredRoleLevel;

  // ── Plan check ──────────────────────────────────────────────────────
  let planPass = true; // Default: no plan requirement = pass
  if (feature) {
    planPass = hasFeature(feature);
  } else if (minPlan) {
    planPass = hasPlanAccess(minPlan);
  }

  // ── Combine checks ──────────────────────────────────────────────────
  const hasAccess = requireBoth ? (rolePass && planPass) : (rolePass || planPass);

  if (hasAccess) return children;

  // ── Show upgrade CTA if requested ──────────────────────────────────
  if (showUpgrade) {
    // Determine what's missing for a targeted message
    const missingRole = !rolePass;
    const missingPlan = !planPass;
    const roleNames = { viewer: "Viewer", trader: "Trader", admin: "Admin" };
    const planNames = { free: "Free", premium: "Premium", institutional: "Institutional" };

    let title = "Access Restricted";
    let message = "";

    if (missingRole && missingPlan) {
      title = "Role & Plan Required";
      message = `This feature requires ${roleNames[minRole] || minRole} role and the ${planNames[minPlan] || minPlan} plan. Your current access: ${roleNames[role] || role} / ${planNames[plan] || plan}.`;
    } else if (missingRole) {
      title = "Higher Role Required";
      message = `This feature requires ${roleNames[minRole] || minRole} role or higher. Your current role: ${roleNames[role] || role}. Contact your organization admin for an upgrade.`;
    } else if (missingPlan) {
      title = feature === "liveTrading" ? "Live Trading Requires Premium" : "Upgrade to Unlock";
      message = feature === "liveTrading"
        ? "Connect a live Alpaca account and trade with real capital. Premium unlocks live trading, real-time P&L, and priority execution."
        : `This feature requires the ${planNames[minPlan] || minPlan} plan or higher. Your current plan: ${planNames[plan] || plan}.`;
    }

    return (
      <div className="card bg-base-200 shadow-lg max-w-md mx-auto">
        <div className="card-body items-center text-center p-6">
          <div className="text-4xl mb-2">
            {missingPlan ? (feature === "liveTrading" ? "🔒" : "⭐") : "🛡️"}
          </div>
          <h3 className="card-title text-lg">{title}</h3>
          <p className="text-sm text-base-content/60 mt-1">{message}</p>
          <div className="card-actions mt-4 flex gap-2">
            {missingPlan && (
              <a
                href="#settings-plan"
                className="btn btn-primary btn-sm"
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "plan" } })
                  );
                }}
              >
                Upgrade Plan
              </a>
            )}
            {missingRole && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => window.dispatchEvent(
                  new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "profile" } })
                )}
              >
                View Access Level
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return fallback;
}
