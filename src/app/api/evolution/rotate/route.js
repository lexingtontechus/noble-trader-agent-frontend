/**
 * POST /api/evolution/rotate
 * Check if the active variant should be rotated and perform rotation if needed.
 * Can also be called with a specific variantId to force-activate.
 *
 * Body: {
 *   variantId?: string,   (force-activate this variant)
 *   reason?: string,      (reason for manual rotation)
 *   auto?: boolean        (if true, run automatic rotation check)
 * }
 */
import { checkAndRotate, activateVariant } from "@/lib/strategy-evolution";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json() || {};
    const { variantId, reason, auto } = body;

    // Force-activate a specific variant
    if (variantId) {
      const activated = await activateVariant(
        variantId,
        "manual",
        reason || "Manually activated via API"
      );
      return Response.json({
        rotated: true,
        reason: reason || "Manual activation",
        newVariant: activated,
      });
    }

    // Automatic rotation check
    if (auto !== false) {
      const result = await checkAndRotate();
      return Response.json(result);
    }

    return Response.json({ rotated: false, reason: "No action specified" });
  } catch (error) {
    console.error("Rotation error:", error);
    return Response.json(
      { error: `Rotation failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });
