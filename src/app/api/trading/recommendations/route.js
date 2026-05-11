/**
 * GET /api/trading/recommendations
 * Get trade recommendations for the latest (or specified) analysis run.
 * DB-resilient: handles database unavailability gracefully.
 */

export async function GET(request) {
  let dbAvailable = true;
  let db;

  try {
    const mod = await import("@/lib/db");
    db = mod.db;
  } catch (importErr) {
    console.error("DB import failed:", importErr.message);
    dbAvailable = false;
  }

  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get("analysisId");

    let analysis = null;

    if (dbAvailable) {
      try {
        if (analysisId) {
          analysis = await db.analysisRun.findUnique({ where: { id: analysisId } });
        } else {
          analysis = await db.analysisRun.findFirst({
            where: { status: "completed" },
            orderBy: { createdAt: "desc" },
          });
        }
      } catch (dbErr) {
        console.error("Database query failed:", dbErr.message);
        dbAvailable = false;
      }
    }

    if (!dbAvailable) {
      return Response.json({
        recommendations: [],
        analysisId: null,
        db_error: "Database temporarily unavailable. If this persists, check the DATABASE_URL environment variable.",
        db_error_code: "CONNECTION_ERROR",
      });
    }

    if (!analysis) {
      return Response.json({ recommendations: [], analysisId: null });
    }

    let trades = [];
    try {
      trades = await db.tradeRecommendation.findMany({
        where: { analysisId: analysis.id },
        orderBy: { priority: "asc" },
      });
    } catch (dbErr) {
      console.error("Failed to fetch trades:", dbErr.message);
    }

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
