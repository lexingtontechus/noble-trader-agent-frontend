/**
 * API Route: /api/subscription/webhook
 *
 * Helio webhook handler for subscription events.
 * Verifies the webhook signature and updates user plan in Supabase.
 *
 * Helio webhook events:
 *  - subscription.created  → Set plan to premium/institutional
 *  - subscription.active   → Ensure plan is active
 *  - subscription.cancelled → Downgrade to free at period end
 *  - subscription.expired  → Downgrade to free immediately
 *  - payment.failed        → Mark plan as past_due
 *
 * Security: Verifies Helio webhook signature using HMAC-SHA256
 */

import { setUserPlan } from "@/lib/credentials";

// Helio webhook secret (set in Vercel env vars)
const HELIO_WEBHOOK_SECRET = process.env.HELIO_WEBHOOK_SECRET;

/**
 * Verify Helio webhook signature.
 * Helio signs webhooks with HMAC-SHA256 using the webhook secret.
 */
function verifySignature(payload, signature) {
  if (!HELIO_WEBHOOK_SECRET) {
    console.error("[helio-webhook] HELIO_WEBHOOK_SECRET not configured");
    return false;
  }

  try {
    const crypto = require("crypto");
    const expectedSig = crypto
      .createHmac("sha256", HELIO_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );
  } catch (err) {
    console.error("[helio-webhook] Signature verification failed:", err.message);
    return false;
  }
}

/**
 * Map Helio plan ID to our plan key.
 * These IDs come from the Helio dashboard when creating paylinks.
 */
const HELIO_PLAN_MAP = {
  [process.env.HELIO_PREMIUM_PLAN_ID || "premium"]: "premium",
  [process.env.HELIO_INSTITUTIONAL_PLAN_ID || "institutional"]: "institutional",
};

function resolvePlan(helioPlanId) {
  return HELIO_PLAN_MAP[helioPlanId] || "premium"; // Default to premium if unknown
}

export async function POST(request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-helio-signature") ||
                      request.headers.get("helio-signature") || "";

    // Verify signature (skip in dev for testing)
    if (process.env.NODE_ENV === "production" && !verifySignature(body, signature)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);
    const { type, data } = event;

    // Extract Clerk user ID from Helio metadata
    // When creating the Helio checkout, we pass the Clerk user ID as metadata
    const clerkUserId = data?.metadata?.clerkUserId ||
                       data?.customer?.externalId ||
                       data?.metadata?.userId;

    if (!clerkUserId) {
      console.error("[helio-webhook] No clerkUserId in event metadata");
      return Response.json({ error: "Missing user ID" }, { status: 400 });
    }

    const helioPlanId = data?.planId || data?.paylinkId || "";
    const plan = resolvePlan(helioPlanId);

    switch (type) {
      case "subscription.created":
      case "subscription.active":
        await setUserPlan(clerkUserId, plan, {
          planStatus: "active",
          helioSubscriptionId: data?.subscriptionId || data?.id,
          currentPeriodStart: data?.currentPeriodStart,
          currentPeriodEnd: data?.currentPeriodEnd,
        });
        console.log(`[helio-webhook] Activated ${plan} for user ${clerkUserId}`);
        break;

      case "subscription.cancelled":
        await setUserPlan(clerkUserId, plan, {
          planStatus: "active", // Still active until period ends
          cancelAtPeriodEnd: true,
        });
        console.log(`[helio-webhook] Cancelled ${plan} for user ${clerkUserId} (active until period end)`);
        break;

      case "subscription.expired":
        await setUserPlan(clerkUserId, "free", {
          planStatus: "cancelled",
        });
        console.log(`[helio-webhook] Expired subscription for user ${clerkUserId}, downgraded to free`);
        break;

      case "payment.failed":
        await setUserPlan(clerkUserId, plan, {
          planStatus: "past_due",
        });
        console.log(`[helio-webhook] Payment failed for user ${clerkUserId}, marked as past_due`);
        break;

      default:
        console.log(`[helio-webhook] Unhandled event type: ${type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[helio-webhook] Error processing webhook:", error.message);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// Helio webhooks only use POST
export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
