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
 * Reads the user's role from Clerk `privateMetadata.role` via server-side
 * verification (/api/auth/role). The server route uses clerkClient() to
 * read privateMetadata which is NOT reliably available on the client.
 *
 * Client-side privateMetadata is used as an optimistic hint only;
 * the server-synced role is the source of truth.
 *
 * Role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * Features:
 *   - Server-verified role via /api/auth/role (authoritative source)
 *   - Optimistic client-side role from Clerk privateMetadata (instant hint)
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

  // Optimistic client-side hint from Clerk privateMetadata
  // NOTE: privateMetadata is NOT reliably exposed to the client by Clerk.
  // It may be undefined even when set in the Clerk Dashboard.
  const clientHint = isLoaded
    ? (user?.privateMetadata?.role || null)
    : null;

  // Authoritative role: server-synced > client hint > "viewer" default
  const role = serverRole || clientHint || "viewer";

  // Derive org_id and org_role from active Clerk organization
  const orgId = organization?.id || null;
  const orgRole = organization?.memberships?.find(
    (m) => m.organization.id === orgId
  )?.role || null;

  // Role booleans (server-synced role is authoritative)
  const isAdmin = role === "admin" || orgRole === "org:admin";
  const isTrader = role === "admin" || role === "trader" || orgRole === "org:admin";
  const isViewer = role === "viewer";

  // canAccess: check if user meets minimum role level
  const canAccess = useCallback((minRole) => {
    const userLevel = ROLE_HIERARCHY[role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    return userLevel >= requiredLevel;
  }, [role]);

  // One-time server-side role sync (authoritative — reads via clerkClient backend)
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
        // Non-critical — client hint is still used as fallback
      });

    return () => { cancelled = true; };
  }, [isLoaded, user, serverSynced]);

  return {
    role,
    isAdmin,
    isTrader,
    isViewer,
    isLoaded: isLoaded && serverSynced,
    canAccess,
    orgId,
    orgRole,
    serverRole,
    serverSynced,
  };
}
