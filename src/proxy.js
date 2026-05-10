import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Proxy (middleware) for Next.js 16 + Clerk.
 *
 * API routes are excluded from the matcher so Clerk never touches them.
 * Each API route handler does its own auth (CRON_SECRET, Clerk auth(), etc.).
 * Only non-API routes go through Clerk's auth protection.
 */

const isPublicRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  // Only match non-API, non-static routes — Clerk processes these
  // API routes are NOT matched, so they bypass Clerk entirely
  matcher: [
    "/((?!api|trpc|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
