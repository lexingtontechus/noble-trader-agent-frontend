/**
 * Encryption utility — AES-256-GCM with PBKDF2 key derivation and key rotation.
 *
 * This module provides a robust, production-grade encryption system:
 *   - AES-256-GCM authenticated encryption (confidentiality + integrity)
 *   - PBKDF2 key derivation from the master key (prevents weak-key issues)
 *   - Key versioning for rotation without data loss
 *   - Validation of encryption key strength
 *   - Support for encrypting arbitrary string fields
 *
 * Key Rotation Flow:
 *   1. Add a new SUPABASE_ENCRYPTION_KEY_V2 env var
 *   2. Set SUPABASE_ENCRYPTION_ACTIVE_VERSION=2
 *   3. New encryptions use V2; old data can still be decrypted with V1
 *   4. Run the re-encryption migration to rotate all existing data
 *   5. Remove V1 key after all data is rotated
 *
 * Encrypted data format:
 *   v{version}:{salt_base64}:{iv_base64}:{tag_base64}:{ciphertext_base64}
 *
 * All functions are SERVER-SIDE ONLY.
 */

import crypto from "crypto";

// ── Configuration ────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000; // OWASP recommended minimum

// ── Key Management ───────────────────────────────────────────────────────────

/**
 * Get all configured encryption keys, indexed by version.
 * Supports key rotation via SUPABASE_ENCRYPTION_KEY_V1, V2, etc.
 */
function getKeyStore() {
  const store = {};

  // V1: Original key
  const v1Key = process.env.SUPABASE_ENCRYPTION_KEY;
  if (v1Key) store[1] = v1Key;

  // V2+: Additional keys for rotation
  for (let v = 2; v <= 10; v++) {
    const key = process.env[`SUPABASE_ENCRYPTION_KEY_V${v}`];
    if (key) store[v] = key;
  }

  return store;
}

/**
 * Get the active encryption key version.
 * Defaults to the highest available version, or 1 if only the base key exists.
 */
function getActiveVersion() {
  const explicitVersion = parseInt(process.env.SUPABASE_ENCRYPTION_ACTIVE_VERSION || "0");
  if (explicitVersion > 0) return explicitVersion;

  // Default: use V1 if no versioned keys exist
  const store = getKeyStore();
  const versions = Object.keys(store).map(Number).sort((a, b) => b - a);
  return versions[0] || 1;
}

/**
 * Derive a 32-byte encryption key from a master key + salt using PBKDF2.
 * This prevents the previous vulnerability where short keys were padded with spaces.
 *
 * @param {string} masterKey - The raw master key from env vars
 * @param {Buffer} salt - Random salt for this derivation
 * @returns {Buffer} - 32-byte derived key
 */
function deriveKey(masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

/**
 * Validate that the encryption key meets minimum strength requirements.
 * Throws if the key is missing, empty, or too short.
 */
function validateKeyStrength(masterKey, version) {
  if (!masterKey) {
    throw new Error(
      `[encryption] SUPABASE_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ""} is not set. ` +
      "Encryption is required for sensitive data storage."
    );
  }

  if (masterKey.length < 16) {
    throw new Error(
      `[encryption] SUPABASE_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ""} is too short ` +
      `(${masterKey.length} chars). Minimum 16 characters required for security.`
    );
  }

  // Warn (but don't throw) for keys that could be stronger
  if (masterKey.length < 32) {
    console.warn(
      `[encryption] SUPABASE_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ""} is ${masterKey.length} chars. ` +
      "Recommend 32+ characters for production use."
    );
  }
}

// ── Core Encryption/Decryption ───────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM with PBKDF2 key derivation.
 *
 * Output format: v{version}:{salt_base64}:{iv_base64}:{tag_base64}:{ciphertext_base64}
 * This format is self-describing and supports key rotation.
 *
 * @param {string} plainText - The plaintext to encrypt
 * @param {object} [options] - Optional overrides
 * @param {number} [options.version] - Key version to use (default: active version)
 * @returns {string} - Encrypted string with version prefix
 */
export function encrypt(plainText, options = {}) {
  const version = options.version || getActiveVersion();
  const store = getKeyStore();
  const masterKey = store[version];

  if (!masterKey) {
    throw new Error(
      `[encryption] No encryption key found for version ${version}. ` +
      "Ensure SUPABASE_ENCRYPTION_KEY or SUPABASE_ENCRYPTION_KEY_V{n} is set."
    );
  }

  validateKeyStrength(masterKey, version);

  // Generate random salt + IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive encryption key from master key + salt
  const key = deriveKey(masterKey, salt);

  // Encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plainText, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const tag = cipher.getAuthTag();

  // Format: v{version}:{salt}:{iv}:{tag}:{ciphertext}
  return [
    `v${version}`,
    salt.toString("base64"),
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext,
  ].join(":");
}

/**
 * Decrypt a string encrypted by this module.
 * Supports key rotation — automatically detects the version from the prefix.
 *
 * @param {string} encoded - Encrypted string (v{version}:salt:iv:tag:ciphertext format)
 * @returns {string} - Decrypted plaintext
 */
export function decrypt(encoded) {
  // Check if this is a versioned format
  if (encoded.startsWith("v") && encoded.includes(":")) {
    return decryptVersioned(encoded);
  }

  // Legacy format (from old credentials.js): base64(iv + tag + ciphertext)
  return decryptLegacy(encoded);
}

/**
 * Decrypt a versioned encrypted string.
 * Format: v{version}:{salt_base64}:{iv_base64}:{tag_base64}:{ciphertext_base64}
 */
function decryptVersioned(encoded) {
  const parts = encoded.split(":");
  if (parts.length !== 5) {
    throw new Error("[encryption] Invalid encrypted data format — expected 5 colon-separated parts");
  }

  const versionStr = parts[0]; // "v1", "v2", etc.
  const version = parseInt(versionStr.substring(1));
  const salt = Buffer.from(parts[1], "base64");
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const ciphertext = parts[4]; // Already base64

  const store = getKeyStore();
  const masterKey = store[version];

  if (!masterKey) {
    throw new Error(
      `[encryption] No decryption key found for version ${version}. ` +
      "The key may have been removed during a rotation. Add the key back to decrypt this data."
    );
  }

  // Derive the same key from master key + salt
  const key = deriveKey(masterKey, salt);

  // Decrypt
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Decrypt a legacy-format encrypted string (from old credentials.js).
 * Old format: base64(iv + tag + ciphertext) — no salt, no PBKDF2, padded key.
 * This provides backward compatibility during migration.
 */
function decryptLegacy(encoded) {
  const ENCRYPTION_KEY = process.env.SUPABASE_ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error("[encryption] SUPABASE_ENCRYPTION_KEY not set — cannot decrypt legacy data");
  }

  // Old key derivation: padEnd(32).slice(0, 32) — must match exactly
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

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Check if an encrypted string uses the new versioned format.
 * Useful for determining if re-encryption is needed.
 *
 * @param {string} encoded - The encrypted string to check
 * @returns {boolean} - True if versioned format
 */
export function isVersioned(encoded) {
  return typeof encoded === "string" && /^v\d+:/.test(encoded);
}

/**
 * Check if an encrypted string needs re-encryption (different version than active).
 *
 * @param {string} encoded - The encrypted string
 * @returns {boolean} - True if re-encryption is needed
 */
export function needsReEncryption(encoded) {
  if (!isVersioned(encoded)) return true; // Legacy format needs re-encryption

  const version = parseInt(encoded.split(":")[0].substring(1));
  return version !== getActiveVersion();
}

/**
 * Re-encrypt a string with the current active key version.
 * Decrypts with the old key, then re-encrypts with the active key.
 *
 * @param {string} encoded - The encrypted string to re-encrypt
 * @returns {string} - Newly encrypted string with active key version
 */
export function reEncrypt(encoded) {
  const plainText = decrypt(encoded);
  return encrypt(plainText);
}

/**
 * Get the encryption key version from an encrypted string.
 *
 * @param {string} encoded - The encrypted string
 * @returns {number} - Key version (0 for legacy format)
 */
export function getKeyVersion(encoded) {
  if (!isVersioned(encoded)) return 0; // Legacy
  return parseInt(encoded.split(":")[0].substring(1));
}

/**
 * Hash a value using SHA-256 (one-way, for PII like IP addresses).
 * Uses a pepper (SUPABASE_ENCRYPTION_KEY) for additional security.
 *
 * @param {string} value - The value to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
export function hashPII(value) {
  const pepper = process.env.SUPABASE_ENCRYPTION_KEY || "default-pepper-change-me";
  return crypto
    .createHash("sha256")
    .update(value + pepper)
    .digest("hex");
}

/**
 * Check if the encryption system is properly configured.
 * Returns a status object for health checks.
 *
 * @returns {{ configured: boolean, activeVersion: number, keyCount: number, warning?: string }}
 */
export function getEncryptionStatus() {
  const store = getKeyStore();
  const versions = Object.keys(store).map(Number);
  const activeVersion = getActiveVersion();

  if (versions.length === 0) {
    return {
      configured: false,
      activeVersion: 0,
      keyCount: 0,
      warning: "No encryption keys configured. Sensitive data cannot be encrypted.",
    };
  }

  const status = {
    configured: true,
    activeVersion,
    keyCount: versions.length,
  };

  // Check for weak keys
  for (const v of versions) {
    if (store[v].length < 16) {
      status.warning = `Key V${v} is too short (${store[v].length} chars). Minimum 16 required.`;
      break;
    }
  }

  // Check if legacy format is still in use
  if (activeVersion === 1 && !process.env.SUPABASE_ENCRYPTION_KEY_V1) {
    status.info = "Using V1 key (legacy format compatible). Consider rotating to V2.";
  }

  return status;
}
