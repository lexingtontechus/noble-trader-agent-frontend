import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Proxy / Middleware (Next.js 16 uses proxy.js instead of middleware.ts)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is CRITICAL for the JWT auth flow:
 *   - clerkMiddleware() populates the Clerk auth context for every request
 *   - Without it, auth().getToken() in BFF Route Handlers returns null
 *   - The BFF layer then has no JWT to forward to the FastAPI backend
 *
 * Route classification:
 *   - Public routes: accessible without authentication (sign-in, health, etc.)
 *   - Protected routes: require a valid Clerk session (most API routes)
 *   - Admin routes: require admin role in privateMetadata
 */

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",
  "/api/auth/clerk-config(.*)",
  "/index.html",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin/(.*)",
  "/api/kill-switch(.*)",
  "/api/mode(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Public routes don't require authentication
  if (isPublicRoute(request)) return;

  // All other routes require a valid Clerk session.
  // This ensures auth().getToken() returns a valid JWT in BFF Route Handlers,
  // which then gets forwarded as a Bearer token to the FastAPI backend.
  await auth.protect();

  // Admin routes additionally require admin role in privateMetadata
  if (isAdminRoute(request)) {
    const { userId } = await auth();
    if (!userId) return; // auth.protect() already handles this

    // Check Clerk privateMetadata.role
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const role = user.privateMetadata?.role || "viewer";

      if (role !== "admin") {
        // Redirect non-admin users to the home page
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return Response.redirect(url);
      }
    } catch (err) {
      console.error("[proxy] Admin role check failed:", err.message);
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return Response.redirect(url);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
