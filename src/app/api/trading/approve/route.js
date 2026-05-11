import { validateTrade } from "@/lib/trade-validation";

/**
 * POST /api/trading/approve
 * Approve or block a trade recommendation.
 * Phase 3: When approving, auto-validate first (walk-forward backtest check).
 * DB-resilient: handles database unavailability gracefully.
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
    let dbAvailable = true;

    try {
      const { db } = await import("@/lib/db");
      trade = await db.tradeRecommendation.findUnique({
        where: { id: tradeId },
      });
    } catch (dbErr) {
      console.error("Database lookup failed:", dbErr.message);
      dbAvailable = false;
    }

    if (!trade && dbAvailable) {
      return Response.json(
        { error: "Trade recommendation not found", tradeId, action },
        { status: 404 }
      );
    }

    // Phase 3: Auto-validate on approve if not yet validated
    let validationInfo = null;
    if (action === "approve") {
      if (trade && !trade.validationStatus) {
        // Trade exists in DB but not yet validated
        try {
          validationInfo = await validateTrade({ tradeId });
        } catch (validateErr) {
          console.error("Auto-validation failed (non-blocking):", validateErr.message);
          if (dbAvailable) {
            try {
              const { db } = await import("@/lib/db");
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
        }
      } else if (trade && trade.validationStatus) {
        // Already validated — include existing result
        validationInfo = {
          passed: trade.validationStatus === "passed",
          score: trade.validationScore || 0,
          details: trade.validationDetails ? JSON.parse(trade.validationDetails) : {},
          cached: true,
        };
      } else if (!trade) {
        // DB unavailable — try validation with just the tradeId (will use params if DB fails)
        try {
          validationInfo = await validateTrade({ tradeId });
        } catch (validateErr) {
          console.error("Auto-validation failed (DB unavailable):", validateErr.message);
          validationInfo = {
            passed: false,
            score: 0,
            details: { error: validateErr.message },
            source: "error",
          };
        }
      }
    }

    // Update trade status in DB
    let updated = null;
    if (dbAvailable && trade) {
      try {
        const { db } = await import("@/lib/db");
        updated = await db.tradeRecommendation.update({
          where: { id: tradeId },
          data: { status: action === "approve" ? "approved" : "blocked" },
        });
      } catch (dbErr) {
        console.error("Failed to update trade status:", dbErr.message);
      }
    }

    // If DB is unavailable, return a synthetic response
    if (!updated) {
      return Response.json({
        id: tradeId,
        status: action === "approve" ? "approved" : "blocked",
        db_warning: dbAvailable ? "Trade not found" : "Database temporarily unavailable — status not persisted",
        ...(validationInfo ? { validation: validationInfo } : {}),
      });
    }

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
