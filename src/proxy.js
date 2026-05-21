import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkRateLimitAsync, rateLimitedResponse, rateLimitHeaders } from "@/lib/rate-limiter";

/**
 * Proxy / Middleware (Next.js 16 uses proxy.js instead of middleware.ts)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is CRITICAL for the JWT auth flow:
 *   - clerkMiddleware() populates the Clerk auth context for every request
 *   - Without it, auth().getToken() in BFF Route Handlers returns null
 *   - The BFF layer then has no JWT to forward to the FastAPI backend
 *
 * Additionally provides IP-based rate limiting as a safety net:
 *   - Per-IP rate limits on all /api/* routes
 *   - Authenticated routes also get per-user rate limiting in withAuth()
 *   - This layer catches DDoS and unauthenticated abuse before hitting BFF
 *
 * Auth protection strategy:
 *   - PAGE routes: Protected client-side via <Authenticated> / <Unauthenticated>
 *     components from Clerk, which show sign-in UI instead of protected content
 *   - API routes: Protected by the BFF layer (getFastAPIAuthHeaders() in each
 *     Route Handler), which returns proper 401/403 JSON responses
 *   - Admin access: Protected client-side by checking privateMetadata.role
 *     AND server-side by the FastAPI backend's require_clerk_admin dependency
 */

// ── IP-based Rate Limiting ────────────────────────────────────────────────────

/** Per-IP rate limits for different route types */
const IP_LIMITS = {
  /** Strict limit for sensitive public endpoints */
  public: { max: 120, windowMs: 60_000 },
  /** Standard limit for all other API routes */
  api:    { max: 200, windowMs: 60_000 },
};

/** Routes classified as public (no auth required) */
const PUBLIC_API_PATTERNS = [
  /^\/api\/health$/,
  /^\/api\/health\/cron/,
  /^\/api\/subscription\/webhook/,
  /^\/api\/auth\/clerk-config/,
  /^\/api\/onboarding/,
];

function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function classifyRoute(pathname) {
  if (PUBLIC_API_PATTERNS.some((p) => p.test(pathname))) return "public";
  return "api";
}

// ── Clerk Middleware Wrapper ──────────────────────────────────────────────────

const clerk = clerkMiddleware();

export default async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Apply IP-based rate limiting only to API routes
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    const routeType = classifyRoute(pathname);
    const limit = IP_LIMITS[routeType];
    const rateLimitKey = `ip-${routeType}:${ip}:${pathname}`;

    const rateCheck = await checkRateLimitAsync(
      rateLimitKey,
      limit.max,
      limit.windowMs
    );

    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.resetAt, rateCheck.limit, `ip-${routeType}`);
    }

    // Run Clerk middleware, then inject rate limit headers
    const response = await clerk(request);
    if (response instanceof Response) {
      try {
        const headers = rateLimitHeaders(rateCheck);
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
        return response;
      }
    }

    return response;
  }

  // Non-API routes: just run Clerk middleware
  return clerk(request);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
