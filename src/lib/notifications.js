/**
 * Lightweight notification manager with subscriber pattern.
 * Stores notifications in a simple array (max 8, FIFO).
 * Supports optional title, action buttons, and grouping.
 */

const MAX_NOTIFICATIONS = 8;

let notifications = [];
let nextId = 1;
const subscribers = new Set();

function notifySubscribers() {
  subscribers.forEach((cb) => cb([...notifications]));
}

/**
 * Add a new notification.
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} message
 * @param {number} [duration=4000] - auto-dismiss in ms (0 = persistent)
 * @param {object} [options] - additional options
 * @param {string} [options.title] - optional title for richer toasts
 * @param {{label: string, onClick: function}} [options.action] - optional action button
 * @param {string} [options.group] - optional group key (e.g., "regime", "stream", "order")
 */
export function notify(type, message, duration = 4000, options = {}) {
  const id = nextId++;
  const notification = {
    id,
    type,
    message,
    duration,
    ...(options.title && { title: options.title }),
    ...(options.action && { action: options.action }),
    ...(options.group && { group: options.group }),
  };

  notifications.push(notification);

  // FIFO: remove oldest if over max
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.shift();
  }

  notifySubscribers();

  // Auto-dismiss after duration (0 = persistent)
  if (duration > 0) {
    setTimeout(() => {
      dismiss(id);
    }, duration);
  }

  return id;
}

/**
 * Add a persistent notification that doesn't auto-dismiss.
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} message
 * @param {object} [options] - additional options (title, action, group)
 */
export function notifyPersistent(type, message, options = {}) {
  return notify(type, message, 0, options);
}

/**
 * Dismiss a notification by id.
 * @param {number} id
 */
export function dismiss(id) {
  const index = notifications.findIndex((n) => n.id === id);
  if (index !== -1) {
    notifications.splice(index, 1);
    notifySubscribers();
  }
}

/**
 * Dismiss all notifications in a given group.
 * @param {string} group - the group key to dismiss
 */
export function dismissByGroup(group) {
  const before = notifications.length;
  notifications = notifications.filter((n) => n.group !== group);
  if (notifications.length !== before) {
    notifySubscribers();
  }
}

/**
 * Subscribe to notification changes.
 * @param {(notifications: Array) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function subscribe(callback) {
  subscribers.add(callback);
  // Immediately fire with current state
  callback([...notifications]);
  return () => {
    subscribers.delete(callback);
  };
}

/** Convenience helpers */
export function notifySuccess(message, duration, options) {
  return notify("success", message, duration, options);
}

export function notifyError(message, duration, options) {
  return notify("error", message, duration, options);
}

export function notifyWarning(message, duration, options) {
  return notify("warning", message, duration, options);
}

export function notifyInfo(message, duration, options) {
  return notify("info", message, duration, options);
}

// ── Preference-aware notification dispatch ───────────────────────────────────
//
// dispatchNotification(type, data, userId)
//
// Checks user's notification preferences before sending.
//   - If in_app is enabled, fires the existing notify() function.
//   - If Discord is enabled, fires a BFF POST to send via webhook.
//   - Respects quiet hours (suppresses non-critical during quiet time).
//
// This is an EXPORT only — existing code doesn't need to call it yet.
// Intended for future integration as the single entry point for all notifications.

// In-memory preference cache (avoids excessive API calls)
let _prefCache = null;
let _prefCacheExpiry = 0;
const PREF_CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch user notification preferences (cached for 1 minute).
 * @returns {Promise<object|null>} Preferences object or null on failure
 */
async function fetchPreferences() {
  const now = Date.now();
  if (_prefCache && now < _prefCacheExpiry) {
    return _prefCache;
  }

  try {
    const res = await fetch("/api/notifications/preferences");
    if (res.ok) {
      const data = await res.json();
      _prefCache = data.preferences;
      _prefCacheExpiry = now + PREF_CACHE_TTL;
      return _prefCache;
    }
  } catch {
    // Fail silently — in-app notifications should still work
  }
  return null;
}

/**
 * Check if current time is within quiet hours.
 * @param {object} quietHours - Quiet hours config { enabled, start, end, timezone }
 * @returns {boolean} True if currently in quiet hours
 */
function isInQuietHours(quietHours) {
  if (!quietHours || !quietHours.enabled) return false;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: quietHours.timezone || "America/New_York",
    });

    const currentTimeStr = formatter.format(now);
    const [currentHour, currentMin] = currentTimeStr.split(":").map(Number);
    const currentMinutes = currentHour * 60 + currentMin;

    const [startHour, startMin] = (quietHours.start || "22:00").split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;

    const [endHour, endMin] = (quietHours.end || "07:00").split(":").map(Number);
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 → 07:00)
    if (startMinutes > endMinutes) {
      // Starts at night, ends next morning
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Same-day range (e.g., 12:00 → 14:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

/**
 * Critical alert types that bypass quiet hours.
 */
const CRITICAL_ALERT_TYPES = new Set(["kill_switch", "risk_breach", "price_alert"]);

/**
 * Dispatch a notification through the user's preferred channels.
 * Checks notification preferences before sending, respects quiet hours.
 *
 * @param {string} type - Alert type key (e.g., 'trade_filled', 'risk_breach', 'kill_switch')
 * @param {object} data - Notification data
 * @param {string} data.message - Human-readable message
 * @param {'success'|'error'|'warning'|'info'} [data.severity='info'] - Severity level
 * @param {string} [data.title] - Optional title
 * @param {string} [data.symbol] - Optional symbol
 * @param {object} [data.metadata] - Optional additional metadata
 * @param {string} [userId] - Optional user ID (for future server-side dispatch)
 * @returns {Promise<{in_app: boolean, discord: boolean, suppressed: boolean}>}
 */
export async function dispatchNotification(type, data = {}, userId = null) {
  const result = { in_app: false, discord: false, suppressed: false };

  try {
    const prefs = await fetchPreferences();

    // If no preferences available, fall through with defaults (in_app only)
    const channels = prefs?.channels || { in_app: true, discord: false, email: false };
    const alertTypes = prefs?.alert_types || {};
    const quietHours = prefs?.quiet_hours || { enabled: false };

    // Check if this alert type is enabled
    const isAlertTypeEnabled = alertTypes[type] !== false; // Default to true if not explicitly disabled
    if (!isAlertTypeEnabled) {
      result.suppressed = true;
      return result;
    }

    // Check quiet hours — suppress non-critical alerts during quiet time
    const isCritical = CRITICAL_ALERT_TYPES.has(type);
    const quietHoursActive = isInQuietHours(quietHours);
    const shouldSuppress = quietHoursActive && !isCritical;

    if (shouldSuppress) {
      result.suppressed = true;
      return result;
    }

    // ── In-App channel ──────────────────────────────────────────────────
    if (channels.in_app !== false) {
      const notifyType = data.severity === "error" ? "error"
        : data.severity === "warning" ? "warning"
        : data.severity === "success" ? "success"
        : "info";

      notify(notifyType, data.message || "Notification", 4000, {
        title: data.title,
        group: type,
      });
      result.in_app = true;
    }

    // ── Discord channel ─────────────────────────────────────────────────
    if (channels.discord) {
      try {
        // Route through BFF alerts endpoint for Discord dispatch
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: mapAlertTypeToCategory(type),
            symbol: data.symbol || "system",
            message: data.message || "Notification",
            severity: data.severity || "info",
            data: { ...data.metadata, alert_type: type },
          }),
        });
        result.discord = res.ok;
      } catch {
        result.discord = false;
      }
    }

    return result;
  } catch (err) {
    // Graceful fallback — always show in-app notification
    notify("info", data.message || "Notification", 4000, { title: data.title, group: type });
    result.in_app = true;
    return result;
  }
}

/**
 * Map fine-grained alert type keys to the coarse alert categories
 * used by the /api/alerts endpoint.
 *
 * @param {string} type - Fine-grained alert type (e.g., 'trade_filled')
 * @returns {string} Coarse alert category (SIGNAL | TRADE | RISK | REGIME | SYSTEM)
 */
function mapAlertTypeToCategory(type) {
  const mapping = {
    trade_filled: "TRADE",
    trade_rejected: "TRADE",
    order_submitted: "TRADE",
    risk_breach: "RISK",
    kill_switch: "RISK",
    mode_change: "SYSTEM",
    pnl_threshold: "TRADE",
    regime_change: "REGIME",
    strategy_signal: "SIGNAL",
    campaign_complete: "SYSTEM",
    reconciliation: "SYSTEM",
    price_alert: "PRICE",
  };
  return mapping[type] || "SYSTEM";
}

/**
 * Invalidate the preferences cache (e.g., after user updates preferences).
 */
export function invalidatePreferenceCache() {
  _prefCache = null;
  _prefCacheExpiry = 0;
}
