/**
 * Error message sanitization and user-friendly error mapping.
 *
 * PROBLEM: Internal errors (missing env vars, DB connection failures, etc.)
 * expose implementation details like "Missing SUPABASE_SERVICE_ROLE_KEY" to
 * end users — a security and UX problem.
 *
 * SOLUTION:
 *  1. `sanitizeError()` — Strips internal details from any error before
 *     sending it to the client. Never leaks env var names, DB details, or
 *     stack traces.
 *  2. `userFriendlyError()` — Maps known error patterns to polished,
 *     actionable messages the user can understand and act on.
 *  3. `createApiError()` — Convenience wrapper for API routes that returns
 *     a sanitized { error, code, status } response.
 */

// ── Error code constants ─────────────────────────────────────────────────────
export const ErrorCodes = {
  CONFIG_MISSING: "CONFIG_MISSING",
  NO_KEYS: "NO_KEYS",
  INVALID_KEYS: "INVALID_KEYS",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  PLAN_REQUIRED: "PLAN_REQUIRED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  UNKNOWN: "UNKNOWN",
};

// ── Internal patterns → user-friendly messages ───────────────────────────────
const ERROR_MAP = [
  // Config / env var leaks (most critical to sanitize)
  {
    pattern: /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL/i,
    code: ErrorCodes.CONFIG_MISSING,
    message: "Service configuration is incomplete. Please try again later or contact support.",
    status: 503,
  },
  {
    pattern: /Missing.*(?:KEY|URL|SECRET|ENV)/i,
    code: ErrorCodes.CONFIG_MISSING,
    message: "Service configuration is incomplete. Please try again later or contact support.",
    status: 503,
  },

  // Alpaca credential errors
  {
    pattern: /Alpaca API keys not configured|NO_KEYS/i,
    code: ErrorCodes.NO_KEYS,
    message: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
    status: 403,
  },
  {
    pattern: /invalid.*api.*key|authentication.*failed|40140|40110|APCA-API-KEY-ID/i,
    code: ErrorCodes.INVALID_KEYS,
    message: "Your API keys appear to be invalid. Please verify and re-enter them in Settings.",
    status: 401,
  },

  // Auth
  {
    pattern: /not authenticated|unauthorized|clerk.*session/i,
    code: ErrorCodes.AUTH_REQUIRED,
    message: "Please sign in to access this feature.",
    status: 401,
  },

  // Plan gating
  {
    pattern: /requires a (Premium|Institutional) plan|Live trading requires/i,
    code: ErrorCodes.PLAN_REQUIRED,
    message: "This feature requires a Premium or Institutional plan. Upgrade to unlock it.",
    status: 403,
  },

  // Connection / network
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network error/i,
    code: ErrorCodes.CONNECTION_FAILED,
    message: "Unable to reach the trading service. Please check your internet connection and try again.",
    status: 502,
  },
  {
    pattern: /Failed to fetch|NetworkError/i,
    code: ErrorCodes.CONNECTION_FAILED,
    message: "Unable to reach the trading service. Please check your internet connection and try again.",
    status: 502,
  },

  // Rate limiting
  {
    pattern: /rate limit|too many requests|429/i,
    code: ErrorCodes.RATE_LIMITED,
    message: "Too many requests. Please wait a moment and try again.",
    status: 429,
  },

  // Supabase / DB errors
  {
    pattern: /supabase|pgcrypto|decrypt_credential|encrypt_credential|PGRST/i,
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    message: "The credential service is temporarily unavailable. Please try again in a moment.",
    status: 503,
  },
];

// ── Generic sanitized fallbacks for API route errors ─────────────────────────
const GENERIC_MESSAGES = {
  account: "Unable to load your account information. Please try again.",
  orders: "Unable to load order history. Please try again.",
  positions: "Unable to load positions. Please try again.",
  portfolio: "Unable to load portfolio data. Please try again.",
  credentials: "Unable to manage credentials right now. Please try again.",
  default: "Something went wrong. Please try again later.",
};

/**
 * Sanitize an error message for client display.
 * Strips any internal implementation details and returns a safe, user-friendly message.
 *
 * @param {Error|string} error — The raw error
 * @param {object} [options]
 * @param {string} [options.context] — e.g. "account", "orders" for context-specific fallback
 * @param {boolean} [options.logOriginal] — Whether to console.error the original (default: true)
 * @returns {{ message: string, code: string, status: number }}
 */
export function sanitizeError(error, options = {}) {
  const { context = "default", logOriginal = true } = options;
  const rawMessage = typeof error === "string" ? error : error?.message || String(error);

  // Always log the full error server-side for debugging
  if (logOriginal && typeof console !== "undefined") {
    console.error(`[sanitizeError] Original error (${context}):`, rawMessage);
  }

  // Check against known patterns
  for (const rule of ERROR_MAP) {
    if (rule.pattern.test(rawMessage)) {
      return { message: rule.message, code: rule.code, status: rule.status };
    }
  }

  // Fallback: generic context-specific message (never leak rawMessage)
  return {
    message: GENERIC_MESSAGES[context] || GENERIC_MESSAGES.default,
    code: ErrorCodes.UNKNOWN,
    status: 500,
  };
}

/**
 * Create a sanitized API error response (for use in Route Handlers).
 *
 * @param {Error|string} error — The raw error
 * @param {object} [options] — Same as sanitizeError options
 * @returns {Response} — JSON Response with sanitized error
 */
export function createApiError(error, options = {}) {
  const { message, code, status } = sanitizeError(error, options);
  return Response.json({ error: message, code }, { status });
}

/**
 * Get a user-friendly display for an error code.
 * Used by frontend components to show contextual UI (not just text).
 *
 * @param {string} code — Error code from ErrorCodes
 * @returns {{ title: string, description: string, icon: string, action: string|null }}
 */
export function getErrorDisplay(code) {
  const displays = {
    [ErrorCodes.CONFIG_MISSING]: {
      title: "Service Unavailable",
      description: "We're experiencing a configuration issue on our end. Our team has been notified. Please try again later.",
      icon: "wrench",
      action: null,
    },
    [ErrorCodes.NO_KEYS]: {
      title: "Connect Your Account",
      description: "Your Alpaca trading account isn't connected yet. Add your API keys to start trading.",
      icon: "key",
      action: "setup_keys",
    },
    [ErrorCodes.INVALID_KEYS]: {
      title: "Invalid API Keys",
      description: "The API keys you've entered don't appear to be valid. Please double-check them and try again.",
      icon: "shield",
      action: "reenter_keys",
    },
    [ErrorCodes.AUTH_REQUIRED]: {
      title: "Sign In Required",
      description: "Please sign in to access your trading dashboard.",
      icon: "lock",
      action: "sign_in",
    },
    [ErrorCodes.PLAN_REQUIRED]: {
      title: "Upgrade Required",
      description: "This feature is available on Premium and Institutional plans. Upgrade to unlock it.",
      icon: "crown",
      action: "upgrade",
    },
    [ErrorCodes.CONNECTION_FAILED]: {
      title: "Connection Issue",
      description: "Unable to reach the trading service. This may be a temporary network issue — please try again.",
      icon: "wifi",
      action: "retry",
    },
    [ErrorCodes.SERVICE_UNAVAILABLE]: {
      title: "Temporary Outage",
      description: "The service is temporarily unavailable. This usually resolves within a few minutes.",
      icon: "clock",
      action: "retry",
    },
    [ErrorCodes.RATE_LIMITED]: {
      title: "Slow Down",
      description: "You've made too many requests. Please wait a moment before trying again.",
      icon: "hourglass",
      action: "retry",
    },
    [ErrorCodes.UNKNOWN]: {
      title: "Something Went Wrong",
      description: "An unexpected error occurred. Please try again, and contact support if the problem persists.",
      icon: "alert",
      action: "retry",
    },
  };

  return displays[code] || displays[ErrorCodes.UNKNOWN];
}
