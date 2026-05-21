/**
 * API Route: /api/circuit-breakers/halts
 *
 * GET — List active halts (viewer+)
 */

import { withAuth } from "@/lib/withAuth";
import { getActiveHalts, isHalted } from "@/lib/circuit-breaker";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level") || undefined;
    const scope = searchParams.get("scope") || undefined;

    const [halts, haltStatus] = await Promise.all([
      getActiveHalts({ level, scope }),
      isHalted({ userId }),
    ]);

    return Response.json({
      halts,
      isHalted: haltStatus.halted,
      haltInfo: haltStatus.halted ? haltStatus : null,
    });
  } catch (error) {
    console.error("[circuit-breakers/halts] GET error:", error.message);
    return Response.json(
      { error: `Failed to fetch active halts: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
