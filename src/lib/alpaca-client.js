const ALPACA_BASE =
  process.env.ALPACA_PAPER_BASE_URL || "https://paper-api.alpaca.markets/v2";

export async function alpacaFetch(
  path,
  { apiKey, secretKey, method = "GET", body = null } = {},
) {
  if (!apiKey || !secretKey) {
    throw new Error("Alpaca API keys are required");
  }

  const headers = {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": secretKey,
    "Content-Type": "application/json",
  };

  const options = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${ALPACA_BASE}${path}`, options);

  // Handle non-JSON responses
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Alpaca API returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const message =
      data.message || data.error?.message || `Alpaca API error: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export async function getAccount(apiKey, secretKey) {
  return alpacaFetch("/account", { apiKey, secretKey });
}

export async function getOrders(
  apiKey,
  secretKey,
  { status = "all", after = null } = {},
) {
  let path = `/orders?status=${status}&direction=desc&limit=100`;
  if (after) path += `&after=${after}`;
  const result = await alpacaFetch(path, { apiKey, secretKey });
  return Array.isArray(result) ? result : [];
}

export async function createOrder(apiKey, secretKey, order) {
  return alpacaFetch("/orders", {
    apiKey,
    secretKey,
    method: "POST",
    body: {
      symbol: order.symbol,
      qty: String(order.qty || 100),
      side: order.side || "buy",
      type: order.type || "market",
      time_in_force: order.time_in_force || "day",
      ...(order.limit_price && { limit_price: String(order.limit_price) }),
    },
  });
}

export async function getPositions(apiKey, secretKey) {
  const result = await alpacaFetch("/positions", { apiKey, secretKey });
  return Array.isArray(result) ? result : [];
}
