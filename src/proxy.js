import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Proxy (middleware) for Next.js 16.
 *
 * - All /api/ routes are PUBLIC — each route handler does its own auth
 *   (e.g. getAlpacaKeys() calls Clerk's auth(), or CRON_SECRET for cron jobs).
 * - Non-API routes require Clerk authentication.
 *
 * In development mode, Clerk blocks non-browser requests (e.g. curl, cron)
 * unless routes are explicitly marked as public.
 */
export default clerkMiddleware(
  async (auth, request) => {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");

    if (!isApi) {
      // Non-API routes require Clerk auth
      await auth.protect();
    }
    // API routes are public — each handler does its own auth
  },
  {
    // Explicitly mark all API routes as public so Clerk doesn't
    // block curl/cron requests in development mode
    publicRoutes: ["/api/(.*)"],
  }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
