/**
 * GET /api/evolution/performance
 * Get performance records for a variant (or all variants).
 *
 * Query params:
 *   variantId?: string (if omitted, returns the active variant's performance)
 *   limit?: number (default 100)
 *   source?: string ('live' or 'backtest')
 */
import { getPerformance, getActiveVariant } from "@/lib/strategy-evolution";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const source = searchParams.get("source") || null;

    let targetVariantId = variantId;
    if (!targetVariantId) {
      const active = await getActiveVariant();
      targetVariantId = active?.id;
    }

    if (!targetVariantId) {
      return Response.json({ records: [], variantId: null });
    }

    const records = await getPerformance(targetVariantId, { limit, source });

    return Response.json({ records, variantId: targetVariantId });
  } catch (error) {
    console.error("Get performance error:", error);
    return Response.json(
      { error: `Failed to get performance: ${error.message}` },
      { status: 500 }
    );
  }
}
