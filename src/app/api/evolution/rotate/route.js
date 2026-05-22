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
 *
 * Auth: Clerk admin (withAuth) OR CRON_SECRET via x-cron-secret header / ?secret= query param.
 * pg_cron calls this without a Clerk session, so CRON_SECRET is the auth mechanism for cron.
 */
import { checkAndRotate, activateVariant } from "@/lib/strategy-evolution";
import { withAuth } from "@/lib/withAuth";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Verify cron secret from header or query param.
 * Returns true if authenticated (or in development without CRON_SECRET).
 */
function verifyCronSecret(request) {
  if (!CRON_SECRET && process.env.NODE_ENV !== "production") return true;
  if (!CRON_SECRET) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

async function handleRotate(request) {
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
}

export async function POST(request) {
  // Cron-triggered request (no Clerk session) — verify CRON_SECRET
  if (verifyCronSecret(request)) {
    return handleRotate(request);
  }

  // User-facing request — require Clerk admin auth
  return withAuth(handleRotate, { minRole: "admin" })(request, {});
}
