"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  trackOrder,
  stopTracking,
  syncOrders,
  getActiveOrders,
  getOrderStatus,
  getTrackingSummary,
  clearCompleted,
} from "@/lib/order-tracker";
import { notifySuccess, notifyError, notifyInfo } from "@/lib/notifications";

/**
 * OrderTracker — Shows live Alpaca order status for Renko trades.
 * Displays: open orders, recent fills, rejected orders.
 * Auto-refreshes every 5s when there are active orders.
 */

const STATUS_BADGE_MAP = {
  new: "badge-info",
  partially_filled: "badge-warning",
  filled: "badge-success",
  rejected: "badge-error",
  canceled: "badge-ghost",
  expired: "badge-ghost",
  accepted: "badge-info",
  pending_new: "badge-info",
  pending_replace: "badge-warning",
  pending_cancel: "badge-warning",
};

const STATUS_LABEL_MAP = {
  new: "New",
  partially_filled: "Partial",
  filled: "Filled",
  rejected: "Rejected",
  canceled: "Canceled",
  expired: "Expired",
  accepted: "Accepted",
  pending_new: "Pending",
  pending_replace: "Replacing",
  pending_cancel: "Canceling",
};

function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function formatPrice(value) {
  if (value == null) return "—";
  const n = parseFloat(value);
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

// ── Order Row ──────────────────────────────────────────────────────────────────

function OrderRow({ order }) {
  const isBuy = (order.side || "").toLowerCase() === "buy";
  const sideBadge = isBuy ? "badge-success" : "badge-error";
  const statusBadge = STATUS_BADGE_MAP[order.status] || "badge-ghost";
  const statusLabel = STATUS_LABEL_MAP[order.status] || order.status;
  const filledQty = parseInt(order.filled_qty || "0", 10);
  const orderQty = parseInt(order.qty || "0", 10);
  const fillPct = orderQty > 0 ? Math.round((filledQty / orderQty) * 100) : 0;

  return (
    <tr className="hover">
      <td className="font-mono text-xs font-semibold">{order.symbol || "—"}</td>
      <td>
        <span className={`badge badge-xs ${sideBadge}`}>
          {(order.side || "—").toUpperCase()}
        </span>
      </td>
      <td className="text-xs capitalize">{order.type || "—"}</td>
      <td className="font-mono text-xs">
        {orderQty}
        {filledQty > 0 && filledQty < orderQty && (
          <span className="text-base-content/40"> / {filledQty}</span>
        )}
      </td>
      <td>
        {orderQty > 0 && filledQty > 0 && filledQty < orderQty ? (
          <div className="flex items-center gap-1">
            <progress
              className="progress w-10 progress-warning"
              value={fillPct}
              max="100"
            />
            <span className="font-mono text-[10px]">{fillPct}%</span>
          </div>
        ) : filledQty >= orderQty && orderQty > 0 ? (
          <span className="text-success text-[10px]">100%</span>
        ) : (
          <span className="text-base-content/30 text-[10px]">0%</span>
        )}
      </td>
      <td>
        <span className={`badge badge-xs ${statusBadge}`}>{statusLabel}</span>
        {order._renko?.isRenkoOrder && (
          <span className="badge badge-xs badge-outline ml-1">Renko</span>
        )}
      </td>
      <td className="font-mono text-xs">
        {formatPrice(order.limit_price || order.filled_avg_price)}
      </td>
      <td className="text-xs text-base-content/50">
        {formatTime(order.submitted_at)}
      </td>
      <td className="text-xs text-base-content/50">
        {order.filled_at ? formatTime(order.filled_at) : "—"}
      </td>
    </tr>
  );
}

// ── Summary Card ───────────────────────────────────────────────────────────────

function SummaryCard({ summary, loading }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            Open Orders
          </span>
          <div className="font-mono font-bold text-xl">
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              summary.open
            )}
          </div>
        </div>
      </div>
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            Today&apos;s Fills
          </span>
          <div className="font-mono font-bold text-xl text-success">
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              summary.filled
            )}
          </div>
        </div>
      </div>
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            Rejected
          </span>
          <div className="font-mono font-bold text-xl text-error">
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              summary.rejected
            )}
          </div>
        </div>
      </div>
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3">
          <span className="text-[10px] text-base-content/40 uppercase tracking-wide">
            Fill Rate
          </span>
          <div
            className={`font-mono font-bold text-xl ${
              summary.fillRate >= 70
                ? "text-success"
                : summary.fillRate >= 40
                  ? "text-warning"
                  : "text-error"
            }`}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              `${summary.fillRate.toFixed(0)}%`
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OrderTracker({ symbol }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState("open"); // open | filled | rejected
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef(null);
  const abortRef = useRef(null);

  // Fetch orders from BFF
  const fetchOrders = useCallback(async (showLoading = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ status: "all", limit: "50" });
      if (symbol) params.set("symbol", symbol);

      const res = await fetch(`/api/renko/orders?${params.toString()}`, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error("Backend is starting up. Please wait a moment.");
      }

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "NO_KEYS") {
          setError("NO_KEYS");
          setOrders([]);
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const orderList = Array.isArray(data) ? data : [];
      setOrders(orderList);

      // Sync with order tracker
      syncOrders(orderList);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [symbol]);

  // Cancel all open orders
  const handleCancelAll = useCallback(async () => {
    setCancelling(true);
    try {
      const params = new URLSearchParams();
      if (symbol) params.set("symbol", symbol);

      const res = await fetch(`/api/renko/orders?${params.toString()}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      notifySuccess(data.message || "All open orders cancelled");
      await fetchOrders(false);
    } catch (e) {
      notifyError(`Cancel failed: ${e.message}`);
    } finally {
      setCancelling(false);
    }
  }, [symbol, fetchOrders]);

  // Clear completed orders from tracker
  const handleClearCompleted = useCallback(() => {
    const cleared = clearCompleted();
    if (cleared > 0) {
      notifyInfo(`Cleared ${cleared} completed order(s)`);
      // Re-filter displayed orders
      setOrders((prev) =>
        prev.filter((o) => {
          const status = getOrderStatus(o.id);
          return !status?.completedAt || Date.now() - status.completedAt < 3600000;
        })
      );
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    fetchOrders(true);

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchOrders(false);
      }, 5000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchOrders, autoRefresh]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (autoRefresh) {
        fetchOrders(false);
        intervalRef.current = setInterval(() => {
          fetchOrders(false);
        }, 5000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [autoRefresh, fetchOrders]);

  // Categorize orders
  const openOrders = orders.filter(
    (o) => !["filled", "rejected", "canceled", "expired"].includes(o.status)
  );
  const filledOrders = orders.filter((o) => o.status === "filled");
  const rejectedOrders = orders.filter(
    (o) => o.status === "rejected" || o.status === "canceled" || o.status === "expired"
  );

  // Compute summary
  const summary = {
    open: openOrders.length,
    filled: filledOrders.length,
    rejected: rejectedOrders.length,
    fillRate:
      filledOrders.length + rejectedOrders.length > 0
        ? (filledOrders.length / (filledOrders.length + rejectedOrders.length)) * 100
        : 0,
  };

  // Current tab's orders
  const displayOrders =
    subTab === "open"
      ? openOrders
      : subTab === "filled"
        ? filledOrders
        : rejectedOrders;

  // No keys state
  if (error === "NO_KEYS") {
    return (
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-6 text-center">
          <span className="text-2xl mb-2 block">🔑</span>
          <h3 className="font-semibold text-sm">Alpaca Keys Required</h3>
          <p className="text-xs text-base-content/50 mt-1">
            Configure your Alpaca paper trading API keys in Settings to track live orders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <SummaryCard summary={summary} loading={loading && orders.length === 0} />

      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sub-tab bar */}
        <div
          role="tablist"
          className="tabs tabs-boxed bg-base-200 p-1 gap-1"
        >
          <button
            role="tab"
            className={`tab min-h-[36px] sm:tab-sm sm:min-h-0 ${subTab === "open" ? "tab-active" : ""}`}
            onClick={() => setSubTab("open")}
          >
            Open <span className="badge badge-xs ml-1">{openOrders.length}</span>
          </button>
          <button
            role="tab"
            className={`tab min-h-[36px] sm:tab-sm sm:min-h-0 ${subTab === "filled" ? "tab-active" : ""}`}
            onClick={() => setSubTab("filled")}
          >
            Fills <span className="badge badge-xs ml-1">{filledOrders.length}</span>
          </button>
          <button
            role="tab"
            className={`tab min-h-[36px] sm:tab-sm sm:min-h-0 ${subTab === "rejected" ? "tab-active" : ""}`}
            onClick={() => setSubTab("rejected")}
          >
            Rejected <span className="badge badge-xs ml-1">{rejectedOrders.length}</span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <div className="form-control">
            <label className="label cursor-pointer gap-2">
              <span className="label-text text-xs">Auto</span>
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            </label>
          </div>

          {/* Cancel all button */}
          {openOrders.length > 0 && (
            <button
              className={`btn min-h-[44px] sm:btn-sm sm:min-h-0 btn-error btn-outline ${cancelling ? "btn-disabled" : ""}`}
              onClick={handleCancelAll}
              disabled={cancelling}
            >
              {cancelling ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Canceling...
                </>
              ) : (
                <>✕ Cancel All</>
              )}
            </button>
          )}

          {/* Manual refresh */}
          <button
            className="btn min-h-[44px] sm:btn-sm sm:min-h-0 btn-ghost"
            onClick={() => fetchOrders(true)}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <span className="text-xs">📋</span>
            </div>
            <h4 className="font-semibold text-sm">
              {subTab === "open"
                ? "Open Orders"
                : subTab === "filled"
                  ? "Recent Fills"
                  : "Rejected / Cancelled"}
            </h4>
            <span className="badge badge-xs badge-ghost ml-auto">
              {displayOrders.length} order{displayOrders.length !== 1 ? "s" : ""}
              {symbol ? ` for ${symbol}` : ""}
            </span>
          </div>

          {loading && orders.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <span className="loading loading-spinner loading-md text-primary" />
              <span className="text-base-content/50">Loading orders...</span>
            </div>
          ) : error ? (
            <div className="alert alert-warning">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div>
                <h3 className="font-bold text-sm">Failed to load orders</h3>
                <div className="text-xs opacity-80">{error}</div>
                <button
                  className="btn btn-xs btn-ghost mt-2"
                  onClick={() => fetchOrders(true)}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-2xl mb-2 block">
                {subTab === "open" ? "📭" : subTab === "filled" ? "🎉" : "✅"}
              </span>
              <span className="text-base-content/30 text-sm">
                {subTab === "open"
                  ? "No open orders"
                  : subTab === "filled"
                    ? "No fills yet"
                    : "No rejected or cancelled orders"}
              </span>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div
                className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto"
                style={{ scrollbarWidth: "thin" }}
              >
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="text-xs">Symbol</th>
                      <th className="text-xs">Side</th>
                      <th className="text-xs">Type</th>
                      <th className="text-xs">Qty</th>
                      <th className="text-xs">Fill</th>
                      <th className="text-xs">Status</th>
                      <th className="text-xs">Price</th>
                      <th className="text-xs">Submitted</th>
                      <th className="text-xs">Filled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayOrders.map((order) => (
                      <OrderRow key={order.id || order.client_order_id} order={order} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
                {displayOrders.map((order) => {
                  const isBuy = (order.side || "").toLowerCase() === "buy";
                  const sideBadge = isBuy ? "badge-success" : "badge-error";
                  const statusBadge = STATUS_BADGE_MAP[order.status] || "badge-ghost";
                  const statusLabel = STATUS_LABEL_MAP[order.status] || order.status;
                  const filledQty = parseInt(order.filled_qty || "0", 10);
                  const orderQty = parseInt(order.qty || "0", 10);
                  const fillPct = orderQty > 0 ? Math.round((filledQty / orderQty) * 100) : 0;
                  return (
                    <div key={order.id || order.client_order_id} className="card bg-base-300/50 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono font-bold text-sm">{order.symbol || "—"}</span>
                        <div className="flex gap-1 items-center">
                          <span className={`badge badge-xs ${sideBadge}`}>
                            {(order.side || "—").toUpperCase()}
                          </span>
                          <span className={`badge badge-xs ${statusBadge}`}>{statusLabel}</span>
                          {order._renko?.isRenkoOrder && (
                            <span className="badge badge-xs badge-outline">Renko</span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div><span className="text-base-content/50">Type:</span> <span className="capitalize">{order.type || "—"}</span></div>
                        <div><span className="text-base-content/50">Qty:</span> <span className="font-mono">{orderQty}{filledQty > 0 && filledQty < orderQty ? <span className="text-base-content/40"> / {filledQty}</span> : ""}</span></div>
                        <div><span className="text-base-content/50">Fill:</span> <span className="font-mono">{fillPct}%</span></div>
                        <div><span className="text-base-content/50">Price:</span> <span className="font-mono">{formatPrice(order.limit_price || order.filled_avg_price)}</span></div>
                        <div><span className="text-base-content/50">Submitted:</span> <span className="text-xs">{formatTime(order.submitted_at)}</span></div>
                        <div><span className="text-base-content/50">Filled:</span> <span className="text-xs">{order.filled_at ? formatTime(order.filled_at) : "—"}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Order Tracker Status */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <span className="text-xs">🔄</span>
            </div>
            <h4 className="font-semibold text-sm">Tracker Status</h4>
            <span
              className={`badge badge-xs ${autoRefresh ? "badge-success" : "badge-ghost"} ml-auto`}
            >
              {autoRefresh ? "Live (5s)" : "Paused"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Tracked
              </div>
              <div className="font-mono font-bold text-sm">
                {getActiveOrders().length}
              </div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Alpaca Orders
              </div>
              <div className="font-mono font-bold text-sm">{orders.length}</div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Renko Orders
              </div>
              <div className="font-mono font-bold text-sm">
                {orders.filter((o) => o._renko?.isRenkoOrder).length}
              </div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Fill Rate
              </div>
              <div
                className={`font-mono font-bold text-sm ${
                  summary.fillRate >= 70
                    ? "text-success"
                    : summary.fillRate >= 40
                      ? "text-warning"
                      : "text-error"
                }`}
              >
                {summary.fillRate.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
