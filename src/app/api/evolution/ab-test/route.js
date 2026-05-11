/**
 * GET /api/evolution/ab-test
 * Get the active A/B test (if any) and which variant to use for a given symbol.
 *
 * Query params:
 *   symbol?: string (for deterministic assignment)
 *
 * POST /api/evolution/ab-test
 * Create a new A/B test.
 *
 * Body: {
 *   name: string,
 *   variantAId: string,
 *   variantBId: string,
 *   allocationPct?: number (default 0.5)
 * }
 *
 * DELETE /api/evolution/ab-test
 * Complete (stop) an A/B test and determine the winner.
 *
 * Body: { testId: string, activateWinner?: boolean }
 */
import { createABTest, getActiveABTest, completeABTest, activateVariant } from "@/lib/strategy-evolution";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || null;

    const result = await getActiveABTest(symbol);

    return Response.json({
      test: result.test,
      useVariantId: result.useVariantId,
    });
  } catch (error) {
    console.error("Get A/B test error:", error);
    return Response.json(
      { error: `Failed to get A/B test: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, variantAId, variantBId, allocationPct } = body;

    if (!name || !variantAId || !variantBId) {
      return Response.json(
        { error: "name, variantAId, and variantBId are required" },
        { status: 400 }
      );
    }

    const test = await createABTest({
      name,
      variantAId,
      variantBId,
      allocationPct: allocationPct || 0.5,
    });

    return Response.json({ test }, { status: 201 });
  } catch (error) {
    console.error("Create A/B test error:", error);
    return Response.json(
      { error: `Failed to create A/B test: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { testId, activateWinner } = body;

    if (!testId) {
      return Response.json({ error: "testId is required" }, { status: 400 });
    }

    const completed = await completeABTest(testId);

    // Optionally activate the winning variant
    if (activateWinner && completed.winnerId) {
      await activateVariant(completed.winnerId, "ab_test", `A/B test "${completed.name}" winner`);
    }

    return Response.json({ test: completed });
  } catch (error) {
    console.error("Complete A/B test error:", error);
    return Response.json(
      { error: `Failed to complete A/B test: ${error.message}` },
      { status: 500 }
    );
  }
}
