/**
 * API Route: /api/fills/poll
 *
 * POST — Start/stop fill polling for the current user (trader+)
 *   Body: { action: "start" | "stop" }
 *   Start requires Alpaca keys to be configured.
 *
 * GET — Check if fill polling is active (viewer+)
 *   Returns: { active: boolean, lastActivityAt?: number }
 *
 * P3-5B: Trade Execution Audit Trail
 */

import { withAuth } from "@/lib/withAuth";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { startFillPolling, stopFillPolling, isPollingActive } from "@/lib/fill-poller";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const body = await request.json();
    const { action } = body;

    if (!action || !["start", "stop"].includes(action)) {
      return Response.json(
        { error: "action must be 'start' or 'stop'" },
        { status: 400 }
      );
    }

    if (action === "start") {
      // Resolve Alpaca keys
      const credentialType = await resolveCredentialType(request, authContext);
      const keys = await getAlpacaCredentialKeys(credentialType, request, authContext);

      if (!keys?.apiKey || !keys?.secretKey) {
        return Response.json(
          {
            error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
            code: "NO_KEYS",
          },
          { status: 403 }
        );
      }

      const result = startFillPolling({
        userId,
        apiKey: keys.apiKey,
        secretKey: keys.secretKey,
        mode: credentialType,
      });

      return Response.json({
        started: result.started,
        alreadyRunning: result.alreadyRunning || false,
        message: result.started
          ? "Fill polling started. New fills will be logged to the audit trail every 30 seconds."
          : result.alreadyRunning
            ? "Fill polling is already running for your account."
            : "Failed to start fill polling.",
      });
    }

    if (action === "stop") {
      const result = stopFillPolling(userId);
      return Response.json({
        stopped: result.stopped,
        message: result.stopped
          ? "Fill polling stopped."
          : "Fill polling was not active.",
      });
    }
  } catch (error) {
    console.error("[fills/poll] POST error:", error.message);
    return Response.json(
      { error: `Failed to manage fill polling: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { userId } = authContext;
    const status = isPollingActive(userId);

    return Response.json({
      active: status.active,
      lastActivityAt: status.lastActivityAt || null,
    });
  } catch (error) {
    console.error("[fills/poll] GET error:", error.message);
    return Response.json(
      { error: `Failed to check fill polling status: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
