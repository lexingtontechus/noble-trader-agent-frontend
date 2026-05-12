import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",
  // Cron/webhook routes — called by external services without user sessions
  "/api/cron/(.*)",
  "/api/telegram/(.*)",
  // Trading engine routes — called by FastAPI backend without user sessions
  "/api/trading/(.*)",
  // Data routes — may be called without auth (market data, etc.)
  "/api/prices(.*)",
  "/api/stream/(.*)",
  "/api/commentary(.*)",
  "/api/correlation/(.*)",
  "/api/googl-fill(.*)",
  "/api/observation/(.*)",
  "/api/optimise/(.*)",
  "/api/analyse(.*)",
  "/api/simulate(.*)",
  "/api/tda/(.*)",
  "/api/evolution/(.*)",
  "/api/portfolio/(.*)",
  "/api/auth/(.*)",
  "/index.html",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
