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
