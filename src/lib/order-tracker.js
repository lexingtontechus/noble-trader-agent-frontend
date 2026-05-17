/**
 * Order Tracker — tracks Alpaca order lifecycle for the Renko pipeline.
 *
 * Order states: new → partially_filled → filled → (done)
 *               new → rejected → (done)
 *               new → canceled → (done)
 *
 * Provides:
 *   - Order status polling (every 5s when active orders exist)
 *   - Callbacks for state transitions (filled, rejected, canceled)
 *   - Order-portfolio aggregation (P&L, position tracking)
 */

const POLL_INTERVAL = 5000; // 5 seconds
const COMPLETED_TTL = 3600000; // 1 hour in ms

/** @type {Map<string, { order: object, options: object, lastStatus: string, completedAt: number|null }>} */
const trackedOrders = new Map();

let pollTimer = null;
let isPolling = false;

/**
 * Start tracking an order.
 * @param {string} orderId - Alpaca order ID
 * @param {object} [options] - callbacks & metadata
 * @param {(order: object) => void} [options.onFilled] - called when order fills
 * @param {(order: object) => void} [options.onRejected] - called when order is rejected
 * @param {(order: object) => void} [options.onCanceled] - called when order is canceled
 * @param {(order: object) => void} [options.onUpdate] - called on any status change
 * @param {object} [options.metadata] - arbitrary metadata (e.g. Renko signal info)
 */
export function trackOrder(orderId, options = {}) {
  if (!orderId) {
    console.warn("[order-tracker] trackOrder called with no orderId");
    return;
  }

  const existing = trackedOrders.get(orderId);
  const entry = {
    order: existing?.order || { id: orderId },
    options: {
      onFilled: options.onFilled || null,
      onRejected: options.onRejected || null,
      onCanceled: options.onCanceled || null,
      onUpdate: options.onUpdate || null,
      metadata: options.metadata || existing?.options?.metadata || null,
    },
    lastStatus: existing?.lastStatus || "new",
    completedAt: existing?.completedAt || null,
  };

  trackedOrders.set(orderId, entry);

  // Ensure polling is running
  startPolling();
}

/**
 * Stop tracking an order.
 * @param {string} orderId
 */
export function stopTracking(orderId) {
  trackedOrders.delete(orderId);

  // Stop polling if no active orders
  if (getActiveOrders().length === 0) {
    stopPolling();
  }
}

/**
 * Get the current tracked status of an order.
 * @param {string} orderId
 * @returns {object|null} { order, status, metadata, completedAt }
 */
export function getOrderStatus(orderId) {
  const entry = trackedOrders.get(orderId);
  if (!entry) return null;

  return {
    order: entry.order,
    status: entry.lastStatus,
    metadata: entry.options.metadata,
    completedAt: entry.completedAt,
  };
}

/**
 * Get all orders currently being tracked (active + recently completed).
 * @returns {Array<{ orderId: string, status: string, order: object, metadata: object }>}
 */
export function getActiveOrders() {
  const result = [];
  for (const [orderId, entry] of trackedOrders) {
    result.push({
      orderId,
      status: entry.lastStatus,
      order: entry.order,
      metadata: entry.options.metadata,
    });
  }
  return result;
}

/**
 * Remove completed orders older than 1 hour.
 * @returns {number} Number of orders cleared
 */
export function clearCompleted() {
  const now = Date.now();
  let cleared = 0;

  for (const [orderId, entry] of trackedOrders) {
    if (entry.completedAt && now - entry.completedAt > COMPLETED_TTL) {
      trackedOrders.delete(orderId);
      cleared++;
    }
  }

  // Stop polling if no active orders remain
  if (getActiveOrders().length === 0) {
    stopPolling();
  }

  return cleared;
}

/**
 * Bulk-update tracked orders from a list fetched from the BFF.
 * Used by the OrderTracker component to sync state.
 * @param {Array<object>} orders - Alpaca order objects from BFF
 */
export function syncOrders(orders) {
  if (!Array.isArray(orders)) return;

  for (const order of orders) {
    const orderId = order.id;
    if (!orderId) continue;

    const entry = trackedOrders.get(orderId);
    const newStatus = order.status;

    if (entry) {
      // Detect state transitions
      if (entry.lastStatus !== newStatus) {
        const prevStatus = entry.lastStatus;
        entry.lastStatus = newStatus;
        entry.order = order;

        // Mark completion time
        if (isTerminalStatus(newStatus) && !entry.completedAt) {
          entry.completedAt = Date.now();
        }

        // Fire callbacks
        const { onFilled, onRejected, onCanceled, onUpdate } = entry.options;
        if (newStatus === "filled" && onFilled) onFilled(order);
        if (newStatus === "rejected" && onRejected) onRejected(order);
        if (newStatus === "canceled" && onCanceled) onCanceled(order);
        if (onUpdate) onUpdate(order, prevStatus, newStatus);
      } else {
        // Update order data even if status unchanged (e.g. filled_qty changes)
        entry.order = order;
      }
    } else {
      // Auto-track orders we haven't seen before (from BFF listing)
      trackedOrders.set(orderId, {
        order,
        options: {
          onFilled: null,
          onRejected: null,
          onCanceled: null,
          onUpdate: null,
          metadata: null,
        },
        lastStatus: newStatus,
        completedAt: isTerminalStatus(newStatus) ? Date.now() : null,
      });
    }
  }
}

/**
 * Get summary statistics for tracked orders.
 * @returns {{ open: number, filled: number, rejected: number, canceled: number, total: number, fillRate: number }}
 */
export function getTrackingSummary() {
  let open = 0;
  let filled = 0;
  let rejected = 0;
  let canceled = 0;

  for (const [, entry] of trackedOrders) {
    switch (entry.lastStatus) {
      case "new":
      case "partially_filled":
        open++;
        break;
      case "filled":
        filled++;
        break;
      case "rejected":
        rejected++;
        break;
      case "canceled":
        canceled++;
        break;
    }
  }

  const total = filled + rejected + canceled;
  const fillRate = total > 0 ? (filled / total) * 100 : 0;

  return { open, filled, rejected, canceled, total: trackedOrders.size, fillRate };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isTerminalStatus(status) {
  return status === "filled" || status === "rejected" || status === "canceled" || status === "expired";
}

function startPolling() {
  if (isPolling) return;
  isPolling = true;
  // Polling is driven by the OrderTracker component's useEffect
  // The tracker lib provides the data layer; the component drives refresh
}

function stopPolling() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/**
 * Check if polling is currently active.
 * @returns {boolean}
 */
export function isPollingActive() {
  return isPolling;
}
