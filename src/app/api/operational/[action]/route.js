/**
 * BFF Route: /api/operational/[action]
 * Proxies requests to the FastAPI backend /operational/* endpoints.
 * Handles auth, Render cold starts, and error recovery.
 *
 * Phase 8 P0: Kill Switch, Audit Log, Mode Toggle, Reconciliation
 * Phase P3-5B: Kill switch audit logging added
 *
 * Auth: GET (status queries) require viewer+, POST (mutations) require admin+.
 */

import { withAuth } from "@/lib/withAuth";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { FASTAPI_BASE } from "@/lib/config";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";

const OPERATIONAL_BASE = `${FASTAPI_BASE}/operational`;

// Actions that use GET (query/status endpoints)
const GET_ACTIONS = new Set([
  "kill-switch-status",
  "audit-log",
  "audit-log-summary",
  "audit-log-export",
  "mode",
  "mode-health",
  "reconcile-status",
  "reconcile-positions",
  "executor-status",
  "throttle-status",
]);

// Kill switch actions that require audit logging
const KILL_SWITCH_AUDIT_MAP = {
  "kill-switch-activate": AUDIT_EVENTS.KILL_SWITCH_ACTIVATED,
  "kill-switch-deactivate": AUDIT_EVENTS.KILL_SWITCH_DEACTIVATED,
  "kill-switch-cancel-all": AUDIT_EVENTS.KILL_SWITCH_ACTIVATED,
  "kill-switch-close-all": AUDIT_EVENTS.KILL_SWITCH_ACTIVATED,
};

// Map frontend action to backend path
function actionToPath(action) {
  const mapping = {
    // Kill Switch
    "kill-switch-status": "/kill-switch/status",
    "kill-switch-activate": "/kill-switch/activate",
    "kill-switch-deactivate": "/kill-switch/deactivate",
    "kill-switch-cancel-all": "/kill-switch/cancel-all",
    "kill-switch-close-all": "/kill-switch/close-all",
    // Audit Log
    "audit-log": "/audit-log",
    "audit-log-summary": "/audit-log/summary",
    "audit-log-export": "/audit-log/export",
    // Mode
    "mode": "/mode",
    "mode-request": "/mode/request",
    "mode-confirm": "/mode/confirm",
    "mode-health": "/mode/health",
    // Reconciliation
    "reconcile-status": "/reconcile/status",
    "reconcile-run": "/reconcile/run",
    "reconcile-order": "/reconcile/order",
    "reconcile-positions": "/reconcile/positions",
    // Executor + Throttle
    "executor-status": "/executor/status",
    "throttle-status": "/throttle/status",
  };
  return mapping[action] || `/${action}`;
}

async function proxyRequest(request, params, authContext) {
  const { action } = await params;
  const url = new URL(request.url);
  const backendPath = actionToPath(action);

  // Build backend URL with query params
  const backendUrl = `${OPERATIONAL_BASE}${backendPath}?${url.searchParams.toString()}`;

  // Determine method: GET for status/query endpoints, POST for mutations
  const isGet = GET_ACTIONS.has(action);
  const method = isGet ? "GET" : "POST";

  // Get auth headers
  const authHeaders = await getFastAPIAuthHeaders();

  // Capture body for audit logging + forwarding
  let requestBody = null;
  if (!isGet && request.body) {
    try {
      requestBody = await request.json();
    } catch {
      // No body or invalid JSON
    }
  }

  const fetchOptions = {
    method,
    headers: {
      ...authHeaders,
      ...(!isGet && { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(30000),
  };

  // Forward body for POST requests
  if (!isGet && requestBody) {
    fetchOptions.body = JSON.stringify(requestBody);
  }

  // Retry logic for Render cold starts
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(backendUrl, fetchOptions);

      // Handle HTML responses from Render spin-up
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        if (i === maxRetries - 1) {
          return Response.json(
            {
              error: "Backend service is starting up. Please try again in a moment.",
              code: "COLD_START",
            },
            { status: 503 }
          );
        }
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }

      // For CSV export, stream the response directly
      if (contentType.includes("text/csv")) {
        const text = await res.text();
        return new Response(text, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": res.headers.get("Content-Disposition") || "attachment; filename=audit_log.csv",
          },
        });
      }

      if (res.ok) {
        const data = await res.json();

        // P3-5B: Audit logging for kill switch actions
        const auditEventType = KILL_SWITCH_AUDIT_MAP[action];
        if (auditEventType) {
          logAuditEvent({
            eventType: auditEventType,
            userId: authContext?.userId,
            metadata: {
              action,
              level: requestBody?.level,
              scope: requestBody?.scope,
              reason: requestBody?.reason,
              responseSummary: typeof data === "object" ? Object.keys(data).join(",") : "ok",
            },
          });
        }

        return Response.json(data);
      }

      // Forward error from backend
      const errorData = await res.json().catch(() => ({
        detail: res.statusText,
      }));
      return Response.json(
        { error: errorData.detail || `Backend error: HTTP ${res.status}` },
        { status: res.status }
      );
    } catch (e) {
      if (i === maxRetries - 1) {
        return Response.json(
          { error: `Backend unavailable: ${e.message}`, code: "TIMEOUT" },
          { status: 504 }
        );
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

export const GET = withAuth(async (request, { params }, authContext) => proxyRequest(request, params, authContext), { minRole: "viewer" });
export const POST = withAuth(async (request, { params }, authContext) => proxyRequest(request, params, authContext), { minRole: "admin" });
