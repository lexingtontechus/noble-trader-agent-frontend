import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Get Alpaca API keys from the authenticated user's Clerk private metadata.
 *
 * Private metadata is server-side only — it never reaches the browser.
 * Keys are stored under: user.privateMetadata.alpaca_api_key / alpaca_secret_key
 *
 * @returns {Promise<{apiKey: string|null, secretKey: string|null}>}
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
