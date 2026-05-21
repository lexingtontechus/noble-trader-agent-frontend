/**
 * POST /api/evolution/feedback
 * Record execution feedback for strategy evolution.
 *
 * Called after a trade is executed (or after backtest) to feed results
 * back into the evolution engine.
 *
 * Body: {
 *   variantId?: string,     (defaults to active variant)
 *   symbol: string,
 *   tradeSide: 'buy'|'sell',
 *   entryPrice?: number,
 *   exitPrice?: number,
 *   pnlPct?: number,
 *   pnlDollar?: number,
 *   holdingPeriodBars?: number,
 *   regimeAtEntry?: string,
 *   regimeAtExit?: string,
 *   validationScore?: number,
 *   kellyFractionUsed?: number,
 *   riskScoreAtEntry?: number,
 *   source?: 'live'|'backtest',
 *   tradeId?: string,
 *   analysisId?: string,
 *   metadata?: object
 * }
 */
import { recordPerformance, getActiveVariant } from "@/lib/strategy-evolution";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol } = body;

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    // Resolve variant ID
    let variantId = body.variantId;
    if (!variantId) {
      const active = await getActiveVariant();
      variantId = active?.id;
    }

    if (!variantId || variantId === "default") {
      return Response.json(
        { error: "No active variant found. Run migration SQL first." },
        { status: 400 }
      );
    }

    const record = await recordPerformance({
      variantId,
      symbol,
      tradeSide: body.tradeSide || "buy",
      entryPrice: body.entryPrice,
      exitPrice: body.exitPrice,
      pnlPct: body.pnlPct,
      pnlDollar: body.pnlDollar,
      holdingPeriodBars: body.holdingPeriodBars,
      regimeAtEntry: body.regimeAtEntry,
      regimeAtExit: body.regimeAtExit,
      validationScore: body.validationScore,
      kellyFractionUsed: body.kellyFractionUsed,
      riskScoreAtEntry: body.riskScoreAtEntry,
      source: body.source || "live",
      tradeId: body.tradeId,
      analysisId: body.analysisId,
      metadata: body.metadata,
    });

    return Response.json({ record }, { status: 201 });
  } catch (error) {
    console.error("Feedback error:", error);
    return Response.json(
      { error: `Failed to record feedback: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
