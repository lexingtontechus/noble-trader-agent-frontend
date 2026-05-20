/**
 * Error sanitization layer — prevents internal details from leaking to clients.
 *
 * All API routes should use createApiError() or sanitizeError() instead of
 * returning raw error messages. Internal details are logged server-side only.
 */

// Patterns that should never reach the client
const SENSITIVE_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ENCRYPTION_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL/i,
  /CLERK_SECRET_KEY|CLERK_API_KEY/i,
  /ALPACA_API_KEY|ALPACA_SECRET_KEY|APCA-API-KEY-ID/i,
  /password|secret|token|credential/i,
  /postgresql:\/\//i,
  /redis:\/\//i,
  /mongodb:\/\//i,
];

// Context-specific error messages
const CONTEXT_MESSAGES = {
  credentials: {
    default: "Unable to manage credentials right now. Please try again later.",
    auth: "Please sign in to manage your API keys.",
  },
  campaign: {
    default: "Unable to process campaign request. Please try again later.",
    auth: "Please sign in to manage campaigns.",
    no_keys: "Alpaca API keys not configured. Set up your paper trading keys first.",
  },
  trading: {
    default: "Unable to process trade request. Please try again later.",
    auth: "Please sign in to execute trades.",
    no_keys: "Alpaca API keys not configured.",
  },
  alpaca: {
    default: "Unable to connect to the trading service. Please try again later.",
    rate_limit: "Trading service is busy. Please wait a moment and try again.",
  },
};

/**
 * Check if an error message contains sensitive information.
 */
function isSensitive(message) {
  if (!message) return false;
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Sanitize an error for client consumption.
 * Returns { message, code, status } with safe user-facing messages.
 */
export function sanitizeError(error, { context = "default" } = {}) {
  const message = error?.message || String(error);
  const status = error?.status || 500;

  // Auth errors
  if (message.includes("Not authenticated") || message.includes("Unauthorized")) {
    const authMsg = CONTEXT_MESSAGES[context]?.auth || "Please sign in.";
    return { message: authMsg, code: "UNAUTHORIZED", status: 401 };
  }

  // If the message is clean (not sensitive), pass it through
  if (!isSensitive(message)) {
    return {
      message: message.length > 200 ? message.slice(0, 200) + "..." : message,
      code: "INTERNAL_ERROR",
      status,
    };
  }

  // Sanitize: log internally, return safe message
  console.error(`[sanitizeError] Sensitive error (context: ${context}):`, message);
  const safeMsg = CONTEXT_MESSAGES[context]?.default || "Something went wrong. Please try again later.";
  return { message: safeMsg, code: "INTERNAL_ERROR", status: 500 };
}

/**
 * Create a sanitized API error response.
 * Usage: return createApiError(error, { context: "credentials" });
 */
export function createApiError(error, { context = "default" } = {}) {
  const { message, code, status } = sanitizeError(error, { context });
  return Response.json({ error: message, code }, { status });
}

/**
 * Error codes for structured client-side handling.
 */
export const ErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  NO_KEYS: "NO_KEYS",
  PLAN_REQUIRED: "PLAN_REQUIRED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
};
