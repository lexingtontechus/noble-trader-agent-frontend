import { getSessions } from "@/lib/fastapi-client";

/**
 * GET /api/stream/sessions
 * Lists all active streaming sessions on the FastAPI backend.
 *
 * Returns: Array of session objects with symbol, status, tick count, etc.
 */
export async function GET() {
  try {
    const sessions = await getSessions();
    return Response.json(sessions);
  } catch (error) {
    console.error("Stream sessions error:", error);
    return Response.json(
      { error: `Sessions fetch failed: ${error.message}` },
      { status: 500 },
    );
  }
}
