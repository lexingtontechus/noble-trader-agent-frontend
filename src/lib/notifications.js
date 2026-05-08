/**
 * Lightweight notification manager with subscriber pattern.
 * Stores notifications in a simple array (max 5, FIFO).
 */

const MAX_NOTIFICATIONS = 5;

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
 * @param {number} [duration=4000] - auto-dismiss in ms
 */
export function notify(type, message, duration = 4000) {
  const id = nextId++;
  const notification = { id, type, message, duration };

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
export function notifySuccess(message, duration) {
  return notify("success", message, duration);
}

export function notifyError(message, duration) {
  return notify("error", message, duration);
}

export function notifyWarning(message, duration) {
  return notify("warning", message, duration);
}

export function notifyInfo(message, duration) {
  return notify("info", message, duration);
}
