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
