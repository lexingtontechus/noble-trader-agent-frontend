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

export async function GET(request, { params }) {
  try {
    const { type } = await params;
    if (!["paper", "live"].includes(type)) {
      return Response.json({ error: "Invalid credential type. Use 'paper' or 'live'." }, { status: 400 });
    }

    const status = await hasCredentials(type);
    return Response.json(status);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
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
      return Response.json({ error: "Both apiKey and secretKey are required" }, { status: 400 });
    }

    const result = await saveCredentials(type, apiKey, secretKey);
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error.message.includes("Premium")) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json({ error: error.message }, { status: 500 });
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
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
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
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}
