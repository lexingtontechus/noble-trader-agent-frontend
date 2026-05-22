/**
 * Retention & GDPR Panel — P4-6C
 *
 * Displays retention policies, archive status, and GDPR purge interface.
 * Admin-only, accessible from the Operational page.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

export default function RetentionPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [gdprUserId, setGdprUserId] = useState("");
  const [gdprReason, setGdprReason] = useState("gdpr_request");
  const [gdprResult, setGdprResult] = useState(null);
  const [showGdprConfirm, setShowGdprConfirm] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/retention/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runRetention = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_retention" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      alert(`Retention complete: ${JSON.stringify(data.results, null, 2)}`);
      fetchStatus();
    } catch (err) {
      alert(`Retention failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const executeGdprPurge = async () => {
    if (!gdprUserId.trim()) return;
    setRunning(true);
    setShowGdprConfirm(false);
    try {
      const res = await fetch("/api/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gdpr_purge",
          userId: gdprUserId.trim(),
          reason: gdprReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGdprResult(data);
      setGdprUserId("");
    } catch (err) {
      setGdprResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Audit Log Archival & Retention</h2>
          <p className="text-sm text-base-content/60">
            Configurable retention policies with GDPR right-to-erasure support
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-outline min-h-[44px] sm:min-h-0"
            onClick={fetchStatus}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            className="btn btn-sm btn-primary min-h-[44px] sm:min-h-0"
            onClick={runRetention}
            disabled={running}
          >
            {running ? "Running..." : "Run Retention Jobs"}
          </button>
        </div>
      </div>

      {/* Retention Policies Table */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg">Retention Policies</h3>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Hot Records</th>
                  <th>Archive Records</th>
                  <th>Hot Retention</th>
                  <th>Archive Retention</th>
                  <th>GDPR</th>
                </tr>
              </thead>
              <tbody>
                {status?.status && Object.entries(status.status).map(([table, info]) => (
                  <tr key={table} className="hover">
                    <td className="font-mono text-xs">{table}</td>
                    <td className="font-mono">{info.hotRecords ?? "—"}</td>
                    <td className="font-mono">{info.archiveRecords ?? "—"}</td>
                    <td>{info.hotRetentionDays ? `${info.hotRetentionDays}d` : "—"}</td>
                    <td>{info.archiveRetentionDays ? `${info.archiveRetentionDays}d` : "—"}</td>
                    <td>
                      {info.gdprPurgeSupported ? (
                        <span className="badge badge-success badge-xs">Yes</span>
                      ) : (
                        <span className="badge badge-ghost badge-xs">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2">
            {status?.status && Object.entries(status.status).map(([table, info]) => (
              <div key={table} className="card bg-base-300 p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono font-bold text-sm">{table}</span>
                  {info.gdprPurgeSupported ? (
                    <span className="badge badge-success badge-xs">GDPR</span>
                  ) : (
                    <span className="badge badge-ghost badge-xs">No GDPR</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-base-content/50">Hot Records:</span> <span className="font-mono">{info.hotRecords ?? "—"}</span></div>
                  <div><span className="text-base-content/50">Archive Records:</span> <span className="font-mono">{info.archiveRecords ?? "—"}</span></div>
                  <div><span className="text-base-content/50">Hot Retention:</span> {info.hotRetentionDays ? `${info.hotRetentionDays}d` : "—"}</div>
                  <div><span className="text-base-content/50">Archive Retention:</span> {info.archiveRetentionDays ? `${info.archiveRetentionDays}d` : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GDPR Right to Erasure */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg">
            GDPR Right to Erasure
            <span className="badge badge-error badge-sm ml-2">Destructive</span>
          </h3>
          <p className="text-sm text-base-content/60 mb-4">
            Permanently delete all data for a specific user across all tables.
            This action is irreversible and logged for compliance.
          </p>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs">User ID (Clerk)</span>
              </label>
              <input
                type="text"
                className="input input-sm input-bordered w-72 font-mono"
                placeholder="user_2xyz..."
                value={gdprUserId}
                onChange={(e) => setGdprUserId(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs">Reason</span>
              </label>
              <select
                className="select select-sm select-bordered min-h-[44px] sm:min-h-0"
                value={gdprReason}
                onChange={(e) => setGdprReason(e.target.value)}
              >
                <option value="gdpr_request">GDPR Request</option>
                <option value="account_deletion">Account Deletion</option>
                <option value="admin_action">Admin Action</option>
                <option value="data_minimization">Data Minimization</option>
              </select>
            </div>
            <button
              className="btn btn-sm btn-error min-h-[44px] sm:min-h-0"
              onClick={() => setShowGdprConfirm(true)}
              disabled={!gdprUserId.trim() || running}
            >
              Purge User Data
            </button>
          </div>

          {/* GDPR Confirmation Modal */}
          {showGdprConfirm && (
            <div className="modal modal-open">
              <div className="modal-box">
                <h3 className="font-bold text-lg text-error">Confirm GDPR Purge</h3>
                <p className="py-4">
                  This will <strong>permanently delete</strong> all data for user:
                </p>
                <p className="font-mono text-sm bg-base-300 p-2 rounded">
                  {gdprUserId}
                </p>
                <p className="py-2 text-sm">
                  Reason: <span className="badge badge-sm">{gdprReason}</span>
                </p>
                <p className="text-sm text-base-content/60">
                  This includes: credentials, audit logs, circuit breakers,
                  positions, P&L data, notifications, and all other records.
                  An erasure log will be maintained for compliance.
                </p>
                <div className="modal-action">
                  <button
                    className="btn btn-sm"
                    onClick={() => setShowGdprConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-sm btn-error"
                    onClick={executeGdprPurge}
                    disabled={running}
                  >
                    {running ? "Purging..." : "Confirm Purge"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GDPR Result */}
          {gdprResult && (
            <div className={`alert ${gdprResult.error ? "alert-error" : "alert-success"} mt-4`}>
              <div>
                {gdprResult.error ? (
                  <span>Error: {gdprResult.error}</span>
                ) : (
                  <div>
                    <p className="font-bold">GDPR Purge Complete</p>
                    <p className="text-xs">
                      Total records purged: {gdprResult.auditRecord?.totalRecordsPurged || 0}
                    </p>
                    <p className="text-xs">
                      Tables affected: {(gdprResult.auditRecord?.tablesAffected || []).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Archive Architecture */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-lg">Archive Architecture</h3>
          <div className="text-sm space-y-2 text-base-content/70">
            <p>
              <strong>Hot Storage:</strong> Main tables (trade_audit_log, etc.) — actively queried, indexed for performance.
              Records are kept in hot storage for the configured retention period (typically 30-90 days).
            </p>
            <p>
              <strong>Cold Archive:</strong> Archive tables (*_archive) — same schema with added archived_at timestamp.
              Archive tables are queried less frequently and can be stored on cheaper storage.
              Records are kept in archive for the remaining retention period.
            </p>
            <p>
              <strong>Auto-archival:</strong> A pg_cron job runs daily at 3 AM UTC to move old records from hot to cold
              and purge expired archives. The &quot;Run Retention Jobs&quot; button triggers this manually.
            </p>
            <p>
              <strong>GDPR compliance:</strong> All tables with gdprPurge=true support per-user erasure.
              The gdpr_erasure_log table maintains a permanent record of all erasure events.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
