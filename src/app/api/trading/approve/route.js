import { db } from "@/lib/db";

/**
 * POST /api/trading/approve
 * Approve or block a trade recommendation.
 * Body: { tradeId: string, action: "approve" | "block" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tradeId, action } = body;

    if (!tradeId || !action) {
      return Response.json(
        { error: "tradeId and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "block"].includes(action)) {
      return Response.json(
        { error: "action must be 'approve' or 'block'" },
        { status: 400 }
      );
    }

    let trade = null;
    try {
      if (db?.tradeRecommendation) {
        trade = await db.tradeRecommendation.findUnique({
          where: { id: tradeId },
        });
      }
    } catch (dbErr) {
      console.error("DB find trade failed:", dbErr.message);
    }

    if (!trade) {
      return Response.json(
        { error: "Trade recommendation not found", tradeId, action },
        { status: 404 }
      );
    }

    let updated = null;
    try {
      if (db?.tradeRecommendation) {
        updated = await db.tradeRecommendation.update({
          where: { id: tradeId },
          data: { status: action === "approve" ? "approved" : "blocked" },
        });
      }
    } catch (dbErr) {
      console.error("DB update trade failed:", dbErr.message);
    }

    return Response.json(updated || { id: tradeId, status: action === "approve" ? "approved" : "blocked" });
  } catch (error) {
    console.error("Approve trade error:", error);
    return Response.json(
      { error: `Failed to update trade: ${error.message}` },
      { status: 500 }
    );
  }
}
