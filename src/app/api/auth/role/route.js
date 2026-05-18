import { isAdmin, getUserRole } from "@/lib/clerk-metadata";

/**
 * GET /api/auth/role
 *
 * Returns the authenticated user's role from Clerk private metadata.
 * Used by the client to gate admin-only UI elements.
 *
 * Response: { role: string, isAdmin: boolean }
 */
export async function GET() {
  try {
    const role = await getUserRole();
    return Response.json({ role, isAdmin: role === "admin" });
  } catch (err) {
    return Response.json(
      { role: "unauthenticated", isAdmin: false, error: err.message },
      { status: 401 }
    );
  }
}
