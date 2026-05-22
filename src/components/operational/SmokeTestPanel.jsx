"use client";

import { useState, useEffect, useCallback } from "react";
import { useRole } from "@/hooks/useRole";

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = {
  connectivity: { label: "Connectivity", icon: "🔗", color: "text-info" },
  trading: { label: "Trading", icon: "📈", color: "text-success" },
  risk: { label: "Risk Controls", icon: "🛡️", color: "text-warning" },
  audit: { label: "Audit Trail", icon: "📋", color: "text-primary" },
  reconciliation: { label: "Reconciliation", icon: "🔄", color: "text-secondary" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return "Never";
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 0) return "Just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return "Invalid";
  }
}

function formatDuration(ms) {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverallStatusHero({ overall, durationMs, startedAt, completedAt, summary }) {
  const config = {
    pass: { emoji: "✅", label: "ALL PASS", badgeClass: "badge-success", cardClass: "border-success/30 bg-success/5", textColor: "text-success" },
    partial: { emoji: "⚠️", label: "PARTIAL", badgeClass: "badge-warning", cardClass: "border-warning/30 bg-warning/5", textColor: "text-warning" },
    fail: { emoji: "❌", label: "FAIL", badgeClass: "badge-error", cardClass: "border-error/30 bg-error/5", textColor: "text-error" },
  };
  const c = config[overall] || config.fail;

  return (
    <div className={`card border-2 ${c.cardClass} shadow-sm`}>
      <div className="card-body p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-4xl sm:text-5xl">{c.emoji}</span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                Smoke Test: <span className={c.textColor}>{c.label}</span>
              </h2>
              <p className="text-sm text-base-content/60 mt-1">
                Completed in {formatDuration(durationMs)}
                {completedAt && (
                  <span className="ml-2">— {new Date(completedAt).toLocaleString()}</span>
                )}
              </p>
            </div>
          </div>
          {summary && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${c.badgeClass} badge-lg`}>{overall.toUpperCase()}</span>
              <span className="badge badge-success badge-sm">{summary.passed} passed</span>
              {summary.failed > 0 && (
                <span className="badge badge-error badge-sm">{summary.failed} failed</span>
              )}
              {summary.skipped > 0 && (
                <span className="badge badge-ghost badge-sm">{summary.skipped} skipped</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestResultRow({ test, expanded, onToggle }) {
  const statusConfig = {
    pass: { icon: "✓", badgeClass: "badge-success", bgClass: "bg-success/5" },
    fail: { icon: "✗", badgeClass: "badge-error", bgClass: "bg-error/5" },
    skip: { icon: "○", badgeClass: "badge-ghost", bgClass: "bg-base-200" },
  };
  const sc = statusConfig[test.status] || statusConfig.skip;
  const cat = CATEGORIES[test.category] || { icon: "•", label: test.category, color: "" };

  return (
    <div className={`card border border-base-300 shadow-sm ${test.status === "fail" ? "border-error/30" : ""}`}>
      <div
        className="card-body p-3 cursor-pointer hover:bg-base-200/50 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`badge ${sc.badgeClass} badge-sm`}>{sc.icon} {test.status.toUpperCase()}</span>
            <span className="text-xs opacity-40">{cat.icon}</span>
            <span className="text-sm font-medium truncate">{test.name}</span>
            {test.critical && (
              <span className="badge badge-outline badge-xs text-error">CRITICAL</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-base-content/40">{formatDuration(test.duration)}</span>
            <span className="text-base-content/30 text-xs">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {expanded && (
          <div className="mt-2 pt-2 border-t border-base-200 space-y-1.5 text-xs">
            {test.details && (
              <div className="text-base-content/70 break-words">
                <span className="font-semibold text-base-content/50">Details:</span> {test.details}
              </div>
            )}
            {test.error && (
              <div className="text-error break-words bg-error/10 p-2 rounded">
                <span className="font-semibold">Error:</span> {test.error}
              </div>
            )}
            <div className="flex items-center gap-3 text-base-content/40">
              <span>Category: {cat.label}</span>
              <span>Duration: {formatDuration(test.duration)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryGroup({ category, tests, expandedTests, onToggleTest }) {
  const cat = CATEGORIES[category] || { label: category, icon: "•", color: "" };
  const passed = tests.filter((t) => t.status === "pass").length;
  const failed = tests.filter((t) => t.status === "fail").length;
  const allPass = failed === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-lg">{cat.icon}</span>
        <h3 className="font-semibold text-sm">{cat.label}</h3>
        <span className={`badge ${allPass ? "badge-success" : "badge-error"} badge-xs`}>
          {passed}/{tests.length}
        </span>
      </div>
      <div className="space-y-1">
        {tests.map((test, i) => (
          <TestResultRow
            key={`${test.name}-${i}`}
            test={test}
            expanded={expandedTests[`${category}-${i}`]}
            onToggle={() => onToggleTest(`${category}-${i}`)}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({ tests, overall }) {
  if (overall === "pass") return null;

  const failedTests = tests.filter((t) => t.status === "fail");
  if (failedTests.length === 0) return null;

  const recommendations = [];

  for (const test of failedTests) {
    if (test.name.includes("Connectivity") || test.name.includes("Alpaca")) {
      recommendations.push({
        icon: "🔗",
        title: "Alpaca Connectivity Issue",
        text: "Check your Alpaca API keys in Settings. Ensure they are valid paper trading keys. Verify your account is active at app.alpaca.markets.",
      });
    }
    if (test.name.includes("Order Creation") || test.name.includes("Order Retrieval")) {
      recommendations.push({
        icon: "📈",
        title: "Order Execution Issue",
        text: "The Alpaca paper trading API rejected or lost the test order. This may indicate a temporary API issue or account restriction. Try again in a few minutes.",
      });
    }
    if (test.name.includes("Cleanup")) {
      recommendations.push({
        icon: "🧹",
        title: "Cleanup Issue",
        text: "The smoke test could not fully clean up (cancel order or close position). Manually check your Alpaca dashboard for orphaned positions or open orders.",
      });
    }
    if (test.name.includes("Circuit Breaker")) {
      recommendations.push({
        icon: "🛡️",
        title: "Circuit Breaker / Halt Active",
        text: "An active circuit breaker or trading halt is preventing test orders. Go to the Circuit Breaker panel to deactivate any active halts.",
      });
    }
    if (test.name.includes("Audit Trail")) {
      recommendations.push({
        icon: "📋",
        title: "Audit Log Issue",
        text: "The audit trail is not recording events properly. Check that the trade_audit_log table exists (migration 14) and Supabase is accessible.",
      });
    }
    if (test.name.includes("Reconciliation")) {
      recommendations.push({
        icon: "🔄",
        title: "Reconciliation Issue",
        text: "The reconciliation engine encountered an error. Check that reconciliation_results and reconciliation_auto_config tables exist (migration 22).",
      });
    }
    if (test.name.includes("Supabase")) {
      recommendations.push({
        icon: "🗄️",
        title: "Supabase Connectivity Issue",
        text: "Cannot connect to Supabase or write to tables. Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables. Run pending migrations.",
      });
    }
    if (test.name.includes("Health")) {
      recommendations.push({
        icon: "🏥",
        title: "System Health Issue",
        text: "The system health check reports an unhealthy status. Check the System Health Dashboard for detailed subsystem statuses.",
      });
    }
  }

  // Deduplicate
  const uniqueRecs = recommendations.filter(
    (r, i, arr) => arr.findIndex((x) => x.title === r.title) === i
  );

  if (uniqueRecs.length === 0) return null;

  return (
    <div className="card bg-warning/5 border border-warning/30 shadow-sm">
      <div className="card-body p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <span className="text-xl">💡</span> Recommendations
        </h3>
        <div className="space-y-2">
          {uniqueRecs.map((rec, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-base-100 rounded-lg">
              <span className="text-lg flex-shrink-0">{rec.icon}</span>
              <div>
                <div className="font-semibold text-xs">{rec.title}</div>
                <div className="text-xs text-base-content/60 mt-0.5">{rec.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryList({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 opacity-50">
        <p className="text-sm">No smoke test history yet</p>
        <p className="text-xs mt-1">Run your first smoke test to see results here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {history.map((run) => {
        const statusConfig = {
          pass: { badgeClass: "badge-success", icon: "✅" },
          partial: { badgeClass: "badge-warning", icon: "⚠️" },
          fail: { badgeClass: "badge-error", icon: "❌" },
        };
        const sc = statusConfig[run.overall] || statusConfig.fail;

        const tests = Array.isArray(run.tests) ? run.tests : [];
        const passed = tests.filter((t) => t.status === "pass").length;
        const failed = tests.filter((t) => t.status === "fail").length;

        return (
          <div key={run.id} className="card bg-base-200 border border-base-300">
            <div className="card-body p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span>{sc.icon}</span>
                  <span className={`badge ${sc.badgeClass}`}>{run.overall.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3 text-xs opacity-70">
                  <span>{passed} passed</span>
                  {failed > 0 && <span className="text-error">{failed} failed</span>}
                  <span>{formatDuration(run.duration_ms)}</span>
                </div>
              </div>
              <div className="text-xs text-base-content/40 mt-1">
                {new Date(run.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SmokeTestPanel() {
  const { isAdmin } = useRole();

  // State
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("results"); // results | history
  const [expandedTests, setExpandedTests] = useState({});
  const [runningTestIndex, setRunningTestIndex] = useState(-1); // for progress tracking

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    try {
      const res = await fetch("/api/smoke-test?history=true&limit=15");
      if (res.ok) {
        const data = await res.json();
        setLastResult(data.lastResult || null);
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error("Failed to fetch smoke test data:", e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Run smoke test
  const handleRunTest = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    setRunningTestIndex(0);
    setExpandedTests({});

    try {
      const res = await fetch("/api/smoke-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || errData.code || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setLastResult(result);
      setActiveTab("results");

      // Refresh history
      try {
        const histRes = await fetch("/api/smoke-test?history=true&limit=15");
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.history || []);
        }
      } catch { /* non-critical */ }
    } catch (e) {
      console.error("Smoke test error:", e);
      setError(e.message);
    } finally {
      setLoading(false);
      setRunningTestIndex(-1);
    }
  };

  // Toggle test expansion
  const toggleTest = (key) => {
    setExpandedTests((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Group tests by category
  const groupedTests = (() => {
    if (!lastResult?.tests) return {};
    const groups = {};
    for (const test of lastResult.tests) {
      const cat = test.category || "general";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(test);
    }
    return groups;
  })();

  // Loading skeleton
  if (initialLoading) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-xl">
        <div className="card-body p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="loading loading-spinner loading-md text-primary" />
            <span className="text-base-content/60">Loading smoke test data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title flex items-center gap-2">
            🧪 Paper Trading Smoke Test
            <span className="badge badge-outline badge-sm">P3-5E</span>
          </h2>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm"
                onClick={handleRunTest}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    Running...
                  </>
                ) : (
                  <>🧪 Run Full Test</>
                )}
              </button>
            )}
            {!isAdmin && (
              <span className="badge badge-ghost badge-sm">Admin only to run</span>
            )}
          </div>
        </div>

        {/* Info banner */}
        <div className="alert alert-info alert-sm py-2 px-3 mt-1">
          <span className="text-xs">
            Validates the full trade lifecycle: Alpaca connectivity → order placement → fill detection → circuit breakers → audit trail → reconciliation → cleanup.
            <strong> Paper trading only.</strong> All positions are cleaned up after the test.
          </span>
        </div>

        {/* Error display */}
        {error && (
          <div className="alert alert-error shadow-sm mt-2">
            <span className="text-sm">{error}</span>
            <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* Running progress */}
        {loading && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="loading loading-spinner loading-sm text-primary" />
              <span className="text-sm font-medium">Running smoke test...</span>
            </div>
            <progress className="progress progress-primary w-full" />
            <div className="text-xs text-base-content/50 mt-1">
              Testing: Alpaca connectivity, order placement, fills, risk controls, audit trail, reconciliation...
            </div>
          </div>
        )}

        {/* Last result overall status */}
        {lastResult && !loading && (
          <OverallStatusHero
            overall={lastResult.overall}
            durationMs={lastResult.durationMs}
            startedAt={lastResult.startedAt}
            completedAt={lastResult.completedAt}
            summary={lastResult.summary}
          />
        )}

        {/* Tab Navigation */}
        <div className="tabs tabs-boxed mt-2" role="tablist">
          <button
            className={`tab tab-sm ${activeTab === "results" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("results")}
            role="tab"
          >
            Test Results
          </button>
          <button
            className={`tab tab-sm ${activeTab === "history" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("history")}
            role="tab"
          >
            History
          </button>
        </div>

        {/* ── Results Tab ──────────────────────────────────────────────── */}
        {activeTab === "results" && (
          <div className="mt-3 space-y-4">
            {lastResult?.tests ? (
              <>
                {/* Grouped test results */}
                {Object.entries(CATEGORIES).map(([catKey, catInfo]) => {
                  const catTests = groupedTests[catKey];
                  if (!catTests || catTests.length === 0) return null;
                  return (
                    <CategoryGroup
                      key={catKey}
                      category={catKey}
                      tests={catTests}
                      expandedTests={expandedTests}
                      onToggleTest={toggleTest}
                    />
                  );
                })}

                {/* Uncategorised tests */}
                {groupedTests.general && groupedTests.general.length > 0 && (
                  <CategoryGroup
                    category="general"
                    tests={groupedTests.general}
                    expandedTests={expandedTests}
                    onToggleTest={toggleTest}
                  />
                )}

                {/* Recommendations */}
                <RecommendationCard tests={lastResult.tests} overall={lastResult.overall} />
              </>
            ) : !loading ? (
              <div className="text-center py-8 opacity-50">
                <span className="text-4xl mb-2 block">🧪</span>
                <p className="text-sm font-medium">No smoke test results yet</p>
                <p className="text-xs mt-1">
                  {isAdmin
                    ? 'Click "Run Full Test" to validate the entire trade lifecycle'
                    : "Ask an admin to run the smoke test"}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* ── History Tab ──────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="mt-3">
            <HistoryList history={history} />
          </div>
        )}
      </div>
    </div>
  );
}
