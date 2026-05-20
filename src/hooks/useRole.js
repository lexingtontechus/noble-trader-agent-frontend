"use client";

import { useUser, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

/**
 * Role hierarchy — must match ROLE_HIERARCHY in RoleGate.jsx
 * and VALID_ROLES in clerk-metadata.js
 */
const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };

/**
 * useRole — Reusable hook for role-based access control.
 *
 * Reads the user's role from Clerk `privateMetadata.role`.
 * Falls back to "viewer" if not set (matching server-side default).
 * Also reads org_id from Clerk OrganizationMemberships when using Clerk Orgs.
 *
 * Role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * Features:
 *   - Client-side role from Clerk privateMetadata (instant, no API call)
 *   - Optional server-side sync via /api/auth/role (verifies against DB)
 *   - isTrader: true for admin + trader (can place trades)
 *   - isViewer: true only for viewer role (read-only)
 *   - canAccess(minRole): check if user meets a minimum role level
 *
 * @returns {{
 *   role: string,
 *   isAdmin: boolean,
 *   isTrader: boolean,
 *   isViewer: boolean,
 *   isLoaded: boolean,
 *   canAccess: (minRole: string) => boolean,
 *   orgId: string|null,
 *   orgRole: string|null,
 *   serverRole: string|null,
 *   serverSynced: boolean
 * }}
 */
export function useRole() {
  const { user, isLoaded } = useUser();
  const { organization } = useOrganization();
  const [serverRole, setServerRole] = useState(null);
  const [serverSynced, setServerSynced] = useState(false);

  // Client-side role from Clerk privateMetadata
  const role = isLoaded
    ? (user?.privateMetadata?.role || "viewer")
    : "viewer";

  // Derive org_id and org_role from active Clerk organization
  const orgId = organization?.id || null;
  const orgRole = organization?.memberships?.find(
    (m) => m.organization.id === orgId
  )?.role || null;

  // Role booleans
  const isAdmin = role === "admin" || orgRole === "org:admin";
  const isTrader = role === "admin" || role === "trader" || orgRole === "org:admin";
  const isViewer = role === "viewer";

  // canAccess: check if user meets minimum role level
  const canAccess = useCallback((minRole) => {
    const userLevel = ROLE_HIERARCHY[role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    return userLevel >= requiredLevel;
  }, [role]);

  // One-time server-side role sync (verifies against Clerk backend)
  useEffect(() => {
    if (!isLoaded || !user || serverSynced) return;

    let cancelled = false;
    fetch("/api/auth/role")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.role) {
          setServerRole(data.role);
          setServerSynced(true);
        }
      })
      .catch(() => {
        // Non-critical — client role is still valid from privateMetadata
      });

    return () => { cancelled = true; };
  }, [isLoaded, user, serverSynced]);

  return {
    role,
    isAdmin,
    isTrader,
    isViewer,
    isLoaded,
    canAccess,
    orgId,
    orgRole,
    serverRole,
    serverSynced,
  };
}
