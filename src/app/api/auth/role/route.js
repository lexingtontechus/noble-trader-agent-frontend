import { getRoleInfo } from "@/lib/clerk-metadata";

/**
 * GET /api/auth/role
 *
 * Returns the authenticated user's role from Clerk private metadata.
 * Used by the client to verify/gate role-based UI elements.
 *
 * Response shape matches useRole() hook for consistency:
 * { role, isAdmin, isTrader, isViewer, isLoaded }
 */
export async function GET() {
  try {
    const roleInfo = await getRoleInfo();
    return Response.json(roleInfo);
  } catch (err) {
    return Response.json(
      {
        role: "unauthenticated",
        isAdmin: false,
        isTrader: false,
        isViewer: false,
        isLoaded: true,
        error: err.message,
      },
      { status: 401 },
    );
  }
}
