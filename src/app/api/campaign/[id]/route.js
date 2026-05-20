/**
 * API Route: /api/campaign/[id]
 *
 * GET    — Get campaign details with trades
 * PATCH  — Update campaign (start, pause, resume, stop)
 * DELETE — Delete a campaign (draft only)
 */

import {
  getCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  feedCampaignResults,
} from "@/lib/campaign-engine";
import { createApiError, sanitizeError } from "@/lib/error-messages";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    return Response.json({ campaign });
  } catch (error) {
    if (error.message === "Campaign not found") {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action;

    let result;
    switch (action) {
      case "start":
        result = await startCampaign(id);
        break;
      case "pause":
        result = await pauseCampaign(id);
        break;
      case "resume":
        result = await resumeCampaign(id);
        break;
      case "stop":
        result = await stopCampaign(id);
        // Feed results to strategy evolution
        await feedCampaignResults(id).catch(err =>
          console.error("[campaign] Failed to feed results to evolution:", err.message)
        );
        break;
      default:
        return Response.json(
          { error: `Unknown action: ${action}. Use: start, pause, resume, stop` },
          { status: 400 }
        );
    }

    // Return updated campaign
    const campaign = await getCampaign(id);
    return Response.json({ campaign });
  } catch (error) {
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Only allow deleting draft campaigns
    const { data: campaign } = await client
      .from("trade_campaign")
      .select("status")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (!campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status !== "draft") {
      return Response.json(
        { error: "Only draft campaigns can be deleted. Stop the campaign first." },
        { status: 400 }
      );
    }

    const { error } = await client
      .from("trade_campaign")
      .delete()
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) throw new Error(`Failed to delete campaign: ${error.message}`);

    return Response.json({ success: true });
  } catch (error) {
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}
