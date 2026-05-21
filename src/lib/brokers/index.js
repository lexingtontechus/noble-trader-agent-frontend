/**
 * Broker Interface — all broker adapters must implement these methods.
 *
 * Each method returns { data, error } format consistent with the rest of the app.
 * On success: { data: <result>, error: null }
 * On failure: { data: null, error: { message, code, status } }
 *
 * Broker adapters are created via the factory (broker-factory.js),
 * not by direct instantiation. This ensures consistent configuration
 * and credential handling across all adapters.
 */

// ── Method contract ──────────────────────────────────────────────────────────

/**
 * List of methods every broker adapter must implement.
 * Used at adapter creation time to verify completeness.
 *
 * @type {string[]}
 */
export const BROKER_METHODS = [
  'getAccount',        // → { data: accountObject, error: null }
  'getPositions',      // → { data: position[], error: null }
  'getOrders',         // → { data: order[], error: null }
  'createOrder',       // → { data: orderObject, error: null }
  'cancelOrder',       // → { data: orderObject, error: null }
  'getPortfolioHistory', // → { data: historyObject, error: null }
  'getActivities',     // → { data: activity[], error: null }
  'getAsset',          // → { data: assetObject, error: null }
  'validateCredentials', // → { data: { valid: boolean }, error: null }
];

// ── Broker identifiers ───────────────────────────────────────────────────────

/**
 * Canonical broker IDs used throughout the app.
 * These are stored in user preferences and used by the factory
 * to resolve the correct broker adapter.
 *
 * @enum {string}
 */
export const BROKER_IDS = {
  ALPACA_PAPER: 'alpaca_paper',
  ALPACA_LIVE: 'alpaca_live',
  // Future brokers:
  // IBKR: 'ibkr',
  // TD_AMERITRADE: 'td_ameritrade',
  // SCHWAB: 'schwab',
};

// ── Role classification ──────────────────────────────────────────────────────

/**
 * Actions classified as read-only (viewer+ access).
 * @type {Set<string>}
 */
export const READ_ACTIONS = new Set([
  'account',
  'positions',
  'orders',
  'portfolio-history',
  'activities',
  'validate',
  'asset',
]);

/**
 * Actions classified as write/mutation (trader+ access).
 * @type {Set<string>}
 */
export const WRITE_ACTIONS = new Set([
  'create-order',
  'cancel-order',
]);

/**
 * All supported broker actions.
 * @type {Set<string>}
 */
export const ALL_ACTIONS = new Set([...READ_ACTIONS, ...WRITE_ACTIONS]);

// ── Validation helper ────────────────────────────────────────────────────────

/**
 * Validate that a broker adapter implements all required methods.
 * Throws if any method is missing.
 *
 * @param {object} adapter — The broker adapter instance to validate
 * @param {string} brokerId — Broker identifier for error messages
 * @throws {Error} If the adapter is missing any BROKER_METHODS
 */
export function validateBrokerAdapter(adapter, brokerId) {
  const missing = BROKER_METHODS.filter(
    (method) => typeof adapter[method] !== 'function'
  );
  if (missing.length > 0) {
    throw new Error(
      `Broker adapter "${brokerId}" is missing required methods: ${missing.join(', ')}`
    );
  }
}

/**
 * Standard error shape returned by all broker adapters.
 *
 * @param {string} message — Human-readable error description
 * @param {string} [code='BROKER_ERROR'] — Machine-readable error code
 * @param {number} [status=500] — HTTP status code
 * @returns {{ data: null, error: { message: string, code: string, status: number } }}
 */
export function brokerError(message, code = 'BROKER_ERROR', status = 500) {
  return { data: null, error: { message, code, status } };
}

/**
 * Standard success shape returned by all broker adapters.
 *
 * @param {*} data — The result data
 * @returns {{ data, error: null }}
 */
export function brokerSuccess(data) {
  return { data, error: null };
}
