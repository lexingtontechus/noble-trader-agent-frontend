const ALPACA_PAPER_BASE = process.env.ALPACA_PAPER_BASE_URL || "https://paper-api.alpaca.markets/v2";
const ALPACA_LIVE_BASE = process.env.ALPACA_LIVE_BASE_URL || "https://api.alpaca.markets/v2";

/**
 * Fetch from Alpaca API.
 * @param {string} path — API path (e.g., "/account")
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.secretKey
 * @param {string} [options.method="GET"]
 * @param {object} [options.body=null]
 * @param {"paper"|"live"} [options.mode="paper"] — Trading mode to select base URL
 */
export async function alpacaFetch(path, { apiKey, secretKey, method = "GET", body = null, mode = "paper" } = {}) {
  if (!apiKey || !secretKey) {
    throw new Error("Alpaca API keys are required");
  }

  const baseUrl = mode === "live" ? ALPACA_LIVE_BASE : ALPACA_PAPER_BASE;

  const headers = {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": secretKey,
    "Content-Type": "application/json",
  };

  const options = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${baseUrl}${path}`, options);

  // Handle non-JSON responses
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Alpaca API returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const message = data.message || data.error?.message || `Alpaca API error: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export async function getAccount(apiKey, secretKey, mode = "paper") {
  return alpacaFetch("/account", { apiKey, secretKey, mode });
}

export async function getOrders(apiKey, secretKey, { status = "all", after = null, mode = "paper" } = {}) {
  let path = `/orders?status=${status}&direction=desc&limit=100`;
  if (after) path += `&after=${after}`;
  const result = await alpacaFetch(path, { apiKey, secretKey, mode });
  return Array.isArray(result) ? result : [];
}

/**
 * Create an order on Alpaca.
 * Supports: market, limit, stop, stop_limit, trailing_stop
 * Also supports advanced order classes: bracket, oco, oto
 * Ref: https://docs.alpaca.markets/reference/postorder
 */
export async function createOrder(apiKey, secretKey, order, mode = "paper") {
  const body = {
    symbol: order.symbol,
    qty: String(order.qty || 100),
    side: order.side || "buy",
    type: order.type || "market",
    time_in_force: order.time_in_force || "day",
  };

  // Limit price — required for limit & stop_limit orders
  if (order.limit_price) {
    body.limit_price = String(order.limit_price);
  }

  // Stop price — required for stop & stop_limit orders
  if (order.stop_price) {
    body.stop_price = String(order.stop_price);
  }

  // Trailing stop — either trail_price or trail_percent (not both)
  if (order.trail_price) {
    body.trail_price = String(order.trail_price);
  }
  if (order.trail_percent) {
    body.trail_percent = String(order.trail_percent);
  }

  // Advanced order classes: bracket, oco, oto
  // Ref: https://docs.alpaca.markets/docs/orders-about#order-classes
  if (order.order_class) {
    body.order_class = order.order_class;
  }

  // Bracket order: take_profit + stop_loss legs
  if (order.take_profit) {
    body.take_profit = {};
    if (order.take_profit.limit_price) {
      body.take_profit.limit_price = String(order.take_profit.limit_price);
    }
  }

  if (order.stop_loss) {
    body.stop_loss = {};
    if (order.stop_loss.stop_price) {
      body.stop_loss.stop_price = String(order.stop_loss.stop_price);
    }
    if (order.stop_loss.limit_price) {
      body.stop_loss.limit_price = String(order.stop_loss.limit_price);
    }
  }

  return alpacaFetch("/orders", {
    apiKey,
    secretKey,
    method: "POST",
    body,
    mode,
  });
}

export async function getPositions(apiKey, secretKey, mode = "paper") {
  const result = await alpacaFetch("/positions", { apiKey, secretKey, mode });
  return Array.isArray(result) ? result : [];
}

/**
 * Get portfolio history (equity curve over time).
 * @param {string} apiKey
 * @param {string} secretKey
 * @param {{ period?: string, timeframe?: string, date_end?: string, extended_hours?: boolean }} opts
 *   period: "1D" | "1W" | "1M" | "3M" | "6M" | "1A" | "all"
 *   timeframe: "1Min" | "5Min" | "15Min" | "1H" | "1D"
 */
export async function getPortfolioHistory(apiKey, secretKey, { period = "1M", timeframe = "1D", mode = "paper" } = {}) {
  const params = new URLSearchParams({ period, timeframe });
  return alpacaFetch(`/account/portfolio/history?${params}`, { apiKey, secretKey, mode });
}

/**
 * Get account activities (trade fills, dividends, cash transactions, etc.)
 * @param {string} apiKey
 * @param {string} secretKey
 * @param {{ activity_types?: string, after?: string, until?: string, direction?: string, page_size?: number, mode?: string }} opts
 *   activity_types: comma-separated — "FILL", "DIV", "CSD", "CWD", "INT", "ASC", etc.
 *   after: ISO date string — start of date range
 *   until: ISO date string — end of date range
 *   direction: "asc" | "desc" (default "desc")
 *   page_size: max items to return (default 100, max 1000)
 */
export async function getActivities(apiKey, secretKey, { activity_types = "FILL", after = null, until = null, direction = "desc", page_size = 100, mode = "paper" } = {}) {
  const params = new URLSearchParams({ direction, page_size: String(page_size) });
  if (activity_types) params.set("activity_types", activity_types);
  if (after) params.set("after", after);
  if (until) params.set("until", until);
  const result = await alpacaFetch(`/account/activities?${params}`, { apiKey, secretKey, mode });
  return Array.isArray(result) ? result : [];
}
