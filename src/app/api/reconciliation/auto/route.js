/**
 * API Route: POST /api/reconciliation/auto
 *
 * Toggle auto-reconciliation (admin+).
 * When enabled, reconciliation runs automatically at market close (4:05 PM ET).
 * Stores the setting in Supabase reconciliation_auto_config table.
 *
 * Body:
 *   enabled  — boolean (required)
 *   time     — HH:MM format (default: "16:05")
 */

import { withAuth } from "@/lib/withAuth";
import { getAutoReconSetting, setAutoReconSetting } from "@/lib/reconciliation";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";

export const GET = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;
    const setting = await getAutoReconSetting({ userId });
    return Response.json(setting);
  } catch (error) {
    console.error("[reconciliation/auto] GET error:", error.message);
    return Response.json(
      { error: `Failed to fetch auto-recon setting: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });

export const POST = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;
    const body = await request.json();

    if (typeof body.enabled !== "boolean") {
      return Response.json(
        { error: "enabled (boolean) is required" },
        { status: 400 }
      );
    }

    const time = body.time || "16:05";
    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return Response.json(
        { error: "time must be in HH:MM format" },
        { status: 400 }
      );
    }

    const result = await setAutoReconSetting({
      userId,
      enabled: body.enabled,
      time,
    });

    // Audit log
    logAuditEvent({
      eventType: AUDIT_EVENTS.MODE_CHANGED,
      userId,
      metadata: {
        change: "auto_reconciliation",
        enabled: body.enabled,
        time,
      },
    });

    return Response.json(result);
  } catch (error) {
    console.error("[reconciliation/auto] POST error:", error.message);
    return Response.json(
      { error: `Failed to update auto-recon setting: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });
