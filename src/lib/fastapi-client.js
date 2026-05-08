const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

// ── Auth token cache ────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;

// ── Request deduplication ────────────────────────────────────────────────────
const pendingRequests = new Map();

/**
 * Generate a dedup key from URL + body.
 */
function dedupKey(url, body) {
  if (!body) return url;
  return `${url}::${typeof body === "string" ? body : JSON.stringify(body)}`;
}

/**
 * Deduplicated fetch wrapper.
 * If an identical request (same URL + body) is already in-flight,
 * return the same promise instead of firing a second request.
 */
async function fetchWithDedup(url, options = {}) {
  const body = options.body || null;
  const key = dedupKey(url, body);

  // Check for an in-flight identical request
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  // Create the request promise
  const requestPromise = fetchWithRetry(url, options).finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}

// Default timeout: 30s (60s for simulate which has longer cold-start needs)
const DEFAULT_TIMEOUT = 30000;
const SIMULATE_TIMEOUT = 60000;

/**
 * Fetch with retry and exponential backoff.
 * Backoff: 1s, 2s, 4s (1000 * 2^i)
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  for (let i = 0; i < retries; i++) {
    try {
      const headers = { ...options.headers };

      // Add auth header if token is provided
      if (options.auth) {
        if (options.auth.token_type === "api_key") {
          headers["X-API-Key"] = options.auth.access_token;
        } else {
          headers["Authorization"] = `Bearer ${options.auth.access_token}`;
        }
      }

      const res = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      // 5xx — retry
    } catch (e) {
      if (i === retries - 1) throw e;
      // Exponential backoff: 1000 * 2^i → 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
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

  const res = await fetchWithDedup(`${FASTAPI_BASE}/analyse/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function detectRegime(prices, symbol = "UNKNOWN") {
  const res = await fetchWithDedup(`${FASTAPI_BASE}/regime/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices, symbol }),
  });
  return res.json();
}

/**
 * Lightweight regime detection — calls the unprotected /regime/detect endpoint.
 * Alias for detectRegime, kept for semantic clarity in fallback paths.
 */
export async function detectRegimeOnly(prices, symbol = "UNKNOWN") {
  const res = await fetchWithDedup(`${FASTAPI_BASE}/regime/detect`, {
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

  const res = await fetchWithDedup(`${FASTAPI_BASE}/size/kelly`, {
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

  const res = await fetchWithDedup(`${FASTAPI_BASE}/risk/analyse`, {
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

/**
 * Get an auth token for the FastAPI backend.
 * Tries directly against the FastAPI backend (no HTTP round-trip to self).
 * Caches the token until it expires.
 * Returns null if auth is not available.
 */
export async function getFastApiToken() {
  // Return cached token if still valid
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  const FASTAPI_USER = process.env.FASTAPI_USER || "";
  const FASTAPI_PASSWORD = process.env.FASTAPI_PASSWORD || "";

  if (!FASTAPI_USER || !FASTAPI_PASSWORD) {
    return null;
  }

  try {
    // Strategy 1: Try OAuth2 password flow (POST /auth/token)
    try {
      const formData = new URLSearchParams();
      formData.append("username", FASTAPI_USER);
      formData.append("password", FASTAPI_PASSWORD);

      const tokenRes = await fetch(`${FASTAPI_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          _cachedToken = {
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || "bearer",
            expires_in: tokenData.expires_in || 3600,
            sub: tokenData.sub,
            role: tokenData.role,
            method: "oauth2",
          };
          _tokenExpiry =
            _cachedToken.expires_in > 0
              ? Date.now() + (_cachedToken.expires_in - 300) * 1000
              : Date.now() + 3600000;
          return _cachedToken;
        }
      }
    } catch {
      // /auth/token not available — fall through
    }

    // Strategy 2: Test credentials as X-API-Key
    try {
      const testRes = await fetch(`${FASTAPI_BASE}/portfolio/symbols`, {
        headers: { "X-API-Key": FASTAPI_PASSWORD },
        signal: AbortSignal.timeout(10000),
      });

      if (testRes.ok) {
        _cachedToken = {
          access_token: FASTAPI_PASSWORD,
          token_type: "api_key",
          expires_in: 0,
          sub: FASTAPI_USER,
          role: "trader",
          method: "api_key",
        };
        _tokenExpiry = Date.now() + 3600000; // 1 hour cache
        return _cachedToken;
      }
    } catch {
      // API key test failed — fall through
    }
  } catch {
    // Auth not available — return null
  }

  return null;
}

// ── v2.1 Simulation + Portfolio API ──────────────────────────────────────────

/**
 * Run Monte Carlo regime transition simulation.
 * POST /simulate/{symbol}
 * Uses 60s timeout for heavy computation.
 */
export async function simulateRegime(symbol, prices, options = {}) {
  const body = {
    prices,
    horizon: options.horizon ?? 20,
    n_paths: options.n_paths ?? 500,
    seed: options.seed ?? 42,
  };
  if (options.current_price != null) body.current_price = options.current_price;

  const auth = await getFastApiToken();
  const res = await fetchWithRetry(
    `${FASTAPI_BASE}/simulate/${encodeURIComponent(symbol)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      auth: auth || undefined,
      timeout: SIMULATE_TIMEOUT,
    },
  );
  return res.json();
}

/**
 * Get aggregated portfolio regime + risk summary.
 * GET /portfolio
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

  const auth = await getFastApiToken();
  const res = await fetchWithRetry(url, {
    method: "GET",
    auth: auth || undefined,
  });
  return res.json();
}

/**
 * Get list of symbols with active portfolio sessions.
 * GET /portfolio/symbols
 */
export async function getPortfolioSymbols() {
  const auth = await getFastApiToken();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/portfolio/symbols`, {
    method: "GET",
    auth: auth || undefined,
  });
  return res.json();
}

// --- Streaming (v2.0) ---
export async function seedSession(symbol, prices) {
  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, prices }),
  });
  return res.json();
}

export async function pushTick(symbol, price) {
  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, price }),
  });
  return res.json();
}

export async function getSessions() {
  const res = await fetchWithRetry(`${FASTAPI_BASE}/stream/sessions`);
  return res.json();
}

export function getSSEUrl(symbol) {
  return `${FASTAPI_BASE}/sse/${symbol}`;
}

export function getAlertsSSEUrl() {
  return `${FASTAPI_BASE}/sse/alerts`;
}

export async function detectCorrelation(symbols, returns_data = {}) {
  const body = {
    symbols,
    returns_data,
  };

  const res = await fetchWithRetry(`${FASTAPI_BASE}/correlation/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function optimisePortfolio(
  positions,
  prices_data = {},
  options = {},
) {
  const body = {
    positions,
    prices_data,
    target_return: options.target_return ?? 0.1,
    risk_free_rate: options.risk_free_rate ?? 0.04,
  };

  const res = await fetchWithRetry(`${FASTAPI_BASE}/optimise/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
