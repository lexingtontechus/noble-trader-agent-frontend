#!/usr/bin/env node
/**
 * Save Alpaca API keys to a Clerk user's private metadata.
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_test_... node scripts/save-alpaca-keys.mjs
 *
 * Or set CLERK_SECRET_KEY in your .env.local and run:
 *   node scripts/save-alpaca-keys.mjs
 *
 * The script will:
 *   1. List all Clerk users to find the target user
 *   2. Save the Alpaca API keys to the user's private metadata
 */

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || "PKGWIARSN3LWH4JUWYHT2RFECW";
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || "6QnZD1kog7PaEBfZg4Vebfr9FJLC5LrYDsPUsu1Qmg68";
const CLERK_API_BASE = "https://api.clerk.com/v1";

if (!CLERK_SECRET_KEY) {
  console.error("ERROR: CLERK_SECRET_KEY is required.");
  console.error("Set it as an environment variable:");
  console.error("  CLERK_SECRET_KEY=sk_test_... node scripts/save-alpaca-keys.mjs");
  process.exit(1);
}

async function clerkApi(endpoint, options = {}) {
  const url = `${CLERK_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function listUsers() {
  const data = await clerkApi("/users?limit=10");
  return data;
}

async function updateUserMetadata(userId, privateMetadata) {
  const data = await clerkApi(`/users/${userId}/metadata`, {
    method: "PATCH",
    body: JSON.stringify({ private_metadata: privateMetadata }),
  });
  return data;
}

async function main() {
  console.log("=== Save Alpaca Keys to Clerk Private Metadata ===\n");

  // Step 1: List users
  console.log("Fetching Clerk users...");
  const users = await listUsers();

  if (!users || users.length === 0) {
    console.error("No Clerk users found.");
    process.exit(1);
  }

  console.log(`Found ${users.length} user(s):\n`);
  for (const user of users) {
    const email = user.email_addresses?.[0]?.email_address || "no email";
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "No name";
    const hasKeys = !!(user.private_metadata?.alpaca_api_key);
    console.log(`  [${user.id}] ${name} <${email}> ${hasKeys ? "(has Alpaca keys)" : "(no Alpaca keys)"}`);
  }

  // Step 2: Save keys to the first user (or all users if only one)
  const targetUser = users[0];
  console.log(`\nSaving Alpaca keys to user ${targetUser.id}...`);

  const metadata = {
    ...targetUser.private_metadata,
    alpaca_api_key: ALPACA_API_KEY,
    alpaca_secret_key: ALPACA_SECRET_KEY,
  };

  const updated = await updateUserMetadata(targetUser.id, metadata);
  console.log(`\nSuccess! Alpaca keys saved to private metadata for user ${targetUser.id}.`);
  console.log(`  API Key: ${ALPACA_API_KEY.slice(0, 8)}...`);
  console.log(`  Secret Key: ${ALPACA_SECRET_KEY.slice(0, 8)}...`);
  console.log(`\nVerification: alpaca_api_key = ${updated.private_metadata?.alpaca_api_key ? "SET" : "NOT SET"}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
