/**
 * API Route: /api/api-keys
 *
 * CRUD operations for SaaS API key management.
 * All routes require Clerk authentication (API keys cannot manage API keys).
 *
 * GET    /api/api-keys          — List user's API keys (prefixes only)
 * POST   /api/api-keys          — Create a new API key
 * POST   /api/api-keys/rotate   — Rotate an existing API key
 * DELETE /api/api-keys?id=xxx   — Revoke an API key
 *
 * Plan entitlements:
 *   - Free: 1 key, 30-day expiry
 *   - Premium: 1 key, permanent
 *   - Institutional: 5 keys, permanent + rotation
 */

import { withAuth } from "@/lib/withAuth";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  getActiveKeyCount,
  getKeyLimit,
  calculateKeyExpiry,
} from "@/lib/api-keys";

// ── GET: List API keys ────────────────────────────────────────────────────────

export const GET = withAuth(async (request, context, authContext) => {
  const { userId, plan } = authContext;

  try {
    const keys = await listApiKeys(userId);
    const activeCount = keys.filter((k) => k.is_active).length;
    const maxKeys = getKeyLimit(plan);

    return Response.json({
      keys: keys.map((k) => ({
        id: k.id,
        prefix: k.key_prefix,
        name: k.name,
        plan: k.plan_at_creation,
        role: k.role_at_creation,
        scopes: k.scopes,
        expiresAt: k.expires_at,
        lastUsedAt: k.last_used_at,
        isActive: k.is_active,
        rotatedFrom: k.rotated_from,
        rotationGraceUntil: k.rotation_grace_until,
        createdAt: k.created_at,
        revokedAt: k.revoked_at,
      })),
      meta: {
        activeCount,
        maxKeys,
        canCreate: activeCount < maxKeys,
        plan,
        expiryInfo: plan === "free"
          ? "Keys expire 30 days after creation"
          : "Keys are permanent",
      },
    });
  } catch (err) {
    console.error("[api-keys] List error:", err.message);
    return Response.json({ error: "Failed to list API keys" }, { status: 500 });
  }
});

// ── POST: Create or Rotate API key ────────────────────────────────────────────

export const POST = withAuth(async (request, context, authContext) => {
  const { userId, role, plan } = authContext;

  try {
    const body = await request.json();
    const action = body.action || "create";

    if (action === "rotate") {
      // ── Rotate existing key ──────────────────────────────────────────
      const { keyId, name } = body;

      if (!keyId) {
        return Response.json({ error: "keyId is required for rotation" }, { status: 400 });
      }

      const result = await rotateApiKey(userId, keyId, plan, role, { name });

      return Response.json({
        success: true,
        action: "rotate",
        key: result.key,          // Full key — ONLY returned at creation time!
        prefix: result.prefix,
        id: result.id,
        expiresAt: result.expiresAt,
        oldKeyGraceUntil: result.oldKeyGraceUntil,
        warning: "Save this key now. It will not be shown again.",
      });
    }

    if (action === "create") {
      // ── Create new key ───────────────────────────────────────────────
      const { name } = body;

      const result = await createApiKey(userId, plan, role, { name });

      return Response.json({
        success: true,
        action: "create",
        key: result.key,          // Full key — ONLY returned at creation time!
        prefix: result.prefix,
        id: result.id,
        expiresAt: result.expiresAt,
        warning: "Save this key now. It will not be shown again.",
      });
    }

    return Response.json({ error: `Unknown action: ${action}. Use "create" or "rotate".` }, { status: 400 });
  } catch (err) {
    console.error("[api-keys] Create/Rotate error:", err.message);

    if (err.message.includes("limit reached")) {
      return Response.json({ error: err.message, code: "KEY_LIMIT_REACHED" }, { status: 403 });
    }
    if (err.message.includes("rotation requires")) {
      return Response.json({ error: err.message, code: "PLAN_REQUIRED" }, { status: 403 });
    }

    return Response.json({ error: "Failed to manage API key" }, { status: 500 });
  }
});

// ── DELETE: Revoke API key ────────────────────────────────────────────────────

export const DELETE = withAuth(async (request, context, authContext) => {
  const { userId } = authContext;

  try {
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return Response.json({ error: "API key ID is required" }, { status: 400 });
    }

    await revokeApiKey(userId, keyId);

    return Response.json({
      success: true,
      action: "revoke",
      message: "API key revoked. Any services using this key will lose access immediately.",
    });
  } catch (err) {
    console.error("[api-keys] Revoke error:", err.message);
    return Response.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
});
