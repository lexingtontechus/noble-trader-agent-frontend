import { validateTrade } from "@/lib/trade-validation";

/**
 * POST /api/trading/validate
 * Run walk-forward validation on a trade recommendation before execution.
 * Body: { tradeId: string } OR { symbol: string, side: string, prices?: number[] }
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
    // Try to mark trade as error
    if (body.tradeId) {
      try {
        const { db } = await import("@/lib/db");
        await db.tradeRecommendation.update({
          where: { id: body.tradeId },
          data: {
            validationStatus: "error",
            validationDetails: JSON.stringify({ error: error.message }),
            validatedAt: new Date(),
          },
        });
      } catch {}
    }
    return Response.json({ error: `Validation failed: ${error.message}` }, { status: 500 });
  }
}
