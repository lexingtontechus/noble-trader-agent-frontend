import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Root proxy (fallback — the primary is src/proxy.js)
 * Next.js 16 uses proxy.js instead of middleware.ts.
 *
 * This ensures clerkMiddleware() runs for ALL requests, populating
 * the Clerk auth context so auth().getToken() works in Route Handlers.
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
  if (isPublicRoute(request)) return;

  await auth.protect();

  if (isAdminRoute(request)) {
    const { userId } = await auth();
    if (!userId) return;

    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const role = user.privateMetadata?.role || "viewer";

      if (role !== "admin") {
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
