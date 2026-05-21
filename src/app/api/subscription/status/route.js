/**
 * API Route: /api/subscription/status
 *
 * GET — Get the authenticated user's subscription plan and status.
 * Returns plan details from Supabase (authoritative) with Clerk metadata fallback.
 */

import { withAuth } from "@/lib/withAuth";
import { getUserPlan } from "@/lib/credentials";
import { PLANS } from "@/lib/plans";

export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const plan = await getUserPlan();
    const planDetails = PLANS[plan] || PLANS.free;

    return Response.json({
      plan,
      planDetails: {
        key: planDetails.key,
        name: planDetails.name,
        price: planDetails.price,
        priceLabel: planDetails.priceLabel,
        features: planDetails.features,
        limits: planDetails.limits,
      },
    });
  } catch (error) {
    if (error.message === "Not authenticated") {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}, { minRole: "viewer" });
