/**
 * GET /api/evolution/variants
 * List all strategy variants with their performance scores.
 *
 * Query params:
 *   limit?: number (default 50)
 *   active?: boolean (if true, return only the active variant)
 */
import { getAllVariants, getActiveVariant } from "@/lib/strategy-evolution";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const activeOnly = searchParams.get("active") === "true";

    if (activeOnly) {
      const variant = await getActiveVariant();
      return Response.json({ variants: [variant], active: variant });
    }

    const variants = await getAllVariants({ limit });
    const active = variants.find((v) => v.isActive) || null;

    return Response.json({ variants, active });
  } catch (error) {
    console.error("Get variants error:", error);
    return Response.json(
      { error: `Failed to get variants: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/evolution/variants
 * Create a new strategy variant.
 *
 * Body: {
 *   name: string,
 *   params: object,
 *   parentVariantId?: string,
 *   optimizerParams?: object,
 *   activate?: boolean
 * }
 */
import { createVariant, activateVariant } from "@/lib/strategy-evolution";

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, params, parentVariantId, optimizerParams, activate } = body;

    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const variant = await createVariant({
      name,
      params: params || {},
      parentVariantId: parentVariantId || null,
      optimizerParams: optimizerParams || null,
    });

    if (activate) {
      await activateVariant(variant.id, "manual", `Manually activated ${name}`);
    }

    return Response.json({ variant }, { status: 201 });
  } catch (error) {
    console.error("Create variant error:", error);
    return Response.json(
      { error: `Failed to create variant: ${error.message}` },
      { status: 500 }
    );
  }
}
