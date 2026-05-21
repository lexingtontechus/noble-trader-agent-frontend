/**
 * API Route: /api/circuit-breakers/halts/deactivate
 *
 * POST — Deactivate a halt (admin+ only)
 * Body: { haltId: string } or { deactivateAll: true }
 */

import { withAuth } from "@/lib/withAuth";
import { deactivateHalt, deactivateAllHalts } from "@/lib/circuit-breaker";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const body = await request.json();

    if (body.deactivateAll) {
      const result = await deactivateAllHalts({ userId });
      return Response.json(result);
    }

    const { haltId } = body;
    if (!haltId) {
      return Response.json({ error: "haltId is required" }, { status: 400 });
    }

    await deactivateHalt({ haltId });
    return Response.json({ success: true });
  } catch (error) {
    console.error("[circuit-breakers/halts/deactivate] POST error:", error.message);
    return Response.json(
      { error: `Failed to deactivate halt: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });
