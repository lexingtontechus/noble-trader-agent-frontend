/**
 * API Route: GET /api/reconciliation/history
 *
 * Get past reconciliation results (viewer+).
 * Queries reconciliation_results table for past runs.
 *
 * Query params:
 *   limit — max results (default 20, max 100)
 */

import { withAuth } from "@/lib/withAuth";
import { getReconciliationHistory } from "@/lib/reconciliation";

export const GET = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    const history = await getReconciliationHistory({ userId, limit });

    return Response.json({ history });
  } catch (error) {
    console.error("[reconciliation/history] Error:", error.message);
    return Response.json(
      { error: `Failed to fetch reconciliation history: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
