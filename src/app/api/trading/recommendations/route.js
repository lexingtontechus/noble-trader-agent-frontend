import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getOrders } from "@/lib/alpaca-client";
import { db } from "@/lib/db";

/**
 * GET /api/trading/recommendations
 * Get trade recommendations for the latest (or specified) analysis run.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get("analysisId");

    let analysis = null;
    if (analysisId) {
      analysis = await db.analysisRun.findUnique({ where: { id: analysisId } });
    } else {
      analysis = await db.analysisRun.findFirst({
        where: { status: "completed" },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!analysis) {
      return Response.json({ recommendations: [], analysisId: null });
    }

    const trades = await db.tradeRecommendation.findMany({
      where: { analysisId: analysis.id },
      orderBy: { priority: "asc" },
    });

    return Response.json({
      analysisId: analysis.id,
      recommendations: trades,
      analysis: {
        status: analysis.status,
        createdAt: analysis.createdAt,
        results: analysis.results ? JSON.parse(analysis.results) : null,
      },
    });
  } catch (error) {
    console.error("Get recommendations error:", error);
    return Response.json(
      { error: `Failed to get recommendations: ${error.message}` },
      { status: 500 }
    );
  }
}
