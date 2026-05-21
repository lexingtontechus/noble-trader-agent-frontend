/**
 * API Route: POST /api/reconciliation/run
 *
 * Run reconciliation for the current user (trader+).
 * Accepts optional dateFrom/dateTo (defaults to today).
 * Calls reconcile(), logs result, returns reconciliation report.
 * If critical discrepancies found, auto-activates halt.
 */

import { withAuth } from "@/lib/withAuth";
import { reconcile } from "@/lib/reconciliation";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";

export const POST = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;

    // Parse body
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK — use defaults
    }

    // Default date range: today
    const today = new Date();
    const dateFrom = body.dateFrom || new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const dateTo = body.dateTo || new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    // Resolve Alpaca keys for fill verification
    let alpacaKeys = null;
    try {
      const credentialType = await resolveCredentialType(request);
      const keys = await getAlpacaCredentialKeys(credentialType, request);
      if (keys?.apiKey && keys?.secretKey) {
        alpacaKeys = {
          apiKey: keys.apiKey,
          secretKey: keys.secretKey,
          mode: credentialType,
        };
      }
    } catch {
      // Alpaca keys not available — reconciliation still works with audit log only
    }

    // Run reconciliation
    const result = await reconcile({
      userId,
      dateFrom,
      dateTo,
      alpacaKeys,
      triggeredBy: authContext.isCron ? "auto" : "manual",
    });

    return Response.json(result);
  } catch (error) {
    console.error("[reconciliation/run] Error:", error.message);
    return Response.json(
      { error: `Reconciliation failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
