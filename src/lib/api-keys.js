/**
 * API Key Management — SaaS API key generation, hashing, and lifecycle.
 *
 * Provides server-side utilities for the Noble Trader API key system:
 *   - Key generation: nt_live_{64 hex chars} (256-bit entropy)
 *   - SHA-256 hashing for secure storage (never store plaintext)
 *   - Prefix extraction for UI display (nt_live_a3f2...)
 *   - Plan-aware key limits and expiry calculation
 *   - Key validation and lookup helpers
 *
 * Plan entitlements:
 *   - Free: 1 key, 30-day expiry from creation
 *   - Premium: 1 key, permanent (no expiry)
 *   - Institutional: 5 keys, permanent + rotation support
 *
 * All functions are SERVER-SIDE ONLY (API routes, withAuth middleware).
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── Constants ────────────────────────────────────────────────────────────────

const KEY_PREFIX = "nt_live_";
const KEY_RANDOM_BYTES = 32; // 32 bytes = 64 hex chars

/** Maximum concurrent active API keys per plan */
export const PLAN_KEY_LIMITS = {
  free: 1,
  premium: 1,
  institutional: 5,
};

/** Key expiry duration per plan (null = permanent) */
export const PLAN_KEY_EXPIRY = {
  free: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  premium: null,
  institutional: null,
};

/** Rotation grace period for premium/institutional (24 hours) */
export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

// ── Supabase client ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;

function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("[api-keys] Supabase service credentials not configured");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a new API key with the nt_live_ prefix.
 * Returns the FULL plaintext key — this is the ONLY time it's available.
 * After returning it to the client, only the SHA-256 hash is stored.
 *
 * @returns {string} Full API key, e.g. "nt_live_a3f2e1d8...64hex"
 */
export function generateApiKey() {
  const randomBytes = crypto.randomBytes(KEY_RANDOM_BYTES);
  return `${KEY_PREFIX}${randomBytes.toString("hex")}`;
}

/**
 * Hash an API key using SHA-256 for database storage.
 * Uses a pepper (SUPABASE_ENCRYPTION_KEY) for additional security,
 * matching the hashPII pattern in encryption.js.
 *
 * @param {string} apiKey — Full API key (nt_live_...)
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashApiKey(apiKey) {
  const pepper = process.env.SUPABASE_ENCRYPTION_KEY || "default-pepper-change-me";
  return crypto
    .createHash("sha256")
    .update(apiKey + pepper)
    .digest("hex");
}

/**
 * Extract the display prefix from an API key.
 * Returns the prefix + first 4 chars of the random portion for UI.
 *
 * @param {string} apiKey — Full API key
 * @returns {string} Prefix like "nt_live_a3f2"
 */
export function getApiKeyPrefix(apiKey) {
  if (!apiKey || !apiKey.startsWith(KEY_PREFIX)) return "nt_live_????";
  // Return prefix + first 4 hex chars of the random portion
  return apiKey.substring(0, KEY_PREFIX.length + 4);
}

/**
 * Validate that a string looks like a Noble Trader API key.
 * Only checks format — does NOT verify the key exists in the database.
 *
 * @param {string} apiKey — String to validate
 * @returns {boolean} True if format matches nt_live_{64 hex chars}
 */
export function isValidApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== "string") return false;
  if (!apiKey.startsWith(KEY_PREFIX)) return false;
  const hexPart = apiKey.substring(KEY_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(hexPart);
}

// ── Database Operations ──────────────────────────────────────────────────────

/**
 * Look up an API key by its full plaintext value.
 * Returns the key record if found and active, null otherwise.
 * Also updates last_used_at (fire-and-forget).
 *
 * @param {string} apiKey — Full API key from X-API-Key header
 * @param {string} [requestIp] — Hashed IP for audit (optional)
 * @returns {Promise<{id: string, clerk_user_id: string, plan_at_creation: string, role_at_creation: string, expires_at: string|null, scopes: object|null}|null>}
 */
export async function lookupApiKey(apiKey, requestIp = null) {
  if (!isValidApiKeyFormat(apiKey)) return null;

  const client = getServiceClient();
  const keyHash = hashApiKey(apiKey);

  const { data, error } = await client
    .from("api_keys")
    .select("id, clerk_user_id, key_prefix, plan_at_creation, role_at_creation, scopes, expires_at, is_active, rotation_grace_until")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) return null;

  // Check if key is active
  if (!data.is_active) return null;

  // Check if key is expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Auto-expire the key
    client
      .from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {})
      .catch(() => {});
    return null;
  }

  // Check if key is in rotation grace period (still valid)
  // If rotation_grace_until is set and we're past it, the key is dead
  if (data.rotation_grace_until && new Date(data.rotation_grace_until) < new Date()) {
    client
      .from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {})
      .catch(() => {});
    return null;
  }

  // Update last_used_at (fire-and-forget)
  const updates = { last_used_at: new Date().toISOString() };
  if (requestIp) updates.last_used_ip = requestIp;
  client
    .from("api_keys")
    .update(updates)
    .eq("id", data.id)
    .then(() => {})
    .catch(() => {});

  return {
    id: data.id,
    clerk_user_id: data.clerk_user_id,
    plan_at_creation: data.plan_at_creation,
    role_at_creation: data.role_at_creation,
    scopes: data.scopes,
    expires_at: data.expires_at,
  };
}

/**
 * Create a new API key for a user.
 * Enforces plan-based key limits before creation.
 *
 * @param {string} clerkUserId — Clerk user ID
 * @param {string} plan — User's current plan
 * @param {string} role — User's current role
 * @param {object} [options] — Additional options
 * @param {string} [options.name] — Key label
 * @param {UUID} [options.rotatedFrom] — ID of key being rotated (for rotation chain)
 * @returns {Promise<{key: string, prefix: string, id: string, expiresAt: string|null}>}
 */
export async function createApiKey(clerkUserId, plan, role, options = {}) {
  const client = getServiceClient();
  const maxKeys = PLAN_KEY_LIMITS[plan] ?? 1;

  // Count existing active keys
  const { count, error: countErr } = await client
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", clerkUserId)
    .eq("is_active", true);

  if (countErr) throw new Error(`Failed to count API keys: ${countErr.message}`);
  if ((count || 0) >= maxKeys) {
    throw new Error(
      `API key limit reached (${maxKeys} for ${plan} plan). ` +
      (plan === "free" ? "Upgrade to Premium for a permanent key." :
       plan === "premium" ? "Upgrade to Institutional for multiple keys." :
       "Revoke an existing key to create a new one.")
    );
  }

  // Generate and hash the key
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = getApiKeyPrefix(apiKey);

  // Calculate expiry
  const expiryMs = PLAN_KEY_EXPIRY[plan];
  const expiresAt = expiryMs ? new Date(Date.now() + expiryMs).toISOString() : null;

  // If this is a rotation, set grace period on the old key
  if (options.rotatedFrom) {
    const graceUntil = new Date(Date.now() + ROTATION_GRACE_MS).toISOString();
    await client
      .from("api_keys")
      .update({ rotation_grace_until: graceUntil })
      .eq("id", options.rotatedFrom)
      .eq("clerk_user_id", clerkUserId);
  }

  // Insert the new key
  const { data, error } = await client
    .from("api_keys")
    .insert({
      clerk_user_id: clerkUserId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: options.name || "Default Key",
      plan_at_creation: plan,
      role_at_creation: role,
      expires_at: expiresAt,
      rotated_from: options.rotatedFrom || null,
    })
    .select("id")
    .single();

  if (error) {
    // Handle rare hash collision
    if (error.code === "23505") {
      throw new Error("Key hash collision — this is extremely unlikely. Please try again.");
    }
    throw new Error(`Failed to create API key: ${error.message}`);
  }

  return {
    key: apiKey,       // Full key — ONLY returned at creation time!
    prefix: keyPrefix,
    id: data.id,
    expiresAt,
  };
}

/**
 * List all API keys for a user (prefixes only, never full keys).
 *
 * @param {string} clerkUserId — Clerk user ID
 * @returns {Promise<Array>} Key records with prefixes
 */
export async function listApiKeys(clerkUserId) {
  const client = getServiceClient();

  const { data, error } = await client
    .from("api_keys")
    .select("id, key_prefix, name, plan_at_creation, role_at_creation, scopes, expires_at, last_used_at, is_active, rotated_from, rotation_grace_until, created_at, revoked_at")
    .eq("clerk_user_id", clerkUserId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list API keys: ${error.message}`);
  return data || [];
}

/**
 * Revoke an API key by ID.
 * Only the key owner can revoke their own keys.
 *
 * @param {string} clerkUserId — Clerk user ID (for ownership verification)
 * @param {string} keyId — UUID of the key to revoke
 * @returns {Promise<{success: boolean}>}
 */
export async function revokeApiKey(clerkUserId, keyId) {
  const client = getServiceClient();

  const { error } = await client
    .from("api_keys")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      rotation_grace_until: null, // Cancel any grace period
    })
    .eq("id", keyId)
    .eq("clerk_user_id", clerkUserId); // Ownership check

  if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
  return { success: true };
}

/**
 * Rotate an API key: creates a new key and starts grace period on the old one.
 * Only available for premium/institutional users.
 *
 * @param {string} clerkUserId — Clerk user ID
 * @param {string} keyId — UUID of the key to rotate
 * @param {string} plan — User's current plan
 * @param {string} role — User's current role
 * @param {object} [options] — Additional options
 * @param {string} [options.name] — New key label
 * @returns {Promise<{key: string, prefix: string, id: string, expiresAt: string|null, oldKeyGraceUntil: string}>}
 */
export async function rotateApiKey(clerkUserId, keyId, plan, role, options = {}) {
  const client = getServiceClient();

  // Verify the old key exists and belongs to this user
  const { data: oldKey, error: lookupErr } = await client
    .from("api_keys")
    .select("id, is_active, rotation_grace_until")
    .eq("id", keyId)
    .eq("clerk_user_id", clerkUserId)
    .eq("is_active", true)
    .single();

  if (lookupErr || !oldKey) {
    throw new Error("Active API key not found or you don't have permission to rotate it");
  }

  // Rotation requires premium+ (free users must revoke and recreate)
  if (plan === "free") {
    throw new Error("Key rotation requires a Premium or Institutional plan. Revoke and create a new key instead.");
  }

  // Create the new key (with rotation chain)
  const result = await createApiKey(clerkUserId, plan, role, {
    name: options.name || "Rotated Key",
    rotatedFrom: keyId,
  });

  // Get the grace period end time from the old key
  const { data: updatedOldKey } = await client
    .from("api_keys")
    .select("rotation_grace_until")
    .eq("id", keyId)
    .single();

  return {
    ...result,
    oldKeyGraceUntil: updatedOldKey?.rotation_grace_until || new Date(Date.now() + ROTATION_GRACE_MS).toISOString(),
  };
}

/**
 * Update API keys when a user's plan changes.
 * Called from Helio subscription webhooks.
 *
 * - Upgrade: remove expiry from all active keys, update plan_at_creation
 * - Downgrade to free: set 30-day expiry on all active keys
 *
 * @param {string} clerkUserId — Clerk user ID
 * @param {string} newPlan — New plan after change
 * @returns {Promise<{updated: number}>}
 */
export async function updateKeysForPlanChange(clerkUserId, newPlan) {
  const client = getServiceClient();

  if (newPlan === "free") {
    // Downgrade: set 30-day expiry on all active permanent keys
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Also deactivate keys beyond the free limit (keep only 1)
    const { data: activeKeys } = await client
      .from("api_keys")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (activeKeys && activeKeys.length > 1) {
      // Keep the most recent key, revoke the rest
      const keysToRevoke = activeKeys.slice(1).map((k) => k.id);
      await client
        .from("api_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .in("id", keysToRevoke);
    }

    // Set expiry on the remaining key
    const { error } = await client
      .from("api_keys")
      .update({
        expires_at: expiresAt,
        plan_at_creation: "free",
      })
      .eq("clerk_user_id", clerkUserId)
      .eq("is_active", true);

    if (error) throw new Error(`Failed to update keys for plan change: ${error.message}`);
    return { updated: 1 };
  } else {
    // Upgrade: remove expiry, update plan
    const { data, error } = await client
      .from("api_keys")
      .update({
        expires_at: null,
        plan_at_creation: newPlan,
      })
      .eq("clerk_user_id", clerkUserId)
      .eq("is_active", true);

    if (error) throw new Error(`Failed to update keys for plan change: ${error.message}`);
    return { updated: data?.length || 0 };
  }
}

/**
 * Get the number of active API keys for a user.
 *
 * @param {string} clerkUserId — Clerk user ID
 * @returns {Promise<number>}
 */
export async function getActiveKeyCount(clerkUserId) {
  const client = getServiceClient();

  const { count, error } = await client
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", clerkUserId)
    .eq("is_active", true);

  if (error) return 0;
  return count || 0;
}

/**
 * Get the maximum number of API keys allowed for a plan.
 *
 * @param {string} plan — Plan key
 * @returns {number}
 */
export function getKeyLimit(plan) {
  return PLAN_KEY_LIMITS[plan] ?? 1;
}

/**
 * Calculate the expiry date for a new API key based on plan.
 *
 * @param {string} plan — Plan key
 * @returns {string|null} ISO date string or null for permanent
 */
export function calculateKeyExpiry(plan) {
  const expiryMs = PLAN_KEY_EXPIRY[plan];
  return expiryMs ? new Date(Date.now() + expiryMs).toISOString() : null;
}
