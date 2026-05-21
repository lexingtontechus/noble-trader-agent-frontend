import { db } from "@/lib/db";
import { withAuth } from "@/lib/withAuth";

/**
 * POST /api/trading/approve-all
 * Approve all pending recommendations for an analysis run.
 * Body: { analysisId: string }
 */
export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { analysisId } = body;

    if (!analysisId) {
      return Response.json(
        { error: "analysisId is required" },
        { status: 400 }
      );
    }

    const result = await db.tradeRecommendation.updateMany({
      where: {
        analysisId,
        status: "pending",
      },
      data: { status: "approved" },
    });

    return Response.json({
      approved: result.count,
      analysisId,
    });
  } catch (error) {
    console.error("Approve all error:", error);
    return Response.json(
      { error: `Failed to approve trades: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
