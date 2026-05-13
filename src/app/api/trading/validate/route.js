import { validateTrade } from "@/lib/trade-validation";

/**
 * POST /api/trading/validate
 * Run walk-forward validation on a trade recommendation before execution.
 * Body: { tradeId: string } OR { symbol: string, side: string, prices?: number[] }
 * Also accepts both tradeId + symbol/side for fallback when DB id lookup fails.
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await validateTrade(body);
    return Response.json({
      tradeId: body.tradeId || null,
      ...result,
    });
  } catch (error) {
    console.error("Validation error:", error);
    // Try to mark trade as error if we have a DB-valid tradeId
    if (body.tradeId) {
      try {
        const { db } = await import("@/lib/db");
        // First try by id, then by symbol+side fallback
        let trade = await db.tradeRecommendation.findUnique({ where: { id: body.tradeId } });
        if (!trade && body.symbol && body.side) {
          trade = await db.tradeRecommendation.findFirst({
            where: { symbol: body.symbol, side: body.side, status: "pending" },
            orderBy: { createdAt: "desc" },
          });
        }
        if (trade) {
          await db.tradeRecommendation.update({
            where: { id: trade.id },
            data: {
              validationStatus: "error",
              validationDetails: JSON.stringify({ error: error.message }),
              validatedAt: new Date(),
            },
          });
        }
      } catch {}
    }
    return Response.json(
      {
        error: `Validation failed: ${error.message}`,
        passed: false,
        score: 0,
        source: "error",
      },
      { status: 200 } // Return 200 with error info so UI can display it gracefully
    );
  }
}
