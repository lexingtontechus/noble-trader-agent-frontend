import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Valid roles in the system. Role hierarchy: viewer (0) → trader (1) → admin (2)
 * Must match the ROLE_HIERARCHY in useRole.js and RoleGate.jsx.
 */
export const VALID_ROLES = ["viewer", "trader", "admin"];
export const DEFAULT_ROLE = "viewer";

/**
 * Get Alpaca API keys from the authenticated user's Clerk private metadata.
 *
 * Private metadata is server-side only — it never reaches the browser.
 * Keys are stored under: user.privateMetadata.alpaca_api_key / alpaca_secret_key
 *
 * @returns {Promise<{apiKey: string|null, secretKey: string|null}|null>}
 */
export async function getAlpacaKeys() {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.privateMetadata || {};

    return {
      apiKey: meta.alpaca_api_key || null,
      secretKey: meta.alpaca_secret_key || null,
    };
  } catch (err) {
    // Clerk auth() can throw when:
    //  - clerkMiddleware hasn't run on this route (missing from proxy.js)
    //  - Request comes from a cron job without a session cookie
    //  - Clerk service is temporarily unavailable
    console.error("[clerk-metadata] getAlpacaKeys failed:", err.message);
    return null;
  }
}

/**
 * Save Alpaca API keys to the authenticated user's Clerk private metadata.
 * Requires an authenticated session.
 */
export async function setAlpacaKeys(apiKey, secretKey) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      alpaca_api_key: apiKey,
      alpaca_secret_key: secretKey,
    },
  });

  return { success: true };
}

/**
 * Remove Alpaca API keys from the authenticated user's Clerk private metadata.
 * Requires an authenticated session.
 */
export async function deleteAlpacaKeys() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      alpaca_api_key: null,
      alpaca_secret_key: null,
    },
  });

  return { success: true };
}

/**
 * Check if the authenticated user has Alpaca keys configured.
 */
export async function hasAlpacaKeys() {
  const keys = await getAlpacaKeys();
  return !!(keys?.apiKey && keys?.secretKey);
}

/**
 * Get the role of the authenticated user from Clerk private metadata.
 *
 * Roles are stored in: user.privateMetadata.role
 * Valid roles: "viewer", "trader", "admin" (default: "viewer")
 *
 * IMPORTANT: The default role MUST match the default in useRole.js.
 * Both default to "viewer" to ensure client/server consistency.
 *
 * @returns {Promise<string>} — the user's role, or "viewer" if none set
 */
export async function getUserRole() {
  try {
    const { userId } = await auth();
    if (!userId) return "unauthenticated";

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.privateMetadata || {};
    const role = meta.role || DEFAULT_ROLE;

    // Normalize: ensure only valid roles are returned
    if (!VALID_ROLES.includes(role)) return DEFAULT_ROLE;
    return role;
  } catch (err) {
    console.error("[clerk-metadata] getUserRole failed:", err.message);
    return "unauthenticated";
  }
}

/**
 * Check if the authenticated user has admin role.
 *
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
  const role = await getUserRole();
  return role === "admin";
}

/**
 * Check if the authenticated user has trader-level access (trader or admin).
 *
 * @returns {Promise<boolean>}
 */
export async function isTrader() {
  const role = await getUserRole();
  return role === "admin" || role === "trader";
}

/**
 * Get full role info for the authenticated user.
 * Matches the shape returned by useRole() on the client side.
 *
 * @returns {Promise<{role: string, isAdmin: boolean, isTrader: boolean, isViewer: boolean, isLoaded: boolean}>}
 */
export async function getRoleInfo() {
  const { userId } = await auth();
  if (!userId) {
    return {
      role: "unauthenticated",
      isAdmin: false,
      isTrader: false,
      isViewer: false,
      isLoaded: true,
    };
  }

  const role = await getUserRole();
  return {
    role,
    isAdmin: role === "admin",
    isTrader: role === "admin" || role === "trader",
    isViewer: role === "viewer",
    isLoaded: true,
  };
}
