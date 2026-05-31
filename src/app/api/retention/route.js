/**
 * Retention & GDPR API Routes
 *
 * GET  /api/retention/status     — Get retention status for all tables (admin)
 * POST /api/retention/run        — Run retention jobs manually (admin)
 * POST /api/retention/gdpr-purge — GDPR right to erasure (admin)
 */

import { withAuth } from "@/lib/withAuth";
import {
  runAllRetentionJobs,
  getRetentionStatus,
  gdprPurgeUser,
  RETENTION_POLICIES,
} from "@/lib/retention";

// ── GET: Retention Status ────────────────────────────────────────────────────

export const GET = withAuth(async (request, context, authContext) => {
  const status = await getRetentionStatus();

  return Response.json({
    policies: RETENTION_POLICIES,
    status,
  });
}, { minRole: "admin", rateTier: "admin" });

// ── POST: Run Retention Jobs or GDPR Purge ───────────────────────────────────

export const POST = withAuth(async (request, context, authContext) => {
  const { role } = authContext;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "run_retention") {
      // Run all retention jobs (archive + purge)
      const results = await runAllRetentionJobs();
      return Response.json({
        success: true,
        action: "run_retention",
        results,
      });
    }

    if (action === "gdpr_purge") {
      // GDPR right to erasure — requires explicit userId and reason
      const { userId: targetUserId, reason } = body;

      if (!targetUserId) {
        return Response.json(
          { error: "userId is required for GDPR purge" },
          { status: 400 }
        );
      }

      if (!reason) {
        return Response.json(
          { error: "reason is required for GDPR purge (e.g., 'gdpr_request', 'account_deletion')" },
          { status: 400 }
        );
      }

      // Double-check: only admins can perform GDPR purge
      if (role !== "admin") {
        return Response.json(
          { error: "Only admins can perform GDPR purge" },
          { status: 403 }
        );
      }

      const result = await gdprPurgeUser(targetUserId, reason);
      return Response.json({
        success: true,
        action: "gdpr_purge",
        ...result,
      });
    }

    return Response.json(
      { error: "Unknown action. Use 'run_retention' or 'gdpr_purge'" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[retention] POST error:", err.message);
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}, { minRole: "admin", rateTier: "admin" });
