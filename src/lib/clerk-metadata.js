import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";

export async function getAlpacaKeys() {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = user.privateMetadata || {};

  return {
    apiKey: meta.alpaca_api_key || null,
    secretKey: meta.alpaca_secret_key || null,
  };
}

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

export async function deleteAlpacaKeys() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = await clerkClient();
  // Set keys to empty string to remove them from privateMetadata
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      alpaca_api_key: null,
      alpaca_secret_key: null,
    },
  });

  return { success: true };
}

export async function hasAlpacaKeys() {
  const keys = await getAlpacaKeys();
  return !!(keys?.apiKey && keys?.secretKey);
}
