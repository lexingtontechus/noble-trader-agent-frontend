const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL || "https://noble-trader-fastapi-backend.onrender.com";

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
