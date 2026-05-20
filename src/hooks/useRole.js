"use client";

import { useUser } from "@clerk/nextjs";

/**
 * useRole — Reusable hook for role-based access control.
 *
 * Reads the user's role from Clerk `privateMetadata.role`.
 * Falls back to "viewer" if not set.
 *
 * Role hierarchy: viewer (0) → trader (1) → admin (2)
 *
 * @returns {{ role: string, isAdmin: boolean, isTrader: boolean, isViewer: boolean, isLoaded: boolean }}
 */
export function useRole() {
  const { user, isLoaded } = useUser();

  const role = isLoaded
    ? (user?.privateMetadata?.role || "viewer")
    : "viewer";

  const isAdmin = role === "admin";
  const isTrader = role === "admin" || role === "trader";
  const isViewer = role === "viewer";

  return { role, isAdmin, isTrader, isViewer, isLoaded };
}
