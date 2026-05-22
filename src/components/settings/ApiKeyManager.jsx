"use client";

import { useState, useEffect, useCallback } from "react";
import { usePlan } from "@/hooks/usePlan";
import { useRole } from "@/hooks/useRole";
import PlanGate from "@/components/shared/PlanGate";

/**
 * ApiKeyManager — Settings component for SaaS API key management.
 *
 * Features:
 *   - List active/revoked API keys (masked prefixes only)
 *   - Create new API key (shown once, then masked forever)
 *   - Rotate API key (premium+ only, 24hr grace on old key)
 *   - Revoke API key (immediate deactivation)
 *   - Copy key to clipboard (at creation time only)
 *   - Expiry badge and countdown for free-tier keys
 *
 * Plan entitlements:
 *   - Free: 1 key, 30-day expiry, no rotation
 *   - Premium: 1 key, permanent, rotation
 *   - Institutional: 5 keys, permanent, rotation
 */
export default function ApiKeyManager() {
  const { plan, planDetails, isPremium, isInstitutional } = usePlan();
  const { role } = useRole();
  const [keys, setKeys] = useState([]);
  const [meta, setMeta] = useState({ activeCount: 0, maxKeys: 1, canCreate: false });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Default Key");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Newly created key — shown once then never again
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
        setMeta(data.meta || {});
      }
    } catch {
      // Stale data is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newKeyName }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewlyCreatedKey(data);
        setNewKeyName("Default Key");
        setShowCreateForm(false);
        fetchKeys();
      } else {
        alert(data.error || "Failed to create API key");
      }
    } catch {
      alert("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (keyId) => {
    if (!confirm("Rotate this key? The old key will remain active for 24 hours, then be automatically deactivated.")) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate", keyId }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewlyCreatedKey(data);
        fetchKeys();
      } else {
        alert(data.error || "Failed to rotate API key");
      }
    } catch {
      alert("Failed to rotate API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!confirm("Revoke this key? This action is immediate and irreversible. Any services using this key will lose access.")) return;
    try {
      const res = await fetch(`/api/api-keys?id=${keyId}`, { method: "DELETE" });
      if (res.ok) {
        fetchKeys();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to revoke API key");
      }
    } catch {
      alert("Failed to revoke API key");
    }
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return { text: "Permanent", badge: "badge-success" };
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return { text: "Expired", badge: "badge-error" };
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 3) return { text: `${days}d left`, badge: "badge-error" };
    if (days <= 7) return { text: `${days}d left`, badge: "badge-warning" };
    return { text: `${days}d left`, badge: "badge-info" };
  };

  const formatDate = (iso) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">API Keys</h3>
          <p className="text-sm text-base-content/60">
            Manage API keys for programmatic access via X-API-Key header.
            {meta.activeCount >= meta.maxKeys
              ? " Key limit reached."
              : ` ${meta.maxKeys - meta.activeCount} key${meta.maxKeys - meta.activeCount !== 1 ? "s" : ""} available.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-sm badge-ghost">
            {meta.activeCount}/{meta.maxKeys} keys
          </span>
          {meta.canCreate && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateForm(true)}
              disabled={creating}
            >
              Create Key
            </button>
          )}
        </div>
      </div>

      {/* Plan-based info banner */}
      {plan === "free" && (
        <div className="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">
            Free plan keys expire after 30 days. Upgrade to <strong>Premium</strong> for a permanent API key with rotation support.
          </span>
          <button
            className="btn btn-warning btn-xs"
            onClick={() => window.dispatchEvent(
              new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "plan" } })
            )}
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Create Form (inline) */}
      {showCreateForm && (
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h4 className="card-title text-base">Create New API Key</h4>
            <div className="form-control w-full max-w-sm">
              <label className="label">
                <span className="label-text text-sm">Key Name</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production, Staging, MCP Server"
                maxLength={50}
              />
            </div>
            <div className="text-xs text-base-content/50 mt-1">
              {plan === "free" ? "This key will expire in 30 days." : "This key will be permanent."}
            </div>
            <div className="card-actions justify-end mt-3">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? <span className="loading loading-spinner loading-xs"></span> : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Newly Created Key Banner — shown ONCE */}
      {newlyCreatedKey && (
        <div className="alert alert-warning shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1">
            <h3 className="font-bold">Save Your API Key Now!</h3>
            <p className="text-sm">This is the only time the full key will be shown.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="bg-base-300 px-3 py-2 rounded text-sm font-mono break-all select-all">
                {newlyCreatedKey.key}
              </code>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleCopy(newlyCreatedKey.key)}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {newlyCreatedKey.expiresAt && (
              <p className="text-xs mt-1 text-base-content/60">
                Expires: {formatDate(newlyCreatedKey.expiresAt)}
              </p>
            )}
            {newlyCreatedKey.oldKeyGraceUntil && (
              <p className="text-xs mt-1 text-warning">
                Old key remains active until: {formatDate(newlyCreatedKey.oldKeyGraceUntil)}
              </p>
            )}
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setNewlyCreatedKey(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Key List */}
      {keys.length === 0 ? (
        <div className="card bg-base-200 shadow">
          <div className="card-body items-center text-center">
            <p className="text-base-content/60">No API keys yet.</p>
            <p className="text-sm text-base-content/40">
              Create an API key to access Noble Trader programmatically via the REST API or MCP server.
            </p>
            {meta.canCreate && (
              <button
                className="btn btn-primary btn-sm mt-2"
                onClick={() => setShowCreateForm(true)}
              >
                Create Your First API Key
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const expiry = formatExpiry(key.expiresAt);
            const isGracePeriod = key.rotationGraceUntil && new Date(key.rotationGraceUntil) > new Date();

            return (
              <div
                key={key.id}
                className={`card bg-base-200 shadow ${!key.isActive ? "opacity-60" : ""}`}
              >
                <div className="card-body p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm bg-base-300 px-2 py-1 rounded">
                        {key.prefix}
                        <span className="text-base-content/30">••••••••••••</span>
                      </div>
                      <span className="text-sm font-medium">{key.name}</span>
                      <span className={`badge badge-xs ${expiry.badge}`}>
                        {expiry.text}
                      </span>
                      {isGracePeriod && (
                        <span className="badge badge-xs badge-warning">
                          Grace: {formatDate(key.rotationGraceUntil)}
                        </span>
                      )}
                      {!key.isActive && (
                        <span className="badge badge-xs badge-ghost">Revoked</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {key.isActive && isPremium && (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleRotate(key.id)}
                          disabled={creating}
                          title="Rotate this key (premium+)"
                        >
                          Rotate
                        </button>
                      )}
                      {key.isActive && (
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => handleRevoke(key.id)}
                          title="Revoke this key permanently"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-base-content/40 flex gap-4 mt-1">
                    <span>Plan: {key.plan}</span>
                    <span>Role: {key.role}</span>
                    <span>Created: {formatDate(key.createdAt)}</span>
                    {key.lastUsedAt && <span>Last used: {formatDate(key.lastUsedAt)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Usage Example */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h4 className="card-title text-sm">Using Your API Key</h4>
          <div className="text-xs text-base-content/60 space-y-2 mt-1">
            <p>Pass your API key in the <code className="bg-base-300 px-1 rounded">X-API-Key</code> header:</p>
            <pre className="bg-base-300 p-3 rounded-lg overflow-x-auto">
              <code>{`curl -H "X-API-Key: nt_live_your_key_here" \\
  https://your-domain.com/api/portfolio`}</code>
            </pre>
            <p className="text-base-content/40">
              API key requests use the same rate limits and role/plan enforcement as browser sessions.
              {plan === "free" ? " Free plan: 10 req/min." : isPremium ? " Premium: 60 req/min." : " Institutional: 300 req/min."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
