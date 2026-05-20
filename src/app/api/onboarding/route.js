/**
 * API Route: /api/onboarding
 *
 * GET    — Get onboarding status
 * POST   — Update onboarding progress
 * PUT    — Complete onboarding
 * PATCH  — Migrate Clerk keys to Supabase (one-time)
 */

import {
  getOnboardingStatus,
  updateOnboarding,
  completeOnboarding,
  migrateClerkKeysToSupabase,
  getAllCredentialStatus,
} from "@/lib/credentials";

export async function GET() {
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
}

export async function POST(request) {
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
}

export async function PUT() {
  try {
    const result = await completeOnboarding();
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const result = await migrateClerkKeysToSupabase();
    return Response.json(result);
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}
