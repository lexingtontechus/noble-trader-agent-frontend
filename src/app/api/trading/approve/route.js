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

    const trade = await db.tradeRecommendation.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      return Response.json(
        { error: "Trade recommendation not found", tradeId, action },
        { status: 404 }
      );
    }

    const updated = await db.tradeRecommendation.update({
      where: { id: tradeId },
      data: { status: action === "approve" ? "approved" : "blocked" },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Approve trade error:", error);
    return Response.json(
      { error: `Failed to update trade: ${error.message}` },
      { status: 500 }
    );
  }
}
