"use client";

import { useState, useEffect, useCallback } from "react";
import { usePlan } from "@/hooks/usePlan";
import { useRole } from "@/hooks/useRole";

/**
 * McpIntegrationPanel — Settings component for MCP (Model Context Protocol) integration.
 *
 * Features:
 *   - Displays available MCP tools (fetched from backend, filtered by plan)
 *   - Shows connection URLs for direct API key and BFF proxy access
 *   - One-click copy for Claude Desktop / Cursor / generic MCP config
 *   - Connection test button
 *   - Plan-based tool availability indicators
 *
 * Auth methods:
 *   - Direct: X-API-Key header with nt_live_... key (for desktop/CLI clients)
 *   - BFF Proxy: Clerk session auth (for browser-based clients)
 */
export default function McpIntegrationPanel() {
  const { plan, planDetails, isPremium, isInstitutional } = usePlan();
  const { role } = useRole();
  const [tools, setTools] = useState([]);
  const [connectionConfig, setConnectionConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copied, setCopied] = useState(null); // "direct" | "claude" | "cursor" | "bff"
  const [toolsFilter, setToolsFilter] = useState("all"); // "all" | "available" | "locked"
  const [expandedTool, setExpandedTool] = useState(null);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/tools");
      if (res.ok) {
        const data = await res.json();
        setTools(data.tools || []);
        setConnectionConfig(data.connectionConfig || null);
      }
    } catch {
      // Stale data is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mcp/tools");
      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: true,
          toolCount: data.availableTools,
          totalTools: data.totalTools,
          plan: data.plan,
          message: `Connected! ${data.availableTools} tools available for your ${data.plan} plan.`,
        });
        // Refresh tools list
        setTools(data.tools || []);
        setConnectionConfig(data.connectionConfig || null);
      } else {
        const data = await res.json().catch(() => ({}));
        setTestResult({
          success: false,
          message: data.error || `Connection failed (HTTP ${res.status})`,
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `Connection error: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const getClaudeDesktopConfig = () => {
    if (!connectionConfig?.claude_desktop) return "{}";
    return JSON.stringify(connectionConfig.claude_desktop, null, 2);
  };

  const getCursorConfig = () => {
    if (!connectionConfig?.cursor) return "{}";
    return JSON.stringify(connectionConfig.cursor, null, 2);
  };

  const filteredTools = tools.filter((tool) => {
    if (toolsFilter === "available") return tool.available;
    if (toolsFilter === "locked") return !tool.available;
    return true;
  });

  const availableCount = tools.filter((t) => t.available).length;
  const lockedCount = tools.filter((t) => !t.available).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Test Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">MCP Integration</h3>
          <p className="text-sm text-base-content/60">
            Connect AI assistants (Claude, Cursor, etc.) to Noble Trader via the Model Context Protocol.
            {availableCount > 0
              ? ` ${availableCount} tools available for your plan.`
              : " No tools available for your plan."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-sm badge-primary">
            {availableCount}/{tools.length} tools
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "Test Connection"
            )}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`alert ${testResult.success ? "alert-success" : "alert-error"} shadow`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            {testResult.success ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <span className="text-sm">{testResult.message}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setTestResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Connection Configuration */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h4 className="card-title text-sm">Connection Configuration</h4>

          {/* Direct API Key Connection */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-sm font-medium">Direct Connection (Desktop/CLI)</span>
              <span className="badge badge-xs badge-info">Recommended</span>
            </label>
            <div className="flex items-center gap-2">
              <code className="bg-base-300 px-3 py-2 rounded text-xs font-mono flex-1 truncate">
                {connectionConfig?.direct?.url || "https://noble-trader-fastapi-backend.onrender.com/mcp"}
              </code>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => handleCopy(connectionConfig?.direct?.url || "", "direct")}
              >
                {copied === "direct" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-base-content/50 mt-1">
              Auth: <code className="bg-base-300 px-1 rounded">X-API-Key: nt_live_...</code> — Create an API key in the API Keys tab.
            </p>
          </div>

          {/* BFF Proxy Connection */}
          <div className="form-control mt-3">
            <label className="label py-1">
              <span className="label-text text-sm font-medium">BFF Proxy (Browser Clients)</span>
              <span className="badge badge-xs badge-ghost">Auto-auth</span>
            </label>
            <div className="flex items-center gap-2">
              <code className="bg-base-300 px-3 py-2 rounded text-xs font-mono flex-1 truncate">
                {connectionConfig?.bff?.url || "/api/mcp"}
              </code>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => handleCopy(connectionConfig?.bff?.url || "", "bff")}
              >
                {copied === "bff" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-base-content/50 mt-1">
              Uses your browser Clerk session — no API key needed.
            </p>
          </div>
        </div>
      </div>

      {/* Client Configuration Snippets */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h4 className="card-title text-sm">Client Configuration</h4>
          <p className="text-xs text-base-content/60 mb-2">
            Copy these snippets to configure your MCP client. Replace <code className="bg-base-300 px-1 rounded">nt_live_YOUR_API_KEY_HERE</code> with your actual API key.
          </p>

          {/* Claude Desktop */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-sm font-medium">Claude Desktop</span>
              <span className="text-xs text-base-content/40">~/.claude/claude_desktop_config.json</span>
            </label>
            <div className="relative">
              <pre className="bg-base-300 p-3 rounded-lg text-xs overflow-x-auto max-h-[200px]">
                <code>{getClaudeDesktopConfig()}</code>
              </pre>
              <button
                className="btn btn-ghost btn-xs absolute top-2 right-2"
                onClick={() => handleCopy(getClaudeDesktopConfig(), "claude")}
              >
                {copied === "claude" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Cursor */}
          <div className="form-control mt-3">
            <label className="label py-1">
              <span className="label-text text-sm font-medium">Cursor</span>
              <span className="text-xs text-base-content/40">.cursor/mcp.json</span>
            </label>
            <div className="relative">
              <pre className="bg-base-300 p-3 rounded-lg text-xs overflow-x-auto max-h-[200px]">
                <code>{getCursorConfig()}</code>
              </pre>
              <button
                className="btn btn-ghost btn-xs absolute top-2 right-2"
                onClick={() => handleCopy(getCursorConfig(), "cursor")}
              >
                {copied === "cursor" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Available Tools */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex items-center justify-between mb-2">
            <h4 className="card-title text-sm">Available Tools</h4>
            <div className="flex items-center gap-1">
              <button
                className={`btn btn-xs ${toolsFilter === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setToolsFilter("all")}
              >
                All ({tools.length})
              </button>
              <button
                className={`btn btn-xs ${toolsFilter === "available" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setToolsFilter("available")}
              >
                Available ({availableCount})
              </button>
              <button
                className={`btn btn-xs ${toolsFilter === "locked" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setToolsFilter("locked")}
              >
                Locked ({lockedCount})
              </button>
            </div>
          </div>

          {filteredTools.length === 0 ? (
            <p className="text-sm text-base-content/50 text-center py-4">
              No tools match the current filter.
            </p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredTools.map((tool) => (
                <div
                  key={tool.name}
                  className={`collapse collapse-arrow bg-base-300 rounded-lg ${!tool.available ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="mcp-tools"
                    checked={expandedTool === tool.name}
                    onChange={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                  />
                  <div className="collapse-title py-2 px-3 min-h-0 flex items-center gap-2">
                    <span className="font-mono text-xs">{tool.name}</span>
                    <span className={`badge badge-xs ${
                      tool.available
                        ? "badge-success"
                        : tool.minPlan === "premium"
                          ? "badge-warning"
                          : "badge-error"
                    }`}>
                      {tool.available ? "Available" : tool.minPlan === "premium" ? "Premium+" : "Institutional"}
                    </span>
                  </div>
                  <div className="collapse-content px-3 py-2">
                    <p className="text-xs text-base-content/70 mb-2">
                      {tool.description || "No description available."}
                    </p>
                    {tool.inputSchema && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-base-content/50">Input Schema</summary>
                        <pre className="mt-1 bg-base-200 p-2 rounded text-[10px] overflow-x-auto max-h-[150px]">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </details>
                    )}
                    {!tool.available && (
                      <p className="text-xs text-warning mt-1">
                        Upgrade to {tool.minPlan} plan to unlock this tool.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan Upgrade Prompt */}
      {!isPremium && (
        <div className="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">
            {lockedCount > 0
              ? `${lockedCount} tools are locked behind higher plans. Upgrade to Premium to unlock write + compute tools.`
              : "Upgrade to Premium for more MCP tools including backtest runs and strategy signals."}
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

      {/* Usage Info */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h4 className="card-title text-sm">How MCP Works</h4>
          <div className="text-xs text-base-content/60 space-y-2">
            <p>
              The Model Context Protocol (MCP) lets AI assistants like Claude and Cursor
              directly access your Noble Trader account. They can read portfolio data,
              run risk analyses, execute backtests, and more — all with the same
              role and plan restrictions as your web session.
            </p>
            <p>
              <strong>Authentication:</strong> MCP clients authenticate using your API key
              (<code className="bg-base-300 px-1 rounded">X-API-Key: nt_live_...</code>).
              Create one in the API Keys tab. The key inherits your role and plan.
            </p>
            <p>
              <strong>Security:</strong> Write operations (order execution, pipeline mutation)
              are excluded from MCP. Only read/analysis tools are exposed. Your API key
              respects the same rate limits as browser sessions.
            </p>
            <div className="flex gap-3 mt-2">
              <span className="badge badge-xs badge-ghost">Read-only by default</span>
              <span className="badge badge-xs badge-ghost">Plan-gated tools</span>
              <span className="badge badge-xs badge-ghost">Rate limited</span>
              <span className="badge badge-xs badge-ghost">No write ops</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
