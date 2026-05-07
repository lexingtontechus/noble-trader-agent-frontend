/**
 * GET /api/auth/clerk-token
 * Returns the raw Clerk JWT token from the current session.
 * Minimal version — uses Clerk REST API only, no heavy SDK imports.
 */

import { auth } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId, sessionId } = await auth();

    if (!userId || !sessionId) {
      return Response.json(
        { error: "Not signed in via Clerk" },
        { status: 401 },
      );
    }

    // Get JWT via Clerk REST API
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return Response.json(
        { error: "Clerk secret key not configured" },
        { status: 500 },
      );
    }

    const tokenRes = await fetch(
      `https://api.clerk.com/v1/sessions/${sessionId}/tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!tokenRes.ok) {
      return Response.json(
        { error: "Failed to get Clerk token", status: tokenRes.status },
        { status: tokenRes.status },
      );
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.jwt;

    // Decode JWT payload (lightweight)
    let payload = null;
    try {
      const parts = token.split(".");
      const b64 = parts[1];
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      payload = JSON.parse(Buffer.from(padded, "base64url").toString("utf-8"));
    } catch {
      // Can't decode
    }

    return Response.json({
      token,
      token_preview: token.substring(0, 40) + "...",
      issuer: payload?.iss || null,
      subject: payload?.sub || null,
      issued_at: payload?.iat
        ? new Date(payload.iat * 1000).toISOString()
        : null,
      expires_at: payload?.exp
        ? new Date(payload.exp * 1000).toISOString()
        : null,
    });
  } catch (err) {
    console.error("[/api/auth/clerk-token] Error:", err.message);
    return Response.json(
      { error: "Clerk-token proxy failed", detail: err.message },
      { status: 502 },
    );
  }
}
