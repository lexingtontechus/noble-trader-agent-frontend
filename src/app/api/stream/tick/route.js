import { pushTick } from "@/lib/fastapi-client";

/**
 * POST /api/stream/tick
 * Push a price tick to a seeded streaming session and receive a regime snapshot.
 * Body: { symbol, price, ts? }
 *
 * If the session doesn't exist on the FastAPI backend (e.g. it was evicted),
 * returns a 404 with a hint to re-seed.
 */
export async function POST(request) {
  let symbol = null;

  try {
    const body = await request.json();
    symbol = body.symbol;
    const { price, ts } = body;

    if (!symbol || price == null) {
      return Response.json(
        { error: "symbol and price required" },
        { status: 400 },
      );
    }

    if (typeof price !== "number" || price <= 0) {
      return Response.json(
        { error: "price must be a positive number" },
        { status: 400 },
      );
    }

    const tickResponse = await pushTick(symbol, price, ts);
    return Response.json(tickResponse);
  } catch (error) {
    console.error("Stream tick error:", error);

    // Check if it's a session-not-found error from FastAPI
    const message = error.message || "";
    if (
      message.includes("not found") ||
      message.includes("no session") ||
      message.includes("404")
    ) {
      return Response.json(
        {
          error: `No active streaming session for ${symbol || "unknown"}. Re-seed the session first.`,
          needsReseed: true,
        },
        { status: 404 },
      );
    }

    return Response.json(
      { error: `Tick push failed: ${message}` },
      { status: 500 },
    );
  }
}
