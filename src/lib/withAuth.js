/**
 * withAuth — BFF route middleware for server-side auth, RBAC, and rate limiting.
 *
 * Wraps Next.js App Router route handlers (GET, POST, etc.) with:
 *   1. CRON_SECRET bypass for background jobs
 *   2. API Key authentication (X-API-Key header) — NEW: SaaS API key support
 *   3. Clerk JWT authentication (auth().userId)
 *   4. Role-based access control (viewer → trader → admin)
 *   5. Plan-based access control (free → premium → institutional)
 *   6. Automatic Redis-backed rate limiting (ON by default)
 *
 * API Key Auth Flow:
 *   - If X-API-Key header is present with an nt_live_ prefix, the key is
 *     looked up in the api_keys table via SHA-256 hash.
 *   - The user's role and plan are inherited from the key record + Clerk metadata.
 *   - API key requests get the same rate limiting, RBAC, and plan enforcement.
 *   - authContext.isApiKey = true for API key requests.
 *
 * Rate limiting is ON BY DEFAULT for all authenticated routes.
 * Use `skipRateLimit: true` to opt out (only for webhooks/cron).
 * Route categories are auto-detected from URL path, or set via `rateTier`.
 * Plan-based multipliers adjust limits: free=1x, premium=3x, institutional=10x.
 *
 * @example
 * // Any authenticated user (Clerk JWT or API Key)
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
import { hashPII } from "@/lib/encryption";
import { lookupApiKey, isValidApiKeyFormat } from "@/lib/api-keys";
import { sanitizeError } from "@/lib/error-messages";

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
function logViolation({ identifier, identifierType, tier, pathname, limitMax, windowMs, currentCount, userAgent, ipAddress, plan, role, orgId }) {
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
    org_id: orgId || null,
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
    try {
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

    // ── API Key authentication ─────────────────────────────────────────
    // Check for X-API-Key header with nt_live_ prefix BEFORE Clerk auth.
    // This allows external clients (MCP, programmatic) to authenticate
    // without a Clerk session, using a SaaS API key instead.
    const apiKeyHeader = request.headers.get("x-api-key");

    // Pre-compute required levels (used by both API key and Clerk branches)
    const requiredRoleLevel = ROLE_HIERARCHY[minRole] ?? 0;
    const requiredPlanLevel = minPlan ? (PLAN_HIERARCHY[minPlan] ?? 0) : null;

    if (apiKeyHeader && isValidApiKeyFormat(apiKeyHeader)) {
      const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const hashedIp = requestIp ? hashPII(requestIp) : null;
      const keyRecord = await lookupApiKey(apiKeyHeader, hashedIp);

      if (!keyRecord) {
        return unauthorized("Invalid or expired API key");
      }

      // Build auth context from API key record
      // Role and plan come from the key's creation state + current Clerk metadata
      const apiKeyRole = keyRecord.role_at_creation || "viewer";
      const apiKeyPlan = keyRecord.plan_at_creation || "free";

      // Also check current Clerk metadata for the user (key might be stale)
      const currentRole = await getServerRole(keyRecord.clerk_user_id);
      const currentPlan = await getServerPlan(keyRecord.clerk_user_id);

      // Use the LESSER of key-at-creation and current Clerk values for security
      const effectiveRole = ROLE_HIERARCHY[currentRole] < ROLE_HIERARCHY[apiKeyRole] ? currentRole : apiKeyRole;
      const effectivePlan = PLAN_HIERARCHY[currentPlan] < PLAN_HIERARCHY[apiKeyPlan] ? currentPlan : apiKeyPlan;

      // ── Role check (API Key) ───────────────────────────────────────────
      const apiKeyRoleLevel = ROLE_HIERARCHY[effectiveRole] ?? 0;
      if (apiKeyRoleLevel < requiredRoleLevel) {
        const roleNames = { viewer: "Viewer", trader: "Trader", admin: "Admin" };
        return forbidden(
          `This action requires ${roleNames[minRole] || minRole} role. API key role: ${roleNames[effectiveRole] || effectiveRole}.`,
          "ROLE_REQUIRED"
        );
      }

      // ── Plan check (API Key) ───────────────────────────────────────────
      if (minPlan) {
        const apiKeyPlanLevel = PLAN_HIERARCHY[effectivePlan] ?? 0;
        if (apiKeyPlanLevel < requiredPlanLevel) {
          const planNames = { free: "Free", premium: "Premium", institutional: "Institutional" };
          return forbidden(
            `This feature requires the ${planNames[minPlan] || minPlan} plan. API key plan: ${planNames[effectivePlan] || effectivePlan}.`,
            "PLAN_REQUIRED"
          );
        }
      }

      // ── Org check (API Key) ────────────────────────────────────────────
      // API keys are user-scoped, not org-scoped. If org is required,
      // API key requests must fail (use Clerk JWT instead).
      if (requireOrg) {
        return forbidden(
          "Organization context is required for this action. API keys do not carry org context — use Clerk authentication instead.",
          "ORG_REQUIRED"
        );
      }

      // ── Rate limiting (API Key) ────────────────────────────────────────
      let apiKeyRateCheck = null;
      if (!skipRateLimit) {
        const pathname = new URL(request.url).pathname;
        let effectiveLimit;
        if (rateLimit) {
          effectiveLimit = { max: rateLimit.max, windowMs: rateLimit.windowMs, tier: "custom", label: "Custom Override" };
        } else {
          const tier = rateTier || detectTier(pathname);
          effectiveLimit = getEffectiveLimit(tier, effectivePlan);
        }
        const rateLimitKey = buildRateLimitKey(effectiveLimit.tier, keyRecord.clerk_user_id, pathname);
        apiKeyRateCheck = await checkRateLimitAsync(rateLimitKey, effectiveLimit.max, effectiveLimit.windowMs);

        if (!apiKeyRateCheck.allowed) {
          logViolation({
            identifier: keyRecord.clerk_user_id,
            identifierType: "api_key",
            tier: effectiveLimit.tier,
            pathname,
            limitMax: effectiveLimit.max,
            windowMs: effectiveLimit.windowMs,
            currentCount: apiKeyRateCheck.remaining + 1,
            userAgent: request.headers.get("user-agent"),
            ipAddress: hashedIp,
            plan: effectivePlan,
            role: effectiveRole,
            orgId: null,
          });
          return rateLimitedResponse(apiKeyRateCheck.resetAt, apiKeyRateCheck.limit, effectiveLimit.tier);
        }
      }

      // ── API Key auth succeeded ─────────────────────────────────────────
      const response = await handler(request, context, {
        userId: keyRecord.clerk_user_id,
        role: effectiveRole,
        plan: effectivePlan,
        orgId: null,
        isCron: false,
        isApiKey: true,
        apiKeyId: keyRecord.id,
        rateLimit: apiKeyRateCheck,
      });

      if (apiKeyRateCheck && response instanceof Response) {
        try {
          const headers = rateLimitHeaders(apiKeyRateCheck);
          const newHeaders = new Headers(response.headers);
          for (const [k, v] of Object.entries(headers)) newHeaders.set(k, v);
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
        } catch { return response; }
      }
      return response;
    }

    // ── Clerk JWT Authentication ──────────────────────────────────────────
    const userId = await getAuthUserId();
    if (!userId) {
      return unauthorized();
    }

    // ── Role check ──────────────────────────────────────────────────────
    const role = await getServerRole(userId);
    const userRoleLevel = ROLE_HIERARCHY[role] ?? 0;

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
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ? hashPII(request.headers.get("x-forwarded-for").split(",")[0].trim()) : null,
          plan,
          role,
          orgId,
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
      isApiKey: false,
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
    } catch (unhandledError) {
      // Top-level catch: any unhandled error in the auth/handler pipeline
      // must still return JSON — never let Next.js return an HTML 500 page
      console.error("[withAuth] Unhandled error in route handler:", unhandledError);
      const { message, code, status } = sanitizeError(unhandledError, { context: "default" });
      return Response.json({ error: message, code }, { status });
    }
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
