import { FASTAPI_BASE } from "@/lib/config";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

// ── Auth token cache (legacy, used by getFastApiToken) ──────────────────────
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
  // Use more retries for Render spin-up scenarios (the caller can override)
  const maxRetries = options.retries || retries;

  for (let i = 0; i < maxRetries; i++) {
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

      if (res.ok) {
        // Guard against Render free-tier spin-up: the service may return
        // a 200 OK HTML page while it is still starting up.
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          // Treat as transient – retry with backoff
          if (i === retries - 1) {
            throw new Error(
              "Backend service is starting up. Please try again in a moment.",
            );
          }
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
        return res;
      }

      if (res.status >= 400 && res.status < 500) {
        // Try to parse JSON error; if the body is HTML (Render 404 page etc.)
        // fall back to a safe error message.
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          throw new Error(
            `Backend returned HTML instead of JSON (HTTP ${res.status}). The service may be starting up.`,
          );
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      // 5xx — retry
    } catch (e) {
      if (i === maxRetries - 1) throw e;
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

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(
    `${FASTAPI_BASE}/simulate/${encodeURIComponent(symbol)}`,
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: { ...authHeaders },
  });
  return res.json();
}

/**
 * Get list of symbols with active portfolio sessions.
 * GET /portfolio/symbols
 */
export async function getPortfolioSymbols() {
  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/portfolio/symbols`, {
    method: "GET",
    headers: { ...authHeaders },
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

/**
 * Detect correlation regime across multiple assets.
 * POST /correlation/detect
 *
 * Backend requires: symbols + returns_matrix (n_bars × n_assets 2D array of log-returns)
 * Uses Clerk JWT auth via getFastAPIAuthHeaders().
 *
 * @param {string[]} symbols - List of ticker symbols
 * @param {number[][]} returnsMatrix - (n_bars × n_assets) matrix of log-returns
 * @param {object} options - Optional params (window, ewma_span, n_hmm_states)
 * @returns {Promise<object>} Correlation regime response
 */
export async function detectCorrelation(symbols, returnsMatrix, options = {}) {
  const body = {
    symbols,
    returns_matrix: returnsMatrix,
    window: options.window ?? 60,
    ewma_span: options.ewma_span ?? 20,
    n_hmm_states: options.n_hmm_states ?? 4,
  };

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/correlation/detect`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    retries: 5, // Extra retries for Render spin-up
  });

  // Guard against HTML responses (e.g. Render spin-up page)
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    throw new Error("Backend returned HTML instead of JSON. The service may be starting up.");
  }
  return res.json();
}

/**
 * Run full portfolio optimization (correlation detect + optimise in one call).
 * POST /optimise/full
 *
 * Backend requires: symbols + returns_matrix (n_bars × n_assets 2D array of log-returns)
 * Uses Clerk JWT auth via getFastAPIAuthHeaders().
 *
 * @param {string[]} symbols - List of ticker symbols
 * @param {number[][]} returnsMatrix - (n_bars × n_assets) matrix of log-returns
 * @param {object} options - Optional params (max_dd_limit, max_weight, risk_free_rate, etc.)
 * @returns {Promise<object>} Full optimization response (correlation + optimisation)
 */
export async function optimisePortfolio(symbols, returnsMatrix, options = {}) {
  const body = {
    symbols,
    returns_matrix: returnsMatrix,
    max_dd_limit: options.max_dd_limit ?? 0.20,
    max_weight: options.max_weight ?? 0.40,
    risk_free_rate: options.risk_free_rate ?? 0.04,
    use_asset_regimes: options.use_asset_regimes ?? true,
    corr_window: options.corr_window ?? 60,
    corr_ewma: options.corr_ewma ?? 20,
  };

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/optimise/full`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: SIMULATE_TIMEOUT,
    retries: 5, // Extra retries for Render spin-up
  });

  // Guard against HTML responses (e.g. Render spin-up page)
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    throw new Error("Backend returned HTML instead of JSON. The service may be starting up.");
  }
  return res.json();
}

/**
 * Build a 24-feature observation vector from price series.
 * POST /observation/build
 *
 * Uses InferenceObservationBuilder under the hood — features 14–19
 * are live Markov regime features from a fitted HMM (never uniform priors).
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {number[]} high - High price series (same length as prices)
 * @param {number[]} low - Low price series (same length as prices)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (window, refit_every, n_hmm_states, recommended_f)
 * @returns {Promise<object>} ObservationResponse with 24-dim vector
 */
export async function buildObservation(prices, high, low, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    high,
    low,
    symbol,
    window: options.window ?? 200,
    refit_every: options.refit_every ?? 50,
    n_hmm_states: options.n_hmm_states ?? 4,
    recommended_f: options.recommended_f ?? 0.0,
  };

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/observation/build`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: SIMULATE_TIMEOUT,
    retries: 5, // Extra retries for Render spin-up
  });

  // Guard against HTML responses
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    throw new Error("Backend returned HTML instead of JSON. The service may be starting up.");
  }
  return res.json();
}

// ── Phase 1: New v4 endpoints ──────────────────────────────────────────────────

/**
 * Enhanced regime detection with configurable 2-4 states.
 * POST /regime/detect-v2
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (n_states, n_iter)
 * @returns {Promise<object>} RegimeV2Response
 */
export async function detectRegimeV2(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    n_states: options.n_states ?? 4,
    n_iter: options.n_iter ?? 100,
  };

  const res = await fetchWithDedup(`${FASTAPI_BASE}/regime/detect-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Strategy signal with regime context and position sizing.
 * POST /strategy/signal
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (kelly_fraction, target_vol, use_regime, base_risk_limit, n_hmm_states)
 * @returns {Promise<object>} StrategySignalResponse
 */
export async function strategySignal(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    use_regime: options.use_regime ?? true,
    base_risk_limit: options.base_risk_limit ?? 0.02,
    n_hmm_states: options.n_hmm_states ?? 4,
  };

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/strategy/signal`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: SIMULATE_TIMEOUT,
    retries: 5,
  });
  return res.json();
}

/**
 * Enhanced risk analysis with stress tests.
 * POST /risk/analyze
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params
 * @returns {Promise<object>} RiskAnalyzeResponse
 */
export async function analyzeRisk(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    use_regime: options.use_regime ?? true,
    base_risk_limit: options.base_risk_limit ?? 0.02,
    n_hmm_states: options.n_hmm_states ?? 4,
    stress_scenarios: options.stress_scenarios ?? true,
  };
  if (options.returns) body.returns = options.returns;

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/risk/analyze`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: SIMULATE_TIMEOUT,
    retries: 5,
  });
  return res.json();
}

/**
 * Run walk-forward backtest with regime-aware strategy (30+ metrics).
 * POST /backtest/run
 *
 * @param {number[]} prices - Close price series (min 250+ bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (window, refit_every, kelly_fraction, etc.)
 * @returns {Promise<object>} BacktestResponse
 */
export async function runBacktest(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    window: options.window ?? 200,
    refit_every: options.refit_every ?? 50,
    n_hmm_states: options.n_hmm_states ?? 4,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    base_risk_limit: options.base_risk_limit ?? 0.02,
    initial_equity: options.initial_equity ?? 100000,
    commission_bps: options.commission_bps ?? 5.0,
    slippage_bps: options.slippage_bps ?? 2.0,
    max_position_pct: options.max_position_pct ?? 0.25,
    risk_check: options.risk_check ?? true,
    regime_gate: options.regime_gate ?? true,
  };
  // Optional: dates array for trade log date labels
  if (options.dates) {
    body.dates = options.dates;
  }
  // Optional: save to database (default true)
  if (options.save !== undefined) {
    body.save = options.save;
  }

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/backtest/run`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 120000, // 2 min for heavy computation
    retries: 3,
  });
  return res.json();
}

// ── Backtest History / Detail / Compare / Delete (via BFF) ────────────────────

/**
 * Fetch paginated backtest history for the authenticated user.
 * GET /api/backtest/history
 *
 * @param {object} options - Optional params (offset, limit)
 * @returns {Promise<object>} BacktestHistoryResponse
 */
export async function getBacktestHistory(options = {}) {
  const params = new URLSearchParams();
  params.set("offset", String(options.offset ?? 0));
  params.set("limit", String(options.limit ?? 20));

  const res = await fetchWithRetry(`/api/backtest/history?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

/**
 * Fetch a single saved backtest result by ID.
 * GET /api/backtest/detail/{id}
 *
 * @param {string} id - Backtest result UUID
 * @returns {Promise<object>} BacktestResponse
 */
export async function getBacktestDetail(id) {
  const res = await fetchWithRetry(`/api/backtest/detail/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

/**
 * Compare two or more saved backtest results side-by-side.
 * POST /api/backtest/compare
 *
 * @param {string[]} ids - Array of backtest result UUIDs (min 2)
 * @returns {Promise<object>} BacktestCompareResponse
 */
export async function compareBacktests(ids) {
  const res = await fetchWithRetry(`/api/backtest/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return res.json();
}

/**
 * Delete a saved backtest result by ID.
 * DELETE /api/backtest/detail/{id}
 *
 * @param {string} id - Backtest result UUID
 * @returns {Promise<boolean>} True if deleted (204), false otherwise
 */
export async function deleteBacktest(id) {
  const res = await fetchWithRetry(`/api/backtest/detail/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  return res.status === 204;
}

/**
 * Run a parameter sweep (grid search) across backtest configurations.
 * POST /api/backtest/optimize
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} paramGrid - Map of param name to array of values to sweep
 * @param {object} options - Optional fixed params (window, kelly_fraction, etc.)
 * @returns {Promise<object>} BacktestOptimizeResponse
 */
export async function optimizeBacktest(prices, symbol = "UNKNOWN", paramGrid = {}, options = {}) {
  const body = {
    prices,
    symbol,
    param_grid: paramGrid,
    window: options.window ?? 200,
    refit_every: options.refit_every ?? 50,
    n_hmm_states: options.n_hmm_states ?? 4,
    kelly_fraction: options.kelly_fraction ?? 0.5,
    target_vol: options.target_vol ?? 0.15,
    base_risk_limit: options.base_risk_limit ?? 0.02,
    initial_equity: options.initial_equity ?? 100000,
    commission_bps: options.commission_bps ?? 5.0,
    slippage_bps: options.slippage_bps ?? 2.0,
    max_position_pct: options.max_position_pct ?? 0.25,
    risk_check: options.risk_check ?? true,
    regime_gate: options.regime_gate ?? true,
    save: options.save ?? false,
  };

  const res = await fetchWithRetry(`/api/backtest/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 300000, // 5 min for parameter sweeps
    retries: 1,
  });
  return res.json();
}

/**
 * Export a saved backtest result as CSV or JSON.
 * POST /api/backtest/export
 *
 * @param {string} id - Backtest result UUID
 * @param {"csv"|"json"} format - Export format
 * @param {string[]} sections - Which sections to include (default: ["all"])
 * @returns {Promise<Response>} Raw response for streaming download
 */
export async function exportBacktest(id, format = "json", sections = ["all"]) {
  const res = await fetchWithRetry(`/api/backtest/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, format, sections }),
  });
  return res;
}

/**
 * Extract TDA features from price series (persistent homology).
 * POST /tda/features
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (embedding_dim, embedding_delay, etc.)
 * @returns {Promise<object>} TDAResponse
 */
export async function extractTDAFeatures(prices, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    symbol,
    embedding_dim: options.embedding_dim ?? 3,
    embedding_delay: options.embedding_delay ?? 1,
    max_filtration: options.max_filtration ?? 2.0,
    n_filtration_steps: options.n_filtration_steps ?? 20,
    anomaly_threshold: options.anomaly_threshold ?? 1.5,
  };
  if (options.baseline_prices) body.baseline_prices = options.baseline_prices;

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/tda/features`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: SIMULATE_TIMEOUT,
    retries: 5,
  });
  return res.json();
}

/**
 * Build enhanced 24+ feature observation vector with optional TDA features.
 * POST /observation/build-v2
 *
 * @param {number[]} prices - Close price series (min 81 bars)
 * @param {number[]} high - High price series
 * @param {number[]} low - Low price series
 * @param {string} symbol - Ticker symbol
 * @param {object} options - Optional params (include_tda, window, etc.)
 * @returns {Promise<object>} ObservationV2Response
 */
export async function buildObservationV2(prices, high, low, symbol = "UNKNOWN", options = {}) {
  const body = {
    prices,
    high,
    low,
    symbol,
    window: options.window ?? 200,
    refit_every: options.refit_every ?? 50,
    n_hmm_states: options.n_hmm_states ?? 4,
    recommended_f: options.recommended_f ?? 0.0,
    include_tda: options.include_tda ?? false,
    embedding_dim: options.embedding_dim ?? 3,
    embedding_delay: options.embedding_delay ?? 1,
  };

  const authHeaders = await getFastAPIAuthHeaders();
  const res = await fetchWithRetry(`${FASTAPI_BASE}/observation/build-v2`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 120000, // 2 min for TDA computation
    retries: 5,
  });
  return res.json();
}
