"use client";

import { useUser, useOrganization } from "@clerk/nextjs";

/**
 * useRole — Reusable hook for role-based access control.
 *
 * Reads the user's role from Clerk `privateMetadata.role`.
 * Falls back to "viewer" if not set.
 * Also reads org_id from Clerk OrganizationMemberships when using Clerk Orgs.
 *
 * Role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * @returns {{ role: string, isAdmin: boolean, isTrader: boolean, isViewer: boolean, isLoaded: boolean, orgId: string|null, orgRole: string|null }}
 */
export function useRole() {
  const { user, isLoaded } = useUser();
  const { organization } = useOrganization();

  const role = isLoaded
    ? (user?.privateMetadata?.role || "viewer")
    : "viewer";

  // Derive org_id and org_role from active Clerk organization
  const orgId = organization?.id || null;
  const orgRole = organization?.memberships?.find(
    (m) => m.organization.id === orgId
  )?.role || null;

  const isAdmin = role === "admin" || orgRole === "org:admin";
  const isTrader = role === "admin" || role === "trader" || orgRole === "org:admin";
  const isViewer = role === "viewer";

  return { role, isAdmin, isTrader, isViewer, isLoaded, orgId, orgRole };
}
