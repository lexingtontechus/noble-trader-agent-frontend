/**
 * API Route: /api/onboarding
 *
 * GET    — Get onboarding status
 * POST   — Update onboarding progress
 * PUT    — Complete onboarding
 * PATCH  — Migrate Clerk keys to Supabase (one-time)
 */

import { withAuth } from "@/lib/withAuth";
import {
  getOnboardingStatus,
  updateOnboarding,
  completeOnboarding,
  migrateClerkKeysToSupabase,
  getAllCredentialStatus,
} from "@/lib/credentials";

export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const [status, credStatus] = await Promise.all([
      getOnboardingStatus(),
      getAllCredentialStatus(),
    ]);

    return Response.json({
      ...status,
      paperConfigured: credStatus.paper.configured,
      liveConfigured: credStatus.live.configured,
    });
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "viewer" });

export const POST = withAuth(async (request, _context, _authContext) => {
  try {
    const updates = await request.json();
    const result = await updateOnboarding(updates);
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "viewer" });

export const PUT = withAuth(async (request, _context, _authContext) => {
  try {
    const result = await completeOnboarding();
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "viewer" });

export const PATCH = withAuth(async (request, _context, _authContext) => {
  try {
    const result = await migrateClerkKeysToSupabase();
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "viewer" });
