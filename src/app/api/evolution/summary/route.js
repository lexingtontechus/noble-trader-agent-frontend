/**
 * GET /api/evolution/summary
 * Get a summary of the strategy evolution state for the UI.
 */
import { getEvolutionSummary } from "@/lib/strategy-evolution";

export async function GET() {
  try {
    const summary = await getEvolutionSummary();
    return Response.json(summary);
  } catch (error) {
    console.error("Evolution summary error:", error);
    return Response.json(
      { error: `Failed to get evolution summary: ${error.message}` },
      { status: 500 }
    );
  }
}
