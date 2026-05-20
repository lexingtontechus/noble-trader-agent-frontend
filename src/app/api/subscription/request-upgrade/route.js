/**
 * API Route: /api/subscription/request-upgrade
 *
 * Temporary manual upgrade request endpoint.
 * Used until Helio self-serve checkout is fully integrated.
 * Creates a record that admin can approve.
 *
 * In production, this will be replaced by the Helio checkout flow.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!["premium", "institutional"].includes(plan)) {
      return Response.json({ error: "Invalid plan" }, { status: 400 });
    }

    // For now, store the upgrade request in Clerk privateMetadata
    // Admin can review and approve manually
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        upgrade_requested: plan,
        upgrade_requested_at: new Date().toISOString(),
      },
    });

    // TODO: Send notification to admin (Discord webhook, email, etc.)

    return Response.json({
      success: true,
      message: `Upgrade request to ${plan} submitted. An admin will review your request.`,
      plan,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
