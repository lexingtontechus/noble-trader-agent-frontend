import { db } from "@/lib/db";
import { validateTrade } from "@/lib/trade-validation";

/**
 * POST /api/trading/approve
 * Approve or block a trade recommendation.
 * Phase 3: When approving, auto-validate first (walk-forward backtest check).
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

    // Phase 3: Auto-validate on approve if not yet validated
    let validationInfo = null;
    if (action === "approve" && !trade.validationStatus) {
      try {
        validationInfo = await validateTrade({ tradeId });
        // Validation ran — result is stored in DB automatically
      } catch (validateErr) {
        // Validation failed (non-blocking) — still allow approval
        console.error("Auto-validation failed (non-blocking):", validateErr.message);
        try {
          await db.tradeRecommendation.update({
            where: { id: tradeId },
            data: {
              validationStatus: "error",
              validationDetails: JSON.stringify({ error: "Auto-validation call failed", message: validateErr.message }),
              validatedAt: new Date(),
            },
          });
        } catch {}
      }
    } else if (action === "approve" && trade.validationStatus) {
      // Already validated — include existing result
      validationInfo = {
        passed: trade.validationStatus === "passed",
        score: trade.validationScore || 0,
        details: trade.validationDetails ? JSON.parse(trade.validationDetails) : {},
        cached: true,
      };
    }

    const updated = await db.tradeRecommendation.update({
      where: { id: tradeId },
      data: { status: action === "approve" ? "approved" : "blocked" },
    });

    return Response.json({
      ...updated,
      ...(validationInfo ? { validation: validationInfo } : {}),
    });
  } catch (error) {
    console.error("Approve trade error:", error);
    return Response.json(
      { error: `Failed to update trade: ${error.message}` },
      { status: 500 }
    );
  }
}
