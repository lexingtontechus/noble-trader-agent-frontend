/**
 * withAuth — BFF route middleware for server-side auth, RBAC, and rate limiting.
 *
 * Wraps Next.js App Router route handlers (GET, POST, etc.) with:
 *   1. Authentication check (Clerk auth().userId)
 *   2. Role-based access control (viewer → trader → admin)
 *   3. Plan-based access control (free → premium → institutional)
 *   4. Automatic Redis-backed rate limiting (ON by default)
 *   5. CRON_SECRET bypass for background jobs
 *
 * Rate limiting is NOW ON BY DEFAULT for all authenticated routes.
 * Use `skipRateLimit: true` to opt out (only for webhooks/cron).
 * Route categories are auto-detected from URL path, or set via `rateTier`.
 * Plan-based multipliers adjust limits: free=1x, premium=3x, institutional=10x.
 *
 * @example
 * // Any authenticated user — rate limiting auto-applied
 * export const GET = withAuth(async (request, context) => { ... });
 *
 * // Trader+ only
 * export const POST = withAuth(async (request, context) => { ... }, { minRole: "trader" });
 *
 * // Admin only, with explicit rate tier override
 * export const POST = withAuth(handler, { minRole: "admin", rateTier: "admin" });
 *
 * // Skip rate limiting (webhooks, cron only)
 * export const POST = withAuth(handler, { skipRateLimit: true, allowCron: true });
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  checkRateLimitAsync,
  detectTier,
  getEffectiveLimit,
  rateLimitHeaders,
  rateLimitedResponse,
  buildRateLimitKey,
  RATE_TIERS,
} from "@/lib/rate-limiter";
import { PLAN_HIERARCHY } from "@/lib/plans";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client for violation logging ─────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let _violationClient = null;
function getViolationClient() {
  if (_violationClient) return _violationClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _violationClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _violationClient;
}

/**
 * Log a rate limit violation to Supabase (fire-and-forget).
 * Never blocks or crashes the request.
 */
function logViolation({ identifier, identifierType, tier, pathname, limitMax, windowMs, currentCount, userAgent, ipAddress, plan, role }) {
  const client = getViolationClient();
  if (!client) return;

  // Fire-and-forget
  client.from("rate_limit_violations").insert({
    identifier,
    identifier_type: identifierType,
    tier,
    pathname,
    limit_max: limitMax,
    window_ms: windowMs,
    current_count: currentCount,
    user_agent: userAgent?.substring(0, 500),
    ip_address: ipAddress,
    plan,
    role,
  }).then(() => {}).catch(() => {});
}

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

// ── Main withAuth() ──────────────────────────────────────────────────────────

/**
 * Wrap a Next.js App Router handler with auth, RBAC, and rate-limit checks.
 *
 * @param {Function} handler — The route handler function (request, context, authContext) => Response
 * @param {Object} [options]
 * @param {"viewer"|"trader"|"admin"} [options.minRole="viewer"] — Minimum role required
 * @param {"free"|"premium"|"institutional"} [options.minPlan] — Minimum plan required (null = no check)
 * @param {boolean} [options.skipRateLimit=false] — Skip automatic rate limiting (webhooks/cron only)
 * @param {string} [options.rateTier] — Override auto-detected rate limit tier
 * @param {{ max: number, windowMs: number }} [options.rateLimit] — Explicit rate limit (overrides tier)
 * @param {boolean} [options.allowCron=false] — Allow CRON_SECRET auth bypass
 * @param {boolean} [options.requireOrg=false] — Require an active organization context
 *
 * The handler receives a third argument — authContext — with:
 *   { userId, role, plan, orgId, isCron, rateLimit }
 */
export function withAuth(handler, options = {}) {
  const {
    minRole = "viewer",
    minPlan = null,
    skipRateLimit = false,
    rateTier = null,
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
        rateLimit: null,
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

    // ── Rate limiting (ON by default) ──────────────────────────────────
    let rateCheck = null;

    if (!skipRateLimit) {
      const pathname = new URL(request.url).pathname;

      // Determine effective rate limit
      let effectiveLimit;
      if (rateLimit) {
        // Explicit override — use as-is (no plan multiplier)
        effectiveLimit = {
          max: rateLimit.max,
          windowMs: rateLimit.windowMs,
          tier: "custom",
          label: "Custom Override",
        };
      } else {
        // Auto-detect tier or use explicit tier
        const tier = rateTier || detectTier(pathname);
        effectiveLimit = getEffectiveLimit(tier, plan);
      }

      // Build rate limit key: tier:userId:pathname
      const rateLimitKey = buildRateLimitKey(effectiveLimit.tier, userId, pathname);

      // Check rate limit (async — uses Redis when available)
      rateCheck = await checkRateLimitAsync(
        rateLimitKey,
        effectiveLimit.max,
        effectiveLimit.windowMs
      );

      if (!rateCheck.allowed) {
        // Log violation to DB (fire-and-forget)
        logViolation({
          identifier: userId,
          identifierType: "user",
          tier: effectiveLimit.tier,
          pathname,
          limitMax: effectiveLimit.max,
          windowMs: effectiveLimit.windowMs,
          currentCount: rateCheck.remaining + 1, // Approximate: they exceeded by 1
          userAgent: request.headers.get("user-agent"),
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          plan,
          role,
        });

        return rateLimitedResponse(rateCheck.resetAt, rateCheck.limit, effectiveLimit.tier);
      }
    }

    // ── All checks passed — call handler with auth context ──────────────
    const response = await handler(request, context, {
      userId,
      role,
      plan,
      orgId,
      isCron: false,
      rateLimit: rateCheck,
    });

    // ── Inject rate limit headers on successful responses ───────────────
    if (rateCheck && response instanceof Response) {
      try {
        const headers = rateLimitHeaders(rateCheck);
        // Clone response to add headers without consuming body
        const newHeaders = new Headers(response.headers);
        for (const [k, v] of Object.entries(headers)) {
          newHeaders.set(k, v);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch {
        // Non-critical — return original response
        return response;
      }
    }

    return response;
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
