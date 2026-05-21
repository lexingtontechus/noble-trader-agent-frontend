/**
 * API Route: /api/credentials/[type]
 *
 * CRUD for user Alpaca credentials (paper/live).
 * Primary storage: Supabase (AES-256-GCM encrypted).
 * Fallback: Clerk privateMetadata (paper keys only, legacy).
 *
 * GET    — Check if credentials are configured for this type
 * POST   — Save new credentials (encrypted in Supabase, or Clerk as fallback)
 * DELETE — Remove credentials
 * PUT    — Validate credentials against Alpaca API
 */

import { withAuth } from "@/lib/withAuth";
import {
  hasCredentials,
  saveCredentials,
  deleteCredentials,
  validateCredentials,
} from "@/lib/credentials";
import { getAlpacaKeys, setAlpacaKeys, deleteAlpacaKeys, hasAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError, sanitizeError } from "@/lib/error-messages";

export const GET = withAuth(async (request, { params }, _authContext) => {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    // Try Supabase first
    try {
      const status = await hasCredentials(type);
      if (status.configured) return Response.json({ ...status, source: "supabase" });
    } catch (err) {
      console.warn("[credentials/GET] Supabase check failed:", err.message);
    }

    // Fallback: Clerk privateMetadata (paper only in old system)
    if (type === "paper") {
      try {
        const configured = await hasAlpacaKeys();
        return Response.json({ configured, isValid: configured ? true : null, source: "clerk" });
      } catch (err) {
        console.warn("[credentials/GET] Clerk check also failed:", err.message);
      }
    }

    return Response.json({ configured: false, isValid: null, source: "none" });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });

export const POST = withAuth(async (request, { params }, authContext) => {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    // Plan gating for live credentials — enforced at middleware level
    if (type === "live") {
      const allowedPlans = ["premium", "institutional"];
      if (!allowedPlans.includes(authContext.plan)) {
        return Response.json(
          { error: "Live trading requires a Premium or Institutional plan", code: "PLAN_REQUIRED" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { apiKey, secretKey } = body;

    if (!apiKey || !secretKey) {
      return Response.json({ error: "Both API Key and Secret Key are required" }, { status: 400 });
    }

    // Try Supabase first (encrypted storage)
    try {
      const result = await saveCredentials(type, apiKey, secretKey);
      console.info(`[credentials/POST] Keys saved to Supabase for type=${type}`);
      return Response.json({ ...result, storage: "encrypted" });
    } catch (supabaseErr) {
      console.error(`[credentials/POST] Supabase save failed for type=${type}:`, supabaseErr.message);
      console.error("[credentials/POST] Full error:", supabaseErr.stack || supabaseErr);

      // Fallback: Clerk privateMetadata (paper keys only)
      if (type === "paper") {
        try {
          await setAlpacaKeys(apiKey, secretKey);
          console.warn(`[credentials/POST] Fell back to Clerk storage for paper keys — Supabase is not configured correctly`);
          return Response.json({ success: true, credentialType: "paper", storage: "clerk" });
        } catch (clerkErr) {
          console.error("[credentials/POST] Clerk fallback also failed:", clerkErr.message);
          return createApiError(clerkErr, { context: "credentials" });
        }
      }

      // Live keys can't be saved to Clerk — need Supabase
      return Response.json(
        { error: "Unable to save live trading keys right now. Please try again later.", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
  } catch (error) {
    if (error.message?.includes("Premium") || error.message?.includes("Institutional")) {
      return Response.json({ error: error.message, code: "PLAN_REQUIRED" }, { status: 403 });
    }
    const { message, code, status } = sanitizeError(error, { context: "credentials" });
    return Response.json({ error: message, code }, { status });
  }
}, { minRole: "viewer" });

export const DELETE = withAuth(async (request, { params }, _authContext) => {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    // Try Supabase first
    let supabaseDeleted = false;
    try {
      await deleteCredentials(type);
      supabaseDeleted = true;
      console.info(`[credentials/DELETE] Keys deleted from Supabase for type=${type}`);
    } catch (err) {
      console.warn(`[credentials/DELETE] Supabase delete failed:`, err.message);
    }

    // Also clean up Clerk privateMetadata (legacy)
    if (type === "paper") {
      try {
        await deleteAlpacaKeys();
      } catch {
        // Clerk cleanup optional
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "trader" });

export const PUT = withAuth(async (request, { params }, _authContext) => {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    const result = await validateCredentials(type);
    return Response.json(result);
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });
