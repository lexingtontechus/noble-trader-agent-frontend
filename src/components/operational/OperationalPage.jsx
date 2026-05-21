"use client";
import { useCallback } from "react";
import SystemHealthDashboard from "./SystemHealthDashboard";
import KillSwitchPanel from "./KillSwitchPanel";
import CircuitBreakerPanel from "./CircuitBreakerPanel";
import AuditLogViewer from "./AuditLogViewer";
import ModeToggle from "./ModeToggle";
import ReconciliationPanel from "./ReconciliationPanel";
import LivePnLDashboard from "./LivePnLDashboard";
import ComplianceReport from "./ComplianceReport";
import HistoricalEquityCurve from "./HistoricalEquityCurve";
import SmokeTestPanel from "./SmokeTestPanel";

/**
 * OperationalPage — Phase 8: Operational Hardening
 *
 * Contains all P0 operational tools:
 * - Kill Switch (emergency halt)
 * - Mode Toggle (paper/live with confirmation)
 * - Audit Log Viewer (immutable trade trail)
 * - Fill Reconciliation (fill verification)
 * - Compliance Report (P2-4A: compliance reporting summary)
 * - Historical Equity Curve (P2-4C: long-term portfolio tracking with daily snapshots)
 */
export default function OperationalPage({ bffFetch }) {
  if (!bffFetch) {
    // Fallback: create a bffFetch that calls the BFF proxy route
    bffFetch = useCallback(async (path, options = {}) => {
      // Map backend paths to BFF action names
      const actionMap = {
        "/operational/kill-switch/status": "kill-switch-status",
        "/operational/kill-switch/activate": "kill-switch-activate",
        "/operational/kill-switch/deactivate": "kill-switch-deactivate",
        "/operational/kill-switch/cancel-all": "kill-switch-cancel-all",
        "/operational/kill-switch/close-all": "kill-switch-close-all",
        "/operational/audit-log": "audit-log",
        "/operational/audit-log/summary": "audit-log-summary",
        "/operational/audit-log/export": "audit-log-export",
        "/operational/mode": "mode",
        "/operational/mode/request": "mode-request",
        "/operational/mode/confirm": "mode-confirm",
        "/operational/mode/health": "mode-health",
        "/operational/reconcile/status": "reconcile-status",
        "/operational/reconcile/run": "reconcile-run",
        "/operational/reconcile/order": "reconcile-order",
        "/operational/reconcile/positions": "reconcile-positions",
        "/operational/executor/status": "executor-status",
      };

      // Extract the action from the path
      const action = actionMap[path];
      if (!action) {
        console.error("Unknown operational path:", path);
        return new Response(JSON.stringify({ error: "Unknown path" }), { status: 400 });
      }

      // Build BFF URL
      const url = new URL(`/api/operational/${action}`, window.location.origin);

      // For GET requests with query params in the path
      if (path.includes("?")) {
        const [basePath, queryString] = path.split("?");
        url.search = queryString;
      }

      // Merge options
      const fetchOptions = {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      };

      return fetch(url.toString(), fetchOptions);
    }, []);
  }

  return (
    <div className="space-y-4">
      {/* Live Trading Mode Banner */}
      <div className="alert alert-info shadow-sm">
        <span className="text-sm">
          <strong>Phase 8: Operational Hardening</strong> — Emergency controls,
          audit trail, paper/live toggle, fill reconciliation, and compliance reporting.
          These tools are required before enabling live trading.
        </span>
      </div>

      {/* P3-5D: System Health Dashboard — placed near top for admin visibility */}
      <SystemHealthDashboard />

      {/* Live P&L Dashboard — full width */}
      <LivePnLDashboard />

      {/* Historical Equity Curve — P2-4C: Long-term portfolio tracking */}
      <HistoricalEquityCurve />

      {/* Top Row: Kill Switch + Mode Toggle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KillSwitchPanel bffFetch={bffFetch} />
        <ModeToggle bffFetch={bffFetch} />
      </div>

      {/* Circuit Breaker Panel — full width */}
      <CircuitBreakerPanel />

      {/* Middle Row: Reconciliation + Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReconciliationPanel bffFetch={bffFetch} />
        <AuditLogViewer bffFetch={bffFetch} />
      </div>

      {/* P3-5E: Smoke Test Panel — full width */}
      <SmokeTestPanel />

      {/* Bottom Row: Compliance Report — full width */}
      <ComplianceReport />
    </div>
  );
}
