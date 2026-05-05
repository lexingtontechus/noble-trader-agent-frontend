const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000), // 60s timeout for Render cold starts
      });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      // 5xx — retry
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, (i + 1) * 2000)); // exponential backoff
    }
  }
}

export async function analyseFull(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    base_risk_limit: options.base_risk_limit ?? 0.02,
  };

  const res = await fetchWithRetry(`${FASTAPI_BASE}/analyse/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function detectRegime(prices, symbol = "UNKNOWN") {
  const res = await fetchWithRetry(`${FASTAPI_BASE}/regime/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices, symbol }),
  });
  return res.json();
}

export async function sizeKelly(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    use_regime: options.use_regime ?? true,
  };
  if (options.returns) body.returns = options.returns;

  const res = await fetchWithRetry(`${FASTAPI_BASE}/size/kelly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function analyseRisk(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    use_regime: options.use_regime ?? true,
    base_risk_limit: options.base_risk_limit ?? 0.02,
  };
  if (options.returns) body.returns = options.returns;

  const res = await fetchWithRetry(`${FASTAPI_BASE}/risk/analyse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function checkHealth() {
  const start = Date.now();
  try {
    const res = await fetch(`${FASTAPI_BASE}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    if (res.ok) return { status: "online", latency_ms: latency };
    return { status: "degraded", latency_ms: latency };
  } catch {
    return { status: "offline", latency_ms: Date.now() - start };
  }
}

// ── Streaming API ─────────────────────────────────────────────────────────────

/** Seed a streaming session with historical prices */
export async function seedSession(symbol, prices, options = {}) {
  const body = {
    symbol,
    prices,
    window: options.window ?? 500,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    base_risk_limit: options.base_risk_limit ?? 0.02,
    refit_every: options.refit_every ?? 50,
  };

  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Push one price tick, receive regime snapshot */
export async function pushTick(symbol, price, ts = null) {
  const body = { symbol, price };
  if (ts != null) body.ts = ts;

  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** List all active streaming sessions */
export async function getSessions() {
  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/sessions`, {
    method: "GET",
  });
  return res.json();
}

/** Get the SSE URL for a symbol stream */
export function getSSEUrl(symbol) {
  return `${FASTAPI_BASE}/sse/${encodeURIComponent(symbol)}`;
}

/** Get the SSE URL for the global alert stream */
export function getAlertsSSEUrl() {
  return `${FASTAPI_BASE}/sse/alerts`;
}

// ── v2.1 Simulation + Portfolio API ──────────────────────────────────────────

/**
 * Run Monte Carlo regime transition simulation.
 * POST /simulate/{symbol}
 *
 * @param {string} symbol - Ticker symbol
 * @param {number[]} prices - Historical prices (min 81)
 * @param {Object} options - Optional params
 * @param {number} [options.horizon=20] - Forward bars to simulate (1-252)
 * @param {number} [options.n_paths=500] - Monte Carlo paths (50-5000)
 * @param {number} [options.seed=42] - Random seed for reproducibility
 * @param {number} [options.current_price] - Override starting price (defaults to prices[-1])
 * @returns {Promise<Object>} Simulation result with price fan, risk metrics, regime occupancy
 */
export async function simulateRegime(symbol, prices, options = {}) {
  const body = {
    prices,
    horizon: options.horizon ?? 20,
    n_paths: options.n_paths ?? 500,
    seed: options.seed ?? 42,
  };
  if (options.current_price != null) body.current_price = options.current_price;

  const res = await fetchWithRetry(
    `${FASTAPI_BASE}/simulate/${encodeURIComponent(symbol)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}

/**
 * Get aggregated portfolio regime + risk summary.
 * GET /portfolio
 *
 * @param {Object} options - Optional query params
 * @param {string} [options.symbols] - Comma-separated symbol list (omit for all active sessions)
 * @param {number} [options.kelly_fraction=0.5] - Kelly fraction
 * @param {number} [options.target_vol=0.15] - Target volatility
 * @returns {Promise<Object>} Portfolio view with per-symbol breakdowns + risk flags
 */
export async function getPortfolio(options = {}) {
  const params = new URLSearchParams();
  if (options.symbols) params.set("symbols", options.symbols);
  if (options.kelly_fraction != null)
    params.set("kelly_fraction", String(options.kelly_fraction));
  if (options.target_vol != null)
    params.set("target_vol", String(options.target_vol));

  const qs = params.toString();
  const url = `${FASTAPI_BASE}/portfolio${qs ? `?${qs}` : ""}`;

  const res = await fetchWithRetry(url, {
    method: "GET",
  });
  return res.json();
}

// ── v3.0 Correlation + Optimization API ──────────────────────────────────────

/**
 * Detect correlation regime across a basket of symbols.
 * POST /correlation/detect
 *
 * @param {string[]} symbols - List of ticker symbols
 * @param {Object<string, number[]>} returnsMatrix - Symbol → returns array mapping
 * @param {Object} options - Optional params
 * @param {number} [options.window=60] - Rolling window for correlation estimation
 * @param {number} [options.kelly_fraction=0.5] - Kelly fraction for risk scaling
 * @param {number} [options.target_vol=0.15] - Target volatility
 * @returns {Promise<Object>} Correlation result with regime, matrix, blended risk multiplier
 */
export async function detectCorrelation(symbols, returnsMatrix, options = {}) {
  const body = {
    symbols,
    returns_matrix: returnsMatrix,
    window: options.window ?? 60,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
  };

  const res = await fetchWithRetry(`${FASTAPI_BASE}/correlation/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Optimise portfolio weights given returns and risk constraints.
 * POST /optimise/full
 *
 * @param {string[]} symbols - List of ticker symbols
 * @param {Object<string, number[]>} returnsMatrix - Symbol → returns array mapping
 * @param {Object} options - Optional params
 * @param {Object<string, number>} [options.current_weights] - Current position weights { symbol: weight }
 * @param {number} [options.kelly_fraction=0.5] - Kelly fraction
 * @param {number} [options.target_vol=0.15] - Target volatility
 * @param {number} [options.max_dd=0.20] - Maximum acceptable drawdown
 * @returns {Promise<Object>} Optimization result with optimal weights, exposure scalar, constraints
 */
export async function optimisePortfolio(symbols, returnsMatrix, options = {}) {
  const body = {
    symbols,
    returns_matrix: returnsMatrix,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    max_dd: options.max_dd ?? 0.2,
  };
  if (options.current_weights) body.current_weights = options.current_weights;

  const res = await fetchWithRetry(`${FASTAPI_BASE}/optimise/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
