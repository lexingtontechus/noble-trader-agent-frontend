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
  "/api/correlation/(.*)",
  "/api/googl-fill(.*)",
  "/api/observation/(.*)",
  "/api/optimise/(.*)",
  "/api/prices(.*)",
  "/api/stream/(.*)",
  "/api/analyse(.*)",
  "/index.html",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin/(.*)",
  "/api/kill-switch(.*)",
  "/api/mode(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // For admin routes, also check org role if available
  if (isAdminRoute(request)) {
    const { sessionClaims } = await auth();
    const orgRole = sessionClaims?.org_role;
    const userRole = sessionClaims?.role || sessionClaims?.metadata?.role;

    // Allow access if user has admin role OR org:admin role
    const isAdmin = userRole === "admin" || orgRole === "org:admin";
    if (!isAdmin) {
      // Redirect non-admin users away from admin routes
      const url = new URL(request.url);
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
