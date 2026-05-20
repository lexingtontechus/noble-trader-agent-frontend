/**
 * Credential management — Supabase-backed with pgcrypto encryption.
 *
 * Replaces the Clerk privateMetadata approach with a proper database layer.
 * Keys are encrypted at rest in Supabase using pgp_sym_encrypt/pgp_sym_decrypt
 * with the app.encryption_key database setting.
 *
 * All functions are SERVER-SIDE ONLY (API routes, Server Actions).
 * They require Clerk auth() to identify the user.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// ── Supabase admin client (service role key for credential operations) ──
// We need the service role key to:
//  1. Bypass RLS (credential writes happen server-side only)
//  2. Call the encrypt_credential() / decrypt_credential() DB functions
//     which require the app.encryption_key setting (not available to anon key)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;

function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SERVICE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
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
 * Encrypts keys at rest in Supabase. If keys already exist for this type, they are replaced.
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

  // Encrypt keys using Supabase pgcrypto functions
  const { data: encApiKey, error: encApiErr } = await client.rpc("encrypt_credential", {
    plain_text: apiKey,
  });
  if (encApiErr) throw new Error(`Failed to encrypt API key: ${encApiErr.message}`);

  const { data: encSecretKey, error: encSecretErr } = await client.rpc("encrypt_credential", {
    plain_text: secretKey,
  });
  if (encSecretErr) throw new Error(`Failed to encrypt secret key: ${encSecretErr.message}`);

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

  // Decrypt
  const { data: decApiKey, error: decApiErr } = await client.rpc("decrypt_credential", {
    cipher_text: data.api_key_encrypted,
  });
  if (decApiErr) {
    console.error("[credentials] Failed to decrypt API key:", decApiErr.message);
    return null;
  }

  const { data: decSecretKey, error: decSecretErr } = await client.rpc("decrypt_credential", {
    cipher_text: data.secret_key_encrypted,
  });
  if (decSecretErr) {
    console.error("[credentials] Failed to decrypt secret key:", decSecretErr.message);
    return null;
  }

  return {
    apiKey: decApiKey,
    secretKey: decSecretKey,
    isValid: data.is_valid,
  };
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
      // Mark as valid
      await client
        .from("user_credentials")
        .update({ is_valid: true, last_validated_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .eq("credential_type", credentialType);
      return { valid: true };
    } else {
      // Mark as invalid
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

  // Try Supabase first
  const client = getServiceClient();
  const { data, error } = await client
    .from("user_subscriptions")
    .select("plan, plan_status")
    .eq("clerk_user_id", userId)
    .single();

  if (!error && data) {
    // If subscription is not active, treat as free
    if (data.plan_status !== "active" && data.plan_status !== "trialing") {
      return "free";
    }
    return data.plan || "free";
  }

  // Fallback to Clerk privateMetadata
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

  // Also update Clerk privateMetadata for client-side reads
  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: { plan },
    });
  } catch (err) {
    console.error("[credentials] Failed to update Clerk plan metadata:", err.message);
    // Non-fatal — Supabase is the source of truth
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

  // Check if paper creds already exist in Supabase
  const paperStatus = await hasCredentials("paper");
  if (paperStatus.configured) {
    return { migrated: false, credentialType: "paper" };
  }

  // Read old keys from Clerk
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const meta = user.privateMetadata || {};

    const apiKey = meta.alpaca_api_key;
    const secretKey = meta.alpaca_secret_key;

    if (!apiKey || !secretKey) {
      return { migrated: false, credentialType: "none" };
    }

    // Save to Supabase as paper keys (old keys were paper-only)
    await saveCredentials("paper", apiKey, secretKey);

    // Remove from Clerk privateMetadata
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
