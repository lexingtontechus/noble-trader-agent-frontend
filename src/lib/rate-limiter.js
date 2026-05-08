/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window counter per IP.
 */

const windows = new Map(); // key -> { count, resetAt }

/**
 * Check if a request is rate-limited.
 * @param {string} key - Usually IP or identifier
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in ms
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  let entry = windows.get(key);

  // Clean expired entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [k, v] of windows) {
      if (now > v.resetAt) windows.delete(k);
    }
  }

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client IP from request headers.
 * Works behind proxies (Vercel, Cloudflare, etc.)
 */
export function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
