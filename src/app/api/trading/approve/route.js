import { validateTrade } from "@/lib/trade-validation";

/**
 * Parse a synthetic trade id like "sell-AAPL-1778554793607" or "buy-DIA-1778554793607"
 * Returns { side, symbol } or null if not parseable.
 */
function parseSyntheticTradeId(tradeId) {
  if (!tradeId || typeof tradeId !== "string") return null;
  const match = tradeId.match(/^(buy|sell|short)-([A-Z]+)-/i);
  if (match) {
    return { side: match[1].toLowerCase(), symbol: match[2].toUpperCase() };
  }
  return null;
}

/**
 * POST /api/trading/approve
 * Approve, block, or mark-executed a trade recommendation.
 * Phase 3: When approving, auto-validate first (walk-forward backtest check).
 * DB-resilient: handles database unavailability gracefully.
 * Body: { tradeId: string, action: "approve" | "block" | "executed", symbol?, side?, alpacaOrderId? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tradeId, action, symbol, side, alpacaOrderId } = body;

    if (!tradeId || !action) {
      return Response.json(
        { error: "tradeId and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "block", "executed"].includes(action)) {
      return Response.json(
        { error: "action must be 'approve', 'block', or 'executed'" },
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

      // If not found by primary id, try fallback by symbol + side
      if (!trade) {
        const parsed = parseSyntheticTradeId(tradeId);
        const lookupSymbol = symbol || parsed?.symbol;
        const lookupSide = side || parsed?.side;
        if (lookupSymbol && lookupSide) {
          console.warn("Trade not found by id:", tradeId, "— trying symbol+side fallback:", lookupSymbol, lookupSide);
          const statusFilter = action === "executed" ? "approved" : "pending";
          trade = await db.tradeRecommendation.findFirst({
            where: { symbol: lookupSymbol, side: lookupSide, status: statusFilter },
            orderBy: { createdAt: "desc" },
          });
        }
      }
    } catch (dbErr) {
      console.error("Database lookup failed:", dbErr.message);
      dbAvailable = false;
    }

    // Handle "executed" action — update with Alpaca order id
    if (action === "executed") {
      if (dbAvailable && trade) {
        try {
          const { db } = await import("@/lib/db");
          await db.tradeRecommendation.update({
            where: { id: trade.id },
            data: {
              status: "executing",
              alpacaOrderId: alpacaOrderId || null,
            },
          });
        } catch (dbErr) {
          console.error("Failed to update trade to executing:", dbErr.message);
        }
      }
      return Response.json({
        id: trade?.id || tradeId,
        status: "executing",
        alpacaOrderId: alpacaOrderId || null,
        db_warning: !trade ? "Trade not found in DB — execution status not persisted" : undefined,
      });
    }

    if (!trade && dbAvailable) {
      // Trade not found — return synthetic response instead of 404
      // This allows the frontend flow to continue even if DB lookup fails
      console.warn("Trade not found in DB for approve/block:", tradeId);
    }

    // Phase 3: Auto-validate on approve if not yet validated
    let validationInfo = null;
    if (action === "approve") {
      if (trade && !trade.validationStatus) {
        // Trade exists in DB but not yet validated
        try {
          validationInfo = await validateTrade({ tradeId: trade.id, symbol: trade.symbol, side: trade.side });
        } catch (validateErr) {
          console.error("Auto-validation failed (non-blocking):", validateErr.message);
          if (dbAvailable) {
            try {
              const { db } = await import("@/lib/db");
              await db.tradeRecommendation.update({
                where: { id: trade.id },
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
      } else {
        // Trade not in DB — try validation with symbol/side params
        const parsed = parseSyntheticTradeId(tradeId);
        const vSymbol = symbol || parsed?.symbol;
        const vSide = side || parsed?.side;
        if (vSymbol) {
          try {
            validationInfo = await validateTrade({ tradeId, symbol: vSymbol, side: vSide });
          } catch (validateErr) {
            console.error("Auto-validation failed (trade not in DB):", validateErr.message);
            validationInfo = {
              passed: false,
              score: 0,
              details: { error: validateErr.message },
              source: "error",
            };
          }
        }
      }
    }

    // Update trade status in DB
    let updated = null;
    if (dbAvailable && trade) {
      try {
        const { db } = await import("@/lib/db");
        updated = await db.tradeRecommendation.update({
          where: { id: trade.id },
          data: { status: action === "approve" ? "approved" : "blocked" },
        });
      } catch (dbErr) {
        console.error("Failed to update trade status:", dbErr.message);
      }
    }

    // If DB update didn't happen, return a synthetic response
    if (!updated) {
      return Response.json({
        id: tradeId,
        status: action === "approve" ? "approved" : "blocked",
        db_warning: dbAvailable ? "Trade not found in DB — status not persisted" : "Database temporarily unavailable — status not persisted",
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
