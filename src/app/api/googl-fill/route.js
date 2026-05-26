/**
 * DEPRECATED — GOOGL Fill Job
 *
 * This was a one-off scheduled job to buy remaining GOOGL shares.
 * It has been completed and should no longer be used.
 *
 * Kept as a stub to avoid 404s if any bookmarks/cron still reference it.
 * Returns a deprecation notice on all requests.
 */

export async function GET() {
  return Response.json({
    status: "deprecated",
    message: "GOOGL fill job has been completed and this endpoint is deprecated. No further action will be taken.",
    completed_at: "2026-05-11",
    migration_note: "Removed in v7.4 — Fluid Compute elimination. If you need scheduled order execution, use /api/trading/schedule/execute with pg_cron.",
  }, { status: 410 }); // 410 Gone
}

export async function POST() {
  return Response.json({
    status: "deprecated",
    message: "GOOGL fill job has been completed and this endpoint is deprecated. No further action will be taken.",
    completed_at: "2026-05-11",
    migration_note: "Removed in v7.4 — Fluid Compute elimination. If you need scheduled order execution, use /api/trading/schedule/execute with pg_cron.",
  }, { status: 410 });
}
