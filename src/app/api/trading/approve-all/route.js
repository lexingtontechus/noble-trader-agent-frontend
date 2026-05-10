import { db } from "@/lib/db";

/**
 * POST /api/trading/approve-all
 * Approve all pending recommendations for an analysis run.
 * Body: { analysisId: string }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { analysisId } = body;

    if (!analysisId) {
      return Response.json(
        { error: "analysisId is required" },
        { status: 400 }
      );
    }

    let result = { count: 0 };
    try {
      if (db?.tradeRecommendation) {
        result = await db.tradeRecommendation.updateMany({
          where: {
            analysisId,
            status: "pending",
          },
          data: { status: "approved" },
        });
      }
    } catch (dbErr) {
      console.error("DB approve all failed:", dbErr.message);
    }

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
}
