/**
 * Credential management — Supabase-backed with AES-256-GCM encryption.
 *
 * Keys are encrypted at rest using Node.js crypto (AES-256-GCM) before
 * being stored in Supabase. This is safer and faster than pgcrypto because:
 *  1. No dependency on DB-level settings (app.encryption_key)
 *  2. Encryption key is managed via environment variable
 *  3. Decryption can happen anywhere the key is available
 *
 * All functions are SERVER-SIDE ONLY (API routes, Server Actions).
 * They require Clerk auth() to identify the user.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ── Encryption config ──────────────────────────────────────────────────────
const ENCRYPTION_KEY = process.env.SUPABASE_ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing: iv + tag + ciphertext
 */
function encrypt(plainText) {
  if (!ENCRYPTION_KEY) {
    console.error("[credentials] Missing SUPABASE_ENCRYPTION_KEY env var");
    throw new Error("Service configuration is incomplete. Please try again later or contact support.");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32), "utf8");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  // Combine: iv (16 bytes) + tag (16 bytes) + ciphertext
  return Buffer.concat([iv, tag, Buffer.from(encrypted, "base64")]).toString("base64");
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 * Input format: base64(iv + tag + ciphertext)
 */
function decrypt(encoded) {
  if (!ENCRYPTION_KEY) {
    console.error("[credentials] Missing SUPABASE_ENCRYPTION_KEY env var");
    throw new Error("Service configuration is incomplete. Please try again later or contact support.");
  }
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32), "utf8");
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── Supabase admin client ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let _adminClient = null;

function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL) {
    console.error("[credentials] Missing NEXT_PUBLIC_SUPABASE_URL env var");
    throw new Error("Service configuration is incomplete. Please try again later or contact support.");
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.error("[credentials] Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env var");
    throw new Error("Service configuration is incomplete. Please try again later or contact support.");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

/**
 * Get the authenticated Clerk user ID, or throw if not authenticated.
 * @returns {Promise<string>}
 */
async function requireAuth() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

// ── Credential CRUD ──────────────────────────────────────────────────────────

/**
 * Save Alpaca API keys for the authenticated user.
 * Encrypts keys with AES-256-GCM before storing in Supabase.
 * If keys already exist for this type, they are replaced.
 *
 * @param {"paper"|"live"} credentialType
 * @param {string} apiKey — Alpaca API key (e.g., PK...)
 * @param {string} secretKey — Alpaca secret key
 * @returns {Promise<{success: boolean, credentialType: string}>}
 */
export async function saveCredentials(credentialType, apiKey, secretKey) {
  const userId = await requireAuth();
  const client = getServiceClient();

  if (!["paper", "live"].includes(credentialType)) {
    throw new Error("credentialType must be 'paper' or 'live'");
  }

  // Gate: live credentials require premium plan
  if (credentialType === "live") {
    const plan = await getUserPlan();
    if (plan !== "premium" && plan !== "institutional") {
      throw new Error("Live trading requires a Premium or Institutional plan");
    }
  }

  // Encrypt keys in application layer (AES-256-GCM)
  const encApiKey = encrypt(apiKey);
  const encSecretKey = encrypt(secretKey);

  // Upsert credentials
  const { error: upsertErr } = await client
    .from("user_credentials")
    .upsert(
      {
        clerk_user_id: userId,
        credential_type: credentialType,
        api_key_encrypted: encApiKey,
        secret_key_encrypted: encSecretKey,
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id,credential_type" }
    );

  if (upsertErr) throw new Error(`Failed to save credentials: ${upsertErr.message}`);

  return { success: true, credentialType };
}

/**
 * Get decrypted Alpaca API keys for the authenticated user.
 *
 * @param {"paper"|"live"} credentialType
 * @returns {Promise<{apiKey: string, secretKey: string}|null>}
 */
export async function getCredentials(credentialType) {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { data, error } = await client
    .from("user_credentials")
    .select("api_key_encrypted, secret_key_encrypted, is_valid")
    .eq("clerk_user_id", userId)
    .eq("credential_type", credentialType)
    .single();

  if (error || !data) return null;

  try {
    const apiKey = decrypt(data.api_key_encrypted);
    const secretKey = decrypt(data.secret_key_encrypted);
    return { apiKey, secretKey, isValid: data.is_valid };
  } catch (decErr) {
    console.error("[credentials] Failed to decrypt credentials:", decErr.message);
    return null;
  }
}

/**
 * Delete credentials for the authenticated user.
 *
 * @param {"paper"|"live"} credentialType
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteCredentials(credentialType) {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { error } = await client
    .from("user_credentials")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("credential_type", credentialType);

  if (error) throw new Error(`Failed to delete credentials: ${error.message}`);
  return { success: true };
}

/**
 * Check if the authenticated user has credentials configured for a given type.
 *
 * @param {"paper"|"live"} credentialType
 * @returns {Promise<{configured: boolean, isValid: boolean|null}>}
 */
export async function hasCredentials(credentialType) {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { data, error } = await client
    .from("user_credentials")
    .select("is_valid")
    .eq("clerk_user_id", userId)
    .eq("credential_type", credentialType)
    .single();

  if (error || !data) return { configured: false, isValid: null };
  return { configured: true, isValid: data.is_valid };
}

/**
 * Get the status of ALL credential types for the authenticated user.
 *
 * @returns {Promise<{paper: {configured: boolean, isValid: boolean|null}, live: {configured: boolean, isValid: boolean|null}}>}
 */
export async function getAllCredentialStatus() {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { data, error } = await client
    .from("user_credentials")
    .select("credential_type, is_valid")
    .eq("clerk_user_id", userId);

  if (error) {
    console.error("[credentials] Failed to fetch credential status:", error.message);
    return {
      paper: { configured: false, isValid: null },
      live: { configured: false, isValid: null },
    };
  }

  const paper = data?.find((r) => r.credential_type === "paper");
  const live = data?.find((r) => r.credential_type === "live");

  return {
    paper: { configured: !!paper, isValid: paper?.is_valid ?? null },
    live: { configured: !!live, isValid: live?.is_valid ?? null },
  };
}

/**
 * Validate credentials by testing them against the Alpaca API.
 * Updates the is_valid flag in the database.
 *
 * @param {"paper"|"live"} credentialType
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateCredentials(credentialType) {
  const creds = await getCredentials(credentialType);
  if (!creds) return { valid: false, error: "No credentials configured" };

  const baseUrl =
    credentialType === "paper"
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": creds.apiKey,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
    });

    const userId = await requireAuth();
    const client = getServiceClient();

    if (res.ok) {
      await client
        .from("user_credentials")
        .update({ is_valid: true, last_validated_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .eq("credential_type", credentialType);
      return { valid: true };
    } else {
      await client
        .from("user_credentials")
        .update({ is_valid: false, last_validated_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .eq("credential_type", credentialType);

      const body = await res.json().catch(() => ({}));
      return { valid: false, error: body.message || `Alpaca API returned ${res.status}` };
    }
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ── Subscription / Plan Management ───────────────────────────────────────────

/**
 * Get the user's current plan from Supabase.
 * Falls back to Clerk privateMetadata.plan if no Supabase record exists.
 *
 * @returns {Promise<string>} — "free" | "premium" | "institutional"
 */
export async function getUserPlan() {
  const userId = await requireAuth();

  const client = getServiceClient();
  const { data, error } = await client
    .from("user_subscriptions")
    .select("plan, plan_status")
    .eq("clerk_user_id", userId)
    .single();

  if (!error && data) {
    if (data.plan_status !== "active" && data.plan_status !== "trialing") {
      return "free";
    }
    return data.plan || "free";
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    return user?.privateMetadata?.plan || "free";
  } catch {
    return "free";
  }
}

/**
 * Set the user's plan in Supabase (called by webhook or admin).
 *
 * @param {string} clerkUserId
 * @param {string} plan — "free" | "premium" | "institutional"
 * @param {object} [options] — Additional subscription fields
 * @returns {Promise<{success: boolean}>}
 */
export async function setUserPlan(clerkUserId, plan, options = {}) {
  const client = getServiceClient();

  const { error } = await client
    .from("user_subscriptions")
    .upsert(
      {
        clerk_user_id: clerkUserId,
        plan,
        plan_status: options.planStatus || "active",
        helio_subscription_id: options.helioSubscriptionId || null,
        current_period_start: options.currentPeriodStart || null,
        current_period_end: options.currentPeriodEnd || null,
        trial_ends_at: options.trialEndsAt || null,
      },
      { onConflict: "clerk_user_id" }
    );

  if (error) throw new Error(`Failed to set user plan: ${error.message}`);

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: { plan },
    });
  } catch (err) {
    console.error("[credentials] Failed to update Clerk plan metadata:", err.message);
  }

  return { success: true };
}

// ── Onboarding ───────────────────────────────────────────────────────────────

/**
 * Get the user's onboarding status.
 *
 * @returns {Promise<{onboardingComplete: boolean, currentStep: number, paperKeysConfigured: boolean, liveKeysConfigured: boolean}>}
 */
export async function getOnboardingStatus() {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { data, error } = await client
    .from("user_onboarding")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !data) {
    return {
      onboardingComplete: false,
      currentStep: 0,
      paperKeysConfigured: false,
      liveKeysConfigured: false,
    };
  }

  return {
    onboardingComplete: data.onboarding_complete,
    currentStep: data.current_step,
    paperKeysConfigured: data.paper_keys_configured,
    liveKeysConfigured: data.live_keys_configured,
  };
}

/**
 * Update onboarding progress.
 *
 * @param {object} updates — Fields to update
 * @returns {Promise<{success: boolean}>}
 */
export async function updateOnboarding(updates) {
  const userId = await requireAuth();
  const client = getServiceClient();

  const { error } = await client
    .from("user_onboarding")
    .upsert(
      {
        clerk_user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" }
    );

  if (error) throw new Error(`Failed to update onboarding: ${error.message}`);
  return { success: true };
}

/**
 * Complete onboarding for the authenticated user.
 *
 * @returns {Promise<{success: boolean}>}
 */
export async function completeOnboarding() {
  return updateOnboarding({
    onboarding_complete: true,
    current_step: 3,
    completed_at: new Date().toISOString(),
  });
}

// ── Migration: Clerk → Supabase ──────────────────────────────────────────────

/**
 * One-time migration: Move Alpaca keys from Clerk privateMetadata to Supabase.
 * Called during onboarding or first settings visit.
 * Safe to call multiple times — it's idempotent.
 *
 * @returns {Promise<{migrated: boolean, credentialType: string}>}
 */
export async function migrateClerkKeysToSupabase() {
  const userId = await requireAuth();

  const paperStatus = await hasCredentials("paper");
  if (paperStatus.configured) {
    return { migrated: false, credentialType: "paper" };
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const meta = user.privateMetadata || {};

    const apiKey = meta.alpaca_api_key;
    const secretKey = meta.alpaca_secret_key;

    if (!apiKey || !secretKey) {
      return { migrated: false, credentialType: "none" };
    }

    await saveCredentials("paper", apiKey, secretKey);

    await clerk.users.updateUserMetadata(userId, {
      privateMetadata: {
        alpaca_api_key: null,
        alpaca_secret_key: null,
      },
    });

    return { migrated: true, credentialType: "paper" };
  } catch (err) {
    console.error("[credentials] Migration failed:", err.message);
    return { migrated: false, credentialType: "error" };
  }
}
