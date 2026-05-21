/**
 * withAuth — BFF route middleware for server-side auth, RBAC, and rate limiting.
 *
 * Wraps Next.js App Router route handlers (GET, POST, etc.) with:
 *   1. Authentication check (Clerk auth().userId)
 *   2. Role-based access control (viewer → trader → admin)
 *   3. Plan-based access control (free → premium → institutional)
 *   4. Per-user rate limiting
 *   5. CRON_SECRET bypass for background jobs
 *
 * @example
 * // Any authenticated user
 * export const GET = withAuth(async (request, context) => { ... });
 *
 * // Trader+ only
 * export const POST = withAuth(async (request, context) => { ... }, { minRole: "trader" });
 *
 * // Admin only, with rate limit
 * export const POST = withAuth(handler, { minRole: "admin", rateLimit: { max: 10, windowMs: 60000 } });
 *
 * // Allow cron jobs
 * export const GET = withAuth(handler, { allowCron: true });
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { PLAN_HIERARCHY } from "@/lib/plans";

// ── Constants ────────────────────────────────────────────────────────────────

const ROLE_HIERARCHY = { viewer: 0, trader: 1, admin: 2 };
const VALID_ROLES = new Set(["viewer", "trader", "admin"]);

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Get the authenticated user's Clerk userId.
 * Returns null if not authenticated.
 */
async function getAuthUserId() {
  try {
    const { userId } = await auth();
    return userId || null;
  } catch {
    return null;
  }
}

/**
 * Get the user's role from Clerk privateMetadata.
 * Falls back to "viewer" if not set or invalid.
 */
async function getServerRole(userId) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const role = user?.privateMetadata?.role || "viewer";
    return VALID_ROLES.has(role) ? role : "viewer";
  } catch {
    return "viewer";
  }
}

/**
 * Get the user's plan from Clerk privateMetadata.
 * Falls back to "free" if not set or invalid.
 */
async function getServerPlan(userId) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const plan = user?.privateMetadata?.plan || "free";
    return PLAN_HIERARCHY[plan] !== undefined ? plan : "free";
  } catch {
    return "free";
  }
}

/**
 * Get the user's org_id from Clerk auth context.
 */
async function getServerOrgId() {
  try {
    const { orgId } = await auth();
    return orgId || null;
  } catch {
    return null;
  }
}

/**
 * Check CRON_SECRET authorization.
 * Returns true if the request has a valid CRON_SECRET header.
 */
function isCronRequest(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const querySecret = new URL(request.url).searchParams.get("cron_secret");
  return querySecret === cronSecret;
}

// ── Error responses ──────────────────────────────────────────────────────────

function unauthorized(message = "Authentication required") {
  return Response.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}

function forbidden(message = "Insufficient permissions", code = "FORBIDDEN") {
  return Response.json(
    { error: message, code },
    { status: 403 }
  );
}

function rateLimited(resetAt) {
  return Response.json(
    { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}

// ── Main withAuth() ──────────────────────────────────────────────────────────

/**
 * Wrap a Next.js App Router handler with auth, RBAC, and rate-limit checks.
 *
 * @param {Function} handler — The route handler function (request, context) => Response
 * @param {Object} [options]
 * @param {"viewer"|"trader"|"admin"} [options.minRole="viewer"] — Minimum role required
 * @param {"free"|"premium"|"institutional"} [options.minPlan] — Minimum plan required (null = no check)
 * @param {{ max: number, windowMs: number }} [options.rateLimit] — Per-user rate limit config
 * @param {boolean} [options.allowCron=false] — Allow CRON_SECRET auth bypass
 * @param {boolean} [options.requireOrg=false] — Require an active organization context
 *
 * The handler receives a third argument — authContext — with:
 *   { userId, role, plan, orgId, isCron }
 */
export function withAuth(handler, options = {}) {
  const {
    minRole = "viewer",
    minPlan = null,
    rateLimit = null,
    allowCron = false,
    requireOrg = false,
  } = options;

  return async function authedHandler(request, context) {
    // ── CRON bypass ─────────────────────────────────────────────────────
    if (allowCron && isCronRequest(request)) {
      return handler(request, context, {
        userId: "cron",
        role: "admin",
        plan: "institutional",
        orgId: null,
        isCron: true,
      });
    }

    // ── Authentication ──────────────────────────────────────────────────
    const userId = await getAuthUserId();
    if (!userId) {
      return unauthorized();
    }

    // ── Role check ──────────────────────────────────────────────────────
    const role = await getServerRole(userId);
    const userRoleLevel = ROLE_HIERARCHY[role] ?? 0;
    const requiredRoleLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userRoleLevel < requiredRoleLevel) {
      const roleNames = { viewer: "Viewer", trader: "Trader", admin: "Admin" };
      return forbidden(
        `This action requires ${roleNames[minRole] || minRole} role or higher. Your role: ${roleNames[role] || role}.`,
        "ROLE_REQUIRED"
      );
    }

    // ── Plan check ──────────────────────────────────────────────────────
    const plan = await getServerPlan(userId);
    if (minPlan) {
      const userPlanLevel = PLAN_HIERARCHY[plan] ?? 0;
      const requiredPlanLevel = PLAN_HIERARCHY[minPlan] ?? 0;

      if (userPlanLevel < requiredPlanLevel) {
        const planNames = { free: "Free", premium: "Premium", institutional: "Institutional" };
        return forbidden(
          `This feature requires the ${planNames[minPlan] || minPlan} plan. Your plan: ${planNames[plan] || plan}.`,
          "PLAN_REQUIRED"
        );
      }
    }

    // ── Org check ───────────────────────────────────────────────────────
    const orgId = await getServerOrgId();
    if (requireOrg && !orgId) {
      return forbidden(
        "An active organization is required for this action. Please select or create an organization.",
        "ORG_REQUIRED"
      );
    }

    // ── Rate limiting (per-user) ────────────────────────────────────────
    if (rateLimit) {
      // Use userId for rate limiting (not just IP) — prevents credential stuffing
      const rateLimitKey = `user:${userId}:${new URL(request.url).pathname}`;
      const rateCheck = checkRateLimit(
        rateLimitKey,
        rateLimit.max,
        rateLimit.windowMs
      );
      if (!rateCheck.allowed) {
        return rateLimited(rateCheck.resetAt);
      }
    }

    // ── All checks passed — call handler with auth context ──────────────
    return handler(request, context, {
      userId,
      role,
      plan,
      orgId,
      isCron: false,
    });
  };
}

/**
 * Convenience wrapper for routes that only need auth (no role/plan checks).
 * Equivalent to withAuth(handler, { minRole: "viewer" })
 */
export function withAuthOnly(handler) {
  return withAuth(handler, { minRole: "viewer" });
}

/**
 * Convenience wrapper for trader+ routes.
 * Equivalent to withAuth(handler, { minRole: "trader" })
 */
export function withTraderAuth(handler) {
  return withAuth(handler, { minRole: "trader" });
}

/**
 * Convenience wrapper for admin-only routes.
 * Equivalent to withAuth(handler, { minRole: "admin" })
 */
export function withAdminAuth(handler) {
  return withAuth(handler, { minRole: "admin" });
}
