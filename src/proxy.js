import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",
  "/api/auth/(.*)",
  "/api/trading/(.*)",
  "/api/alpaca/(.*)",
  "/api/portfolio/(.*)",
  "/api/telegram/(.*)",
  "/api/tda/(.*)",
  "/api/evolution/(.*)",
  "/api/simulate(.*)",
  "/api/cron/(.*)",
  "/api/clerk/(.*)",
  "/api/commentary(.*)",
  "/api/correlation(.*)",
  "/api/googl-fill(.*)",
  "/api/observation/(.*)",
  "/api/optimise(.*)",
  "/api/prices(.*)",
  "/api/stream/(.*)",
  "/api/analyse(.*)",
  "/index.html",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  // Require authentication on all non-public routes
  await auth.protect();

  // Admin routes require the user to have admin role in Clerk metadata
  if (isAdminRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      // Not signed in — auth.protect() already handles this, but be explicit
      return;
    }

    // Check Clerk privateMetadata.role
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const role = user.privateMetadata?.role || "authenticated";

      if (role !== "admin") {
        // Redirect non-admin users to the home page
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return Response.redirect(url);
      }
    } catch (err) {
      // If Clerk lookup fails, deny access
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
