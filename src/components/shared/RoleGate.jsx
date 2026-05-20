"use client";

import { useRole } from "@/hooks/useRole";

/**
 * Role hierarchy — must match useRole.js and clerk-metadata.js
 */
const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };

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
 * <RoleGate minRole="trader" loading={<LoadingSkeleton />}>
 *   <TradingPanel />
 * </RoleGate>
 */
export default function RoleGate({
  minRole = "viewer",
  children,
  fallback = null,
  loading = null,
  requireServerSync = false,
}) {
  const { role, isLoaded, serverSynced } = useRole();

  // While loading, don't flash restricted content
  if (!isLoaded) return loading ?? fallback;

  // If server sync is required and not yet done, show loading
  if (requireServerSync && !serverSynced) return loading ?? fallback;

  const userLevel = ROLE_HIERARCHY[role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  return userLevel >= requiredLevel ? children : fallback;
}
