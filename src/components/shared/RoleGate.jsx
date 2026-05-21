"use client";

import { useRole } from "@/hooks/useRole";

/**
 * Role hierarchy — must match useRole.js and clerk-metadata.js
 */
const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };
const ROLE_NAMES = { viewer: "Viewer", trader: "Trader", admin: "Admin" };

/**
 * RoleGate — Conditionally render children based on user role.
 *
 * Uses the role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * @param {"viewer"|"trader"|"admin"} minRole — Minimum role required to see children
 * @param {React.ReactNode} children — Content to render if authorized
 * @param {React.ReactNode} [fallback=null] — Optional fallback if unauthorized
 * @param {React.ReactNode} [loading=null] — Optional loading state while auth resolves
 * @param {boolean} [requireServerSync=false] — If true, wait for server role confirmation
 * @param {boolean} [showUpgrade=false] — If true, shows an upgrade CTA instead of fallback
 *
 * @example
 * <RoleGate minRole="trader">
 *   <button onClick={executeTrade}>Execute Trade</button>
 * </RoleGate>
 *
 * <RoleGate minRole="admin" fallback={<p>Admin only</p>}>
 *   <KillSwitchPanel />
 * </RoleGate>
 *
 * <RoleGate minRole="trader" showUpgrade>
 *   <TradingWorkflow />
 * </RoleGate>
 */
export default function RoleGate({
  minRole = "viewer",
  children,
  fallback = null,
  loading = null,
  requireServerSync = false,
  showUpgrade = false,
}) {
  const { role, isLoaded, serverSynced } = useRole();

  // While loading, don't flash restricted content
  if (!isLoaded) return loading ?? fallback;

  // If server sync is required and not yet done, show loading
  if (requireServerSync && !serverSynced) return loading ?? fallback;

  const userLevel = ROLE_HIERARCHY[role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  if (userLevel >= requiredLevel) return children;

  // Show upgrade CTA if requested
  if (showUpgrade) {
    return (
      <div className="card bg-base-200 shadow-lg max-w-md mx-auto">
        <div className="card-body items-center text-center p-6">
          <div className="text-4xl mb-2">🛡️</div>
          <h3 className="card-title text-lg">Higher Role Required</h3>
          <p className="text-sm text-base-content/60 mt-1">
            This feature requires <strong>{ROLE_NAMES[minRole] || minRole}</strong> role or higher.
            Your current role: <strong>{ROLE_NAMES[role] || role}</strong>.
            Contact your organization admin for a role upgrade.
          </p>
          <div className="card-actions mt-4">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.dispatchEvent(
                new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "profile" } })
              )}
            >
              View Access Level
            </button>
          </div>
        </div>
      </div>
    );
  }

  return fallback;
}
