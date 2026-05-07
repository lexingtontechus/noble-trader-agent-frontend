import { auth } from "@clerk/nextjs/server";

/**
 * Gets the Authorization header for FastAPI backend calls.
 * Tries Clerk JWT token first, falls back to X-API-Key env var.
 * Returns a headers object ready to spread into fetch options.
 */
export async function getFastAPIAuthHeaders() {
  const headers = {};

  try {
    // Get Clerk JWT token from the current session
    const authResult = await auth();

    if (authResult?.getToken) {
      // Try default token first
      let token = await authResult.getToken();

      // If default token fails, try with 'server' template (common Clerk JWT template for backend)
      if (!token) {
        try {
          token = await authResult.getToken({ template: "server" });
        } catch {
          // Template may not exist, that's OK
        }
      }

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        return headers;
      }
    }

    // Log auth state for debugging
    if (!authResult?.userId) {
      console.warn("[fastapi-auth] No authenticated user found in session");
    } else {
      console.warn(
        "[fastapi-auth] User found but no JWT token available:",
        authResult.userId,
      );
    }
  } catch (e) {
    // Clerk auth may not be available in all contexts
    console.warn(
      "[fastapi-auth] Clerk token fetch failed, falling back to API key:",
      e.message,
    );
  }

  // Fallback: use X-API-Key from env if Clerk token is unavailable
  const apiKey = process.env.FASTAPI_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  return headers;
}

/**
 * Debug helper: returns detailed auth info for the ClerkAuthPanel.
 * Only use in diagnostics — not for production API calls.
 */
export async function getAuthDebugInfo() {
  try {
    const authResult = await auth();
    const info = {
      hasAuth: !!authResult,
      userId: authResult?.userId || null,
      sessionId: authResult?.sessionId || null,
      hasGetToken: !!authResult?.getToken,
    };

    if (authResult?.getToken) {
      try {
        const token = await authResult.getToken();
        info.tokenAvailable = !!token;
        info.tokenPreview = token ? token.substring(0, 40) + "..." : null;

        if (token) {
          // Parse JWT payload (without verification) for display
          const parts = token.split(".");
          if (parts.length === 3) {
            try {
              const payload = JSON.parse(
                Buffer.from(parts[1], "base64url").toString(),
              );
              info.issuer = payload.iss || null;
              info.subject = payload.sub || null;
              info.audience = payload.aud || null;
              info.azp = payload.azp || null;
              info.issuedAt = payload.iat
                ? new Date(payload.iat * 1000).toISOString()
                : null;
              info.expiresAt = payload.exp
                ? new Date(payload.exp * 1000).toISOString()
                : null;
            } catch {
              info.payloadParseError = true;
            }
          }
        }
      } catch (e) {
        info.tokenError = e.message;
      }
    }

    return info;
  } catch (e) {
    return { error: e.message };
  }
}
