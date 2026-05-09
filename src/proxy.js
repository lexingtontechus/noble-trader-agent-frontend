import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Proxy (middleware) for Next.js 16.
 *
 * All API routes are public — the BFF pattern means each route handler
 * does its own auth checks (e.g. getAlpacaKeys() which calls Clerk's auth()).
 * Non-API routes require Clerk authentication.
 */
export default clerkMiddleware(async (auth, request) => {
  // Check if the request is for an API route
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");

  if (!isApi) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
