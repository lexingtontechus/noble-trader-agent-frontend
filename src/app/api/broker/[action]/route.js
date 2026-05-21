/**
 * BFF Route: /api/broker/[action]
 *
 * Broker-abstraction layer that proxies broker operations through
 * the adapter pattern. This is the NEW preferred path for all
 * broker operations — it supports any broker (not just Alpaca)
 * through the factory/adapter pattern.
 *
 * The existing /api/alpaca/* and /api/trading/* routes continue
 * to work unchanged. This route is an ALTERNATIVE that uses the
 * abstraction layer.
 *
 * Auth:
 *   Read actions (account, positions, orders, etc.): viewer+
 *   Write actions (create-order, cancel-order): trader+
 *
 * Supported actions:
 *   account           — GET  — Account details
 *   positions         — GET  — Open positions
 *   orders            — GET  — Order history
 *   portfolio-history — GET  — Equity curve
 *   activities        — GET  — Trade fills, dividends, etc.
 *   validate          — GET  — Validate credentials
 *   asset             — GET  — Check if symbol is tradeable
 *   create-order      — POST — Place a new order
 *   cancel-order      — POST — Cancel an existing order
 */

import { withAuth } from '@/lib/withAuth';
import { resolveBrokerConfig } from '@/lib/alpaca-credentials';
import { createBroker } from '@/lib/brokers/broker-factory';
import { READ_ACTIONS, WRITE_ACTIONS, ALL_ACTIONS } from '@/lib/brokers/index';
import { createApiError } from '@/lib/error-messages';

// ── Action → broker method mapping ───────────────────────────────────────────

const ACTION_METHOD_MAP = {
  'account': 'getAccount',
  'positions': 'getPositions',
  'orders': 'getOrders',
  'portfolio-history': 'getPortfolioHistory',
  'activities': 'getActivities',
  'validate': 'validateCredentials',
  'asset': 'getAsset',
  'create-order': 'createOrder',
  'cancel-order': 'cancelOrder',
};

// ── Helper: resolve broker from request ──────────────────────────────────────

async function getBrokerFromRequest(request) {
  const config = await resolveBrokerConfig(request);
  if (!config) {
    return null;
  }
  return createBroker(config);
}

// ── Helper: parse query params for GET actions ───────────────────────────────

function parseSearchParams(request) {
  const { searchParams } = new URL(request.url);
  return {
    // Orders
    status: searchParams.get('status') || undefined,
    after: searchParams.get('after') || undefined,
    // Portfolio history
    period: searchParams.get('period') || undefined,
    timeframe: searchParams.get('timeframe') || undefined,
    // Activities
    activity_types: searchParams.get('activity_types') || undefined,
    until: searchParams.get('until') || undefined,
    direction: searchParams.get('direction') || undefined,
    page_size: searchParams.get('page_size')
      ? parseInt(searchParams.get('page_size'))
      : undefined,
    // Asset
    symbol: searchParams.get('symbol') || undefined,
  };
}

// ── Helper: parse body for POST actions ──────────────────────────────────────

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ── Core handler ─────────────────────────────────────────────────────────────

async function handleBrokerAction(request, params, _authContext) {
  const { action } = await params;

  // Validate action
  if (!ALL_ACTIONS.has(action)) {
    return Response.json(
      {
        error: `Unknown broker action: "${action}". Supported: ${[...ALL_ACTIONS].join(', ')}`,
        code: 'INVALID_ACTION',
      },
      { status: 400 }
    );
  }

  // Resolve broker adapter
  const broker = await getBrokerFromRequest(request);
  if (!broker) {
    return Response.json(
      {
        error: 'Your trading account is not connected yet. Add your Alpaca API keys to get started.',
        code: 'NO_KEYS',
      },
      { status: 403 }
    );
  }

  // Map action to broker method
  const methodName = ACTION_METHOD_MAP[action];
  if (!methodName || typeof broker[methodName] !== 'function') {
    return Response.json(
      {
        error: `Broker does not support action: "${action}"`,
        code: 'UNSUPPORTED_ACTION',
      },
      { status: 400 }
    );
  }

  // Build method arguments based on action type
  let result;

  if (READ_ACTIONS.has(action)) {
    // Read actions: params from query string
    const queryParams = parseSearchParams(request);

    switch (action) {
      case 'orders':
        result = await broker.getOrders({
          status: queryParams.status,
          after: queryParams.after,
        });
        break;
      case 'portfolio-history':
        result = await broker.getPortfolioHistory({
          period: queryParams.period,
          timeframe: queryParams.timeframe,
        });
        break;
      case 'activities':
        result = await broker.getActivities({
          activity_types: queryParams.activity_types,
          after: queryParams.after,
          until: queryParams.until,
          direction: queryParams.direction,
          page_size: queryParams.page_size,
        });
        break;
      case 'asset':
        if (!queryParams.symbol) {
          return Response.json(
            { error: 'symbol query parameter is required for asset action', code: 'VALIDATION_ERROR' },
            { status: 400 }
          );
        }
        result = await broker.getAsset(queryParams.symbol);
        break;
      default:
        // account, positions, validate — no params
        result = await broker[methodName]();
        break;
    }
  } else {
    // Write actions: params from request body
    const body = await parseBody(request);

    switch (action) {
      case 'create-order':
        if (!body.symbol) {
          return Response.json(
            { error: 'symbol is required', code: 'VALIDATION_ERROR' },
            { status: 400 }
          );
        }
        if (!body.side || !['buy', 'sell'].includes(body.side)) {
          return Response.json(
            { error: "side must be 'buy' or 'sell'", code: 'VALIDATION_ERROR' },
            { status: 400 }
          );
        }
        result = await broker.createOrder(body);
        break;

      case 'cancel-order':
        if (!body.orderId) {
          return Response.json(
            { error: 'orderId is required', code: 'VALIDATION_ERROR' },
            { status: 400 }
          );
        }
        result = await broker.cancelOrder(body.orderId);
        break;

      default:
        result = await broker[methodName](body);
        break;
    }
  }

  // Return result
  if (result.error) {
    return Response.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status }
    );
  }

  return Response.json(result.data);
}

// ── Route exports ────────────────────────────────────────────────────────────

/**
 * GET /api/broker/[action]
 * Read operations — viewer+ access
 */
export const GET = withAuth(
  async (request, { params }, authContext) => {
    try {
      return await handleBrokerAction(request, params, authContext);
    } catch (error) {
      return createApiError(error, { context: 'broker' });
    }
  },
  { minRole: 'viewer' }
);

/**
 * POST /api/broker/[action]
 * Write operations — trader+ access
 */
export const POST = withAuth(
  async (request, { params }, authContext) => {
    try {
      return await handleBrokerAction(request, params, authContext);
    } catch (error) {
      return createApiError(error, { context: 'broker' });
    }
  },
  { minRole: 'trader' }
);
