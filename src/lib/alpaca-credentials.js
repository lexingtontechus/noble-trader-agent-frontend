/**
 * Unified credential resolver — tries Supabase first, falls back to Clerk.
 *
 * This module provides a smooth migration path from Clerk privateMetadata
 * to Supabase-encrypted credentials. All Alpaca API routes should use
 * `getAlpacaCredentialKeys()` instead of directly calling `getAlpacaKeys()`
 * from clerk-metadata or `getCredentials()` from credentials.
 *
 * Flow:
 *  1. Check Supabase for the requested credential type (paper/live)
 *  2. If not found in Supabase, fall back to Clerk privateMetadata
 *  3. Return null if no keys found
 *
 * The trading mode (paper/live) is determined by:
 *  - The `noble-trading-mode` cookie/localStorage (client-side)
 *  - The `tradingMode` query param on API routes (server-side fallback)
 *  - Default: "paper"
 */

import { getCredentials, hasCredentials } from "@/lib/credentials";
import { getAlpacaKeys } from "@/lib/clerk-metadata";
import { getUserPlan } from "@/lib/credentials";
import { BROKER_IDS } from "@/lib/brokers/index";
import { getBrokerIdFromCredentialType } from "@/lib/brokers/broker-factory";

/**
 * Resolve the credential type based on plan and request context.
 * Live credentials require premium+ plan.
 *
 * @param {Request} [request] — Optional request object for reading headers
 * @returns {Promise<"paper"|"live">}
 */
export async function resolveCredentialType(request) {
  // Check if user has premium plan for live trading
  const plan = await getUserPlan();
  if (plan === "premium" || plan === "institutional") {
    // Check for explicit mode header (from TradingModeToggle)
    const modeHeader = request?.headers?.get("x-trading-mode");
    if (modeHeader === "live") return "live";

    // Check query param
    const url = request?.url ? new URL(request.url) : null;
    const modeParam = url?.searchParams?.get("mode");
    if (modeParam === "live") return "live";

    // Check if live keys exist and are valid
    const liveStatus = await hasCredentials("live");
    if (liveStatus.configured && liveStatus.isValid) {
      // Has live keys — but still default to paper unless explicitly requested
      // Safety: always default to paper unless user explicitly switches
    }
  }

  return "paper";
}

/**
 * Get Alpaca API keys for the authenticated user.
 * Tries Supabase first, then Clerk privateMetadata as fallback.
 *
 * @param {"paper"|"live"} [type] — Credential type (auto-resolved if not specified)
 * @param {Request} [request] — Optional request for mode resolution
 * @returns {Promise<{apiKey: string, secretKey: string}|null>}
 */
export async function getAlpacaCredentialKeys(type, request) {
  const credentialType = type || await resolveCredentialType(request);

  // Try Supabase first (new system)
  try {
    const creds = await getCredentials(credentialType);
    if (creds?.apiKey && creds?.secretKey) {
      return creds;
    }
  } catch {
    // Supabase lookup failed — fall through to Clerk
  }

  // Fallback: Clerk privateMetadata (legacy system)
  // Only supports paper keys (old system had no paper/live distinction)
  if (credentialType === "paper") {
    try {
      const keys = await getAlpacaKeys();
      if (keys?.apiKey && keys?.secretKey) {
        return keys;
      }
    } catch {
      // Clerk lookup also failed
    }
  }

  return null;
}

// ── Broker abstraction helpers ──────────────────────────────────────────────

/**
 * Resolve the broker ID based on the user's credential type and request context.
 * This bridges the existing credential system with the new broker abstraction.
 *
 * @param {Request} [request] — Optional request for mode resolution
 * @returns {Promise<string>} Broker ID (e.g., 'alpaca_paper' or 'alpaca_live')
 */
export async function resolveBrokerId(request) {
  const credentialType = await resolveCredentialType(request);
  return getBrokerIdFromCredentialType(credentialType);
}

/**
 * Resolve the full broker configuration needed by the factory.
 * Returns { brokerId, credentials } ready for createBroker().
 *
 * @param {Request} [request] — Optional request for mode resolution
 * @returns {Promise<{brokerId: string, credentials: {apiKey: string, secretKey: string}}|null>}
 *   Returns null if no credentials are found
 */
export async function resolveBrokerConfig(request) {
  const credentialType = await resolveCredentialType(request);
  const keys = await getAlpacaCredentialKeys(credentialType, request);

  if (!keys?.apiKey || !keys?.secretKey) {
    return null;
  }

  return {
    brokerId: getBrokerIdFromCredentialType(credentialType),
    credentials: {
      apiKey: keys.apiKey,
      secretKey: keys.secretKey,
    },
  };
}
