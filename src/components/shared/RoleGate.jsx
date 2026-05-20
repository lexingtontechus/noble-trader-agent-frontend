"use client";

import { useRole } from "@/hooks/useRole";

/**
 * RoleGate — Conditionally render children based on user role.
 *
 * Uses the role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * @param {"viewer"|"trader"|"admin"} minRole — Minimum role required to see children
 * @param {React.ReactNode} children — Content to render if authorized
 * @param {React.ReactNode} [fallback=null] — Optional fallback if unauthorized
 *
 * @example
 * <RoleGate minRole="trader">
 *   <button onClick={executeTrade}>Execute Trade</button>
 * </RoleGate>
 *
 * <RoleGate minRole="admin" fallback={<p>Admin only</p>}>
 *   <KillSwitchPanel />
 * </RoleGate>
 */
const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };

export default function RoleGate({ minRole = "viewer", children, fallback = null }) {
  const { role, isLoaded } = useRole();

  // While loading, don't flash restricted content
  if (!isLoaded) return fallback;

  const userLevel = ROLE_HIERARCHY[role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  return userLevel >= requiredLevel ? children : fallback;
}
