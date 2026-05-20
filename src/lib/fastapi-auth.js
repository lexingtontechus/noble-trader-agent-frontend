import { auth } from "@clerk/nextjs/server";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";

/**
 * Gets the Authorization header for FastAPI backend calls.
 *
 * Tries multiple methods in order:
 * 1. Clerk auth().getToken() — standard method, works when Clerk is properly configured
 * 2. Read __session cookie directly — works in keyless/development mode
 * 3. X-API-Key env var — fallback for service-to-service auth
 *
 * Returns a headers object ready to spread into fetch options.
 */
export async function getFastAPIAuthHeaders() {
  const authHeaders = {};

  // ── Method 1: Clerk auth().getToken() ──────────────────────────────────────
  try {
    const authResult = await auth();

    if (authResult?.getToken) {
      // Try default token first
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

    // If we have a userId but no token, log for debugging
    if (authResult?.userId) {
      console.debug(
        "[fastapi-auth] User authenticated but no JWT token available:",
        authResult.userId,
      );
    }
  } catch (e) {
    console.debug(
      "[fastapi-auth] Clerk auth().getToken() failed:",
      e.message,
    );
  }

  // ── Method 2: Read __session cookie directly ──────────────────────────────
  // In keyless/development mode, Clerk stores the session token in a cookie.
  // The auth() → getToken() path may not work without CLERK_SECRET_KEY,
  // but the browser DOES send a valid JWT in the __session cookie.
  try {
    const cookieStore = await nextCookies();
    const sessionCookie = cookieStore.get("__session");

    if (sessionCookie?.value) {
      // The __session cookie contains the Clerk session JWT
      authHeaders["Authorization"] = `Bearer ${sessionCookie.value}`;
      return authHeaders;
    }
  } catch (e) {
    // cookies() may not be available in all contexts
    console.debug("[fastapi-auth] Cookie extraction failed:", e.message);
  }

  // ── Method 3: Read Authorization header from incoming request ─────────────
  // If the client already sends a Bearer token, forward it
  try {
    const headersList = await nextHeaders();
    const authHeader = headersList.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      authHeaders["Authorization"] = authHeader;
      return authHeaders;
    }
  } catch (e) {
    // headers() may not be available in all contexts
    console.debug("[fastapi-auth] Header extraction failed:", e.message);
  }

  // ── Method 4: X-API-Key fallback ──────────────────────────────────────────
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

    if (authResult?.getToken) {
      try {
        const token = await authResult.getToken();
        info.methods.clerkAuth.tokenAvailable = !!token;
        info.methods.clerkAuth.tokenPreview = token
          ? token.substring(0, 40) + "..."
          : null;

        if (token) {
          const parts = token.split(".");
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

  return info;
}
