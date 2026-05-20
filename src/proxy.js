import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Proxy / Middleware (Next.js 16 uses proxy.js instead of middleware.ts)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is CRITICAL for the JWT auth flow:
 *   - clerkMiddleware() populates the Clerk auth context for every request
 *   - Without it, auth().getToken() in BFF Route Handlers returns null
 *   - The BFF layer then has no JWT to forward to the FastAPI backend
 *
 * We use the simplest form of clerkMiddleware() — no auth.protect() calls.
 * This avoids the "infinite redirect loop" issue that occurs when
 * auth.protect() tries to redirect on API routes or during session refresh.
 *
 * Auth protection strategy:
 *   - PAGE routes: Protected client-side via <Authenticated> / <Unauthenticated>
 *     components from Clerk, which show sign-in UI instead of protected content
 *   - API routes: Protected by the BFF layer (getFastAPIAuthHeaders() in each
 *     Route Handler), which returns proper 401/403 JSON responses
 *   - Admin access: Protected client-side by checking privateMetadata.role
 *     AND server-side by the FastAPI backend's require_clerk_admin dependency
 */

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
