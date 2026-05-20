import { auth } from "@clerk/nextjs/server";

/**
 * Gets the Authorization header for FastAPI backend calls.
 *
 * Resolution order:
 *   1. Clerk REST API JWT (most reliable in serverless)
 *   2. auth().getToken() — standard Clerk SDK method
 *   3. __session cookie (keyless/dev mode)
 *   4. X-API-Key env var fallback (service-to-service)
 *
 * Returns a headers object ready to spread into fetch options.
 */
export async function getFastAPIAuthHeaders() {
  const authHeaders = {};

  // ── Method 1: Clerk REST API JWT ──────────────────────────────────────────
  // Most reliable method for serverless. Uses CLERK_SECRET_KEY to call the
  // Clerk Sessions API and get a JWT for the current session. This always
  // works as long as CLERK_SECRET_KEY is set and the user is authenticated.
  try {
    const authResult = await auth();
    const sessionId = authResult?.sessionId;

    if (sessionId) {
      const jwt = await getClerkJWT(sessionId);
      if (jwt) {
        authHeaders["Authorization"] = `Bearer ${jwt}`;
        return authHeaders;
      }
    }

    if (authResult?.userId && !sessionId) {
      console.debug(
        "[fastapi-auth] User authenticated but no sessionId — cannot get JWT via REST API:",
        authResult.userId,
      );
    }
  } catch (e) {
    console.debug("[fastapi-auth] Clerk REST API JWT failed:", e.message);
  }

  // ── Method 2: Clerk auth().getToken() ─────────────────────────────────────
  // Standard SDK method. Works when Clerk middleware has populated the auth
  // context and the signing key is available. May return null in edge cases.
  try {
    const authResult = await auth();

    if (authResult?.getToken) {
      let token = await authResult.getToken();

      // If default token fails, try with 'server' template
      if (!token) {
        try {
          token = await authResult.getToken({ template: "server" });
        } catch {
          // Template may not exist, that's OK
        }
      }

      if (token) {
        authHeaders["Authorization"] = `Bearer ${token}`;
        return authHeaders;
      }
    }
  } catch (e) {
    console.debug("[fastapi-auth] Clerk auth().getToken() failed:", e.message);
  }

  // ── Method 3: Read __session cookie directly ──────────────────────────────
  // In keyless/development mode, Clerk stores the session token in a cookie.
  try {
    const { cookies: nextCookies } = await import("next/headers");
    const cookieStore = await nextCookies();
    const sessionCookie = cookieStore.get("__session");

    if (sessionCookie?.value) {
      authHeaders["Authorization"] = `Bearer ${sessionCookie.value}`;
      return authHeaders;
    }
  } catch (e) {
    console.debug("[fastapi-auth] Cookie extraction failed:", e.message);
  }

  // ── Method 4: X-API-Key fallback ──────────────────────────────────────────
  // For service-to-service auth (cron jobs, background tasks)
  const apiKey = process.env.FASTAPI_API_KEY;
  if (apiKey) {
    authHeaders["X-API-Key"] = apiKey;
  }

  if (Object.keys(authHeaders).length === 0) {
    console.warn("[fastapi-auth] No auth method available — request will likely fail with 401");
  }

  return authHeaders;
}

/**
 * Get a Clerk JWT via the Clerk REST API.
 *
 * This is the most reliable way to get a JWT in serverless environments.
 * Uses CLERK_SECRET_KEY to call POST /v1/sessions/{sessionId}/tokens.
 *
 * @param {string} sessionId — The Clerk session ID from auth()
 * @returns {Promise<string|null>} — The JWT string, or null if unavailable
 */
export async function getClerkJWT(sessionId) {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey || !sessionId) return null;

  try {
    const tokenRes = await fetch(
      `https://api.clerk.com/v1/sessions/${sessionId}/tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      if (tokenData.jwt) return tokenData.jwt;
    }
  } catch {
    // Failed — network error, timeout, etc.
  }

  return null;
}

/**
 * Debug helper: returns detailed auth info for the ClerkAuthPanel.
 * Only use in diagnostics — not for production API calls.
 */
export async function getAuthDebugInfo() {
  const info = {
    methods: {},
  };

  // Method 1: Clerk auth()
  try {
    const authResult = await auth();
    info.methods.clerkAuth = {
      hasAuth: !!authResult,
      userId: authResult?.userId || null,
      sessionId: authResult?.sessionId || null,
      hasGetToken: !!authResult?.getToken,
    };

    if (authResult?.sessionId) {
      try {
        const jwt = await getClerkJWT(authResult.sessionId);
        info.methods.clerkAuth.restApiJwt = !!jwt;
        info.methods.clerkAuth.restApiJwtPreview = jwt
          ? jwt.substring(0, 40) + "..."
          : null;
      } catch (e) {
        info.methods.clerkAuth.restApiJwtError = e.message;
      }
    }

    if (authResult?.getToken) {
      try {
        const token = await authResult.getToken();
        info.methods.clerkAuth.sdkTokenAvailable = !!token;
        info.methods.clerkAuth.sdkTokenPreview = token
          ? token.substring(0, 40) + "..."
          : null;

        const jwtToDecode = token || info.methods.clerkAuth.restApiJwtPreview;
        if (jwtToDecode) {
          const parts = jwtToDecode.split(".");
          if (parts.length === 3) {
            try {
              const payload = JSON.parse(
                Buffer.from(parts[1], "base64url").toString(),
              );
              info.methods.clerkAuth.issuer = payload.iss || null;
              info.methods.clerkAuth.subject = payload.sub || null;
            } catch {
              info.methods.clerkAuth.payloadParseError = true;
            }
          }
        }
      } catch (e) {
        info.methods.clerkAuth.tokenError = e.message;
      }
    }
  } catch (e) {
    info.methods.clerkAuth = { error: e.message };
  }

  // Method 2: Cookie
  try {
    const { cookies: nextCookies } = await import("next/headers");
    const cookieStore = await nextCookies();
    const sessionCookie = cookieStore.get("__session");
    info.methods.cookie = {
      available: !!sessionCookie?.value,
      preview: sessionCookie?.value
        ? sessionCookie.value.substring(0, 40) + "..."
        : null,
    };
  } catch (e) {
    info.methods.cookie = { error: e.message };
  }

  // Method 3: X-API-Key
  info.methods.apiKey = {
    configured: !!process.env.FASTAPI_API_KEY,
  };

  // Method 4: Clerk Secret Key (for REST API JWT)
  info.methods.clerkSecretKey = {
    configured: !!process.env.CLERK_SECRET_KEY,
  };

  return info;
}
