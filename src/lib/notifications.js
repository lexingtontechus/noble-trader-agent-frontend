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
