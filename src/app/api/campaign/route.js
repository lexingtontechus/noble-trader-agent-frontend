/**
 * API Route: /api/campaign
 *
 * GET  — List campaigns for authenticated user
 * POST — Create a new campaign (draft)
 */

import {
  listCampaigns,
  createCampaign,
} from "@/lib/campaign-engine";
import { createApiError, sanitizeError } from "@/lib/error-messages";
import { withAuth } from "@/lib/withAuth";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = parseInt(searchParams.get("limit") || "20");

    const campaigns = await listCampaigns({ status, limit });
    return Response.json({ campaigns });
  } catch (error) {
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}, { minRole: "viewer" });

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.trades?.length) {
      return Response.json(
        { error: "At least one trade is required to create a campaign" },
        { status: 400 }
      );
    }

    // Validate trade entries
    for (const trade of body.trades) {
      if (!trade.symbol) {
        return Response.json(
          { error: `Trade ${body.trades.indexOf(trade) + 1} is missing a symbol` },
          { status: 400 }
        );
      }
    }

    // Validate batch params
    const maxTrades = body.maxTrades || 10;
    const maxConsecutiveLosses = body.maxConsecutiveLosses || 3;
    const maxDrawdownPct = body.maxDrawdownPct || 0.05;

    if (maxTrades < 1 || maxTrades > 50) {
      return Response.json(
        { error: "Max trades must be between 1 and 50" },
        { status: 400 }
      );
    }
    if (maxConsecutiveLosses < 1 || maxConsecutiveLosses > 10) {
      return Response.json(
        { error: "Max consecutive losses must be between 1 and 10" },
        { status: 400 }
      );
    }
    if (maxDrawdownPct < 0.01 || maxDrawdownPct > 0.5) {
      return Response.json(
        { error: "Max drawdown must be between 1% and 50%" },
        { status: 400 }
      );
    }

    const campaign = await createCampaign({
      maxTrades,
      maxConsecutiveLosses,
      maxDrawdownPct,
      kellyFraction: body.kellyFraction || 0.5,
      positionSizingMode: body.positionSizingMode || "kelly",
      fixedQty: body.fixedQty || null,
      analysisId: body.analysisId || null,
      signalSource: body.signalSource || "renko",
      trades: body.trades,
    });

    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    const { message, code, status } = sanitizeError(error, { context: "campaign" });
    return Response.json({ error: message, code }, { status });
  }
}, { minRole: "trader" });
