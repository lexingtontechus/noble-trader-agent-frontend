import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getOrders } from "@/lib/alpaca-client";
import { db } from "@/lib/db";

/**
 * GET /api/trading/status
 * Check status of all trades in an analysis run, and update from Alpaca.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get("analysisId");

    let targetAnalysisId = analysisId;
    if (!targetAnalysisId) {
      try {
        if (db?.analysisRun) {
          const latest = await db.analysisRun.findFirst({
            where: { status: "completed" },
            orderBy: { createdAt: "desc" },
          });
          targetAnalysisId = latest?.id;
        }
      } catch (dbErr) {
        console.error("DB find analysis failed:", dbErr.message);
      }
    }

    if (!targetAnalysisId) {
      return Response.json({ trades: [], analysisId: null });
    }

    let trades = [];
    if (targetAnalysisId) {
      try {
        if (db?.tradeRecommendation) {
          trades = await db.tradeRecommendation.findMany({
            where: { analysisId: targetAnalysisId },
            orderBy: { priority: "asc" },
          });
        }
      } catch (dbErr) {
        console.error("DB find trades failed:", dbErr.message);
      }
    }

    // Try to update fill statuses from Alpaca
    try {
      const keys = await getAlpacaKeys();
      if (keys?.apiKey && keys?.secretKey) {
        const alpacaOrders = await getOrders(keys.apiKey, keys.secretKey, { status: "all" });
        const orderMap = new Map(
          alpacaOrders.map((o) => [o.id, o])
        );

        for (const trade of trades) {
          if (trade.alpacaOrderId && orderMap.has(trade.alpacaOrderId)) {
            const alpacaOrder = orderMap.get(trade.alpacaOrderId);
            let newStatus = trade.status;

            if (alpacaOrder.status === "filled") newStatus = "filled";
            else if (alpacaOrder.status === "partially_filled") newStatus = "executing";
            else if (alpacaOrder.status === "canceled" || alpacaOrder.status === "rejected") newStatus = "cancelled";
            else if (alpacaOrder.status === "new" || alpacaOrder.status === "accepted") newStatus = "executing";

            if (newStatus !== trade.status) {
              try {
                if (db?.tradeRecommendation) {
                  await db.tradeRecommendation.update({
                    where: { id: trade.id },
                    data: { status: newStatus },
                  });
                }
              } catch (dbErr) {
                console.error("DB update trade status failed:", dbErr.message);
              }
              trade.status = newStatus;
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to update order statuses from Alpaca:", err.message);
    }

    return Response.json({
      analysisId: targetAnalysisId,
      trades,
    });
  } catch (error) {
    console.error("Trade status error:", error);
    return Response.json(
      { error: `Failed to get status: ${error.message}` },
      { status: 500 }
    );
  }
}
