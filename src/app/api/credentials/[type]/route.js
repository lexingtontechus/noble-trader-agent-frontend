/**
 * API Route: /api/credentials/[type]
 *
 * CRUD for user Alpaca credentials (paper/live) stored in Supabase.
 * Type is "paper" or "live".
 *
 * GET    — Check if credentials are configured for this type
 * POST   — Save new credentials (encrypted)
 * DELETE — Remove credentials
 * PUT    — Validate credentials against Alpaca API
 */

import {
  hasCredentials,
  saveCredentials,
  deleteCredentials,
  validateCredentials,
} from "@/lib/credentials";
import { createApiError, sanitizeError } from "@/lib/error-messages";

export async function GET(request, { params }) {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    const status = await hasCredentials(type);
    return Response.json(status);
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}

export async function POST(request, { params }) {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    const body = await request.json();
    const { apiKey, secretKey } = body;

    if (!apiKey || !secretKey) {
      return Response.json({ error: "Both API Key and Secret Key are required" }, { status: 400 });
    }

    const result = await saveCredentials(type, apiKey, secretKey);
    return Response.json(result);
  } catch (error) {
    // Plan-gated errors are user-friendly already ("Live trading requires...")
    const { message, code, status } = sanitizeError(error, { context: "credentials" });
    // Preserve the plan-required message since it's already user-friendly
    if (error.message?.includes("Premium") || error.message?.includes("Institutional")) {
      return Response.json({ error: error.message, code: "PLAN_REQUIRED" }, { status: 403 });
    }
    return Response.json({ error: message, code }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    const result = await deleteCredentials(type);
    return Response.json(result);
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}

export async function PUT(request, { params }) {
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
}
