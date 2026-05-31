/**
 * Alpaca Broker Adapter — implements the standard broker interface
 * by delegating to the existing alpaca-client.js functions.
 *
 * This adapter normalizes Alpaca-specific errors into the standard
 * { data, error } format and adds request/response logging for audit.
 *
 * Usage:
 *   import { createAlpacaBroker } from '@/lib/brokers/alpaca-adapter';
 *   const broker = createAlpacaBroker({ apiKey, secretKey, mode: 'paper' });
 *   const { data, error } = await broker.getAccount();
 */

import {
  alpacaFetch,
  getAccount,
  getOrders,
  createOrder,
  getPositions,
  getPortfolioHistory,
  getActivities,
} from '@/lib/alpaca-client';
import {
  validateBrokerAdapter,
  brokerError,
  brokerSuccess,
} from './index';

// ── Alpaca-specific error mapping ────────────────────────────────────────────

/**
 * Map Alpaca API error patterns to standardized error codes and status.
 */
const ALPACA_ERROR_MAP = [
  { pattern: /invalid.*api.*key|authentication.*failed|40140|40110|APCA-API-KEY-ID/i, code: 'INVALID_KEYS', status: 401 },
  { pattern: /rate limit|too many requests|429/i, code: 'RATE_LIMITED', status: 429 },
  { pattern: /insufficient.*buying.*power|insufficient.*funds/i, code: 'INSUFFICIENT_FUNDS', status: 400 },
  { pattern: /market.*closed|not.*open.*for.*trading/i, code: 'MARKET_CLOSED', status: 400 },
  { pattern: /not.*tradeable|symbol.*not.*found|asset.*not.*found/i, code: 'INVALID_SYMBOL', status: 400 },
  { pattern: /order.*not.*found/i, code: 'ORDER_NOT_FOUND', status: 404 },
  { pattern: /Alpaca API keys are required/i, code: 'NO_KEYS', status: 403 },
  { pattern: /non-JSON response/i, code: 'BROKER_UNAVAILABLE', status: 502 },
  { pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network error/i, code: 'CONNECTION_FAILED', status: 502 },
];

/**
 * Normalize an Alpaca error into the standard broker error format.
 *
 * @param {Error|string} err — The raw error from alpaca-client
 * @param {string} method — The broker method that threw (for logging)
 * @returns {{ data: null, error: { message: string, code: string, status: number } }}
 */
function normalizeError(err, method) {
  const message = typeof err === 'string' ? err : err?.message || String(err);

  // Always log for audit trail
  console.error(`[AlpacaAdapter] ${method} failed:`, message);

  // Check against known Alpaca error patterns
  for (const rule of ALPACA_ERROR_MAP) {
    if (rule.pattern.test(message)) {
      return brokerError(message, rule.code, rule.status);
    }
  }

  // Generic fallback
  return brokerError(message, 'BROKER_ERROR', 500);
}

// ── Adapter factory ──────────────────────────────────────────────────────────

/**
 * Create an Alpaca broker adapter.
 *
 * @param {object} config
 * @param {string} config.apiKey — Alpaca API key
 * @param {string} config.secretKey — Alpaca secret key
 * @param {"paper"|"live"} [config.mode="paper"] — Trading mode
 * @returns {object} Broker adapter implementing all BROKER_METHODS
 */
export function createAlpacaBroker({ apiKey, secretKey, mode = 'paper' } = {}) {
  if (!apiKey || !secretKey) {
    throw new Error('Alpaca broker adapter requires apiKey and secretKey');
  }

  const adapter = {
    // ── Metadata ────────────────────────────────────────────────────────
    brokerId: mode === 'live' ? 'alpaca_live' : 'alpaca_paper',
    mode,

    // ── Read methods ────────────────────────────────────────────────────

    /**
     * Get the trading account details.
     * @returns {Promise<{data, error}>}
     */
    async getAccount() {
      try {
        const data = await getAccount(apiKey, secretKey, mode);
        console.log(`[AlpacaAdapter] getAccount OK — account_number=${data.account_number}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, 'getAccount');
      }
    },

    /**
     * Get open positions.
     * @returns {Promise<{data, error}>}
     */
    async getPositions() {
      try {
        const data = await getPositions(apiKey, secretKey, mode);
        console.log(`[AlpacaAdapter] getPositions OK — count=${data.length}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, 'getPositions');
      }
    },

    /**
     * Get orders (open and historical).
     * @param {object} [opts]
     * @param {string} [opts.status="all"]
     * @param {string} [opts.after] — ISO date filter
     * @returns {Promise<{data, error}>}
     */
    async getOrders(opts = {}) {
      try {
        const data = await getOrders(apiKey, secretKey, {
          status: opts.status || 'all',
          after: opts.after || null,
          mode,
        });
        console.log(`[AlpacaAdapter] getOrders OK — count=${data.length}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, 'getOrders');
      }
    },

    /**
     * Get portfolio equity history.
     * @param {object} [opts]
     * @param {string} [opts.period="1M"]
     * @param {string} [opts.timeframe="1D"]
     * @returns {Promise<{data, error}>}
     */
    async getPortfolioHistory(opts = {}) {
      try {
        const data = await getPortfolioHistory(apiKey, secretKey, {
          period: opts.period || '1M',
          timeframe: opts.timeframe || '1D',
          mode,
        });
        console.log(`[AlpacaAdapter] getPortfolioHistory OK`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, 'getPortfolioHistory');
      }
    },

    /**
     * Get account activities (fills, dividends, etc.).
     * @param {object} [opts]
     * @param {string} [opts.activity_types="FILL"]
     * @param {string} [opts.after]
     * @param {string} [opts.until]
     * @param {string} [opts.direction="desc"]
     * @param {number} [opts.page_size=100]
     * @returns {Promise<{data, error}>}
     */
    async getActivities(opts = {}) {
      try {
        const data = await getActivities(apiKey, secretKey, {
          activity_types: opts.activity_types || 'FILL',
          after: opts.after || null,
          until: opts.until || null,
          direction: opts.direction || 'desc',
          page_size: opts.page_size || 100,
          mode,
        });
        console.log(`[AlpacaAdapter] getActivities OK — count=${data.length}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, 'getActivities');
      }
    },

    /**
     * Get asset info for a symbol (checks if tradeable on Alpaca).
     * @param {string} symbol — The symbol to look up
     * @returns {Promise<{data, error}>}
     */
    async getAsset(symbol) {
      if (!symbol) {
        return brokerError('Symbol is required', 'VALIDATION_ERROR', 400);
      }
      try {
        const data = await alpacaFetch(`/assets/${symbol.toUpperCase()}`, {
          apiKey,
          secretKey,
          mode,
        });
        console.log(`[AlpacaAdapter] getAsset OK — symbol=${symbol}, tradable=${data.tradable}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, `getAsset(${symbol})`);
      }
    },

    // ── Write methods ───────────────────────────────────────────────────

    /**
     * Create a new order.
     * @param {object} order — Order parameters
     * @param {string} order.symbol
     * @param {number} [order.qty=100]
     * @param {"buy"|"sell"} [order.side="buy"]
     * @param {"market"|"limit"|"stop"|"stop_limit"|"trailing_stop"} [order.type="market"]
     * @param {"day"|"gtc"|"ioc"} [order.time_in_force="day"]
     * @param {string} [order.limit_price]
     * @param {string} [order.stop_price]
     * @param {string} [order.trail_price]
     * @param {string} [order.trail_percent]
     * @returns {Promise<{data, error}>}
     */
    async createOrder(order) {
      if (!order?.symbol) {
        return brokerError('Order symbol is required', 'VALIDATION_ERROR', 400);
      }
      try {
        const data = await createOrder(apiKey, secretKey, order, mode);
        console.log(`[AlpacaAdapter] createOrder OK — id=${data.id}, symbol=${order.symbol}, side=${order.side || 'buy'}`);
        return brokerSuccess(data);
      } catch (err) {
        return normalizeError(err, `createOrder(${order.symbol})`);
      }
    },

    /**
     * Cancel an existing order by ID.
     * @param {string} orderId — The Alpaca order ID to cancel
     * @returns {Promise<{data, error}>}
     */
    async cancelOrder(orderId) {
      if (!orderId) {
        return brokerError('Order ID is required', 'VALIDATION_ERROR', 400);
      }
      try {
        // Alpaca DELETE /v2/orders/{order_id} returns 204 with no body on success
        await alpacaFetch(`/orders/${orderId}`, {
          apiKey,
          secretKey,
          method: 'DELETE',
          mode,
        });
        console.log(`[AlpacaAdapter] cancelOrder OK — orderId=${orderId}`);
        return brokerSuccess({ id: orderId, status: 'canceled' });
      } catch (err) {
        return normalizeError(err, `cancelOrder(${orderId})`);
      }
    },

    // ── Validation ──────────────────────────────────────────────────────

    /**
     * Validate that the stored credentials work by calling getAccount.
     * @returns {Promise<{data: {valid: boolean, account?: object}, error}>}
     */
    async validateCredentials() {
      try {
        const account = await getAccount(apiKey, secretKey, mode);
        console.log(`[AlpacaAdapter] validateCredentials OK — account_number=${account.account_number}`);
        return brokerSuccess({ valid: true, account });
      } catch (err) {
        console.warn(`[AlpacaAdapter] validateCredentials failed:`, err.message);
        return brokerSuccess({ valid: false });
      }
    },
  };

  // Verify the adapter implements all required methods
  validateBrokerAdapter(adapter, adapter.brokerId);

  return adapter;
}
