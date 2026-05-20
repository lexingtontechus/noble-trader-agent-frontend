/**
 * Campaign Engine — Server-side batch trade orchestration.
 *
 * Orchestrates a sequential batch of trades with aggregate risk guards:
 *   - Max consecutive losses (auto-stop)
 *   - Max drawdown percentage (auto-stop)
 *   - Trade count limit
 *
 * Lifecycle: draft → running → completed / stopped_* / error
 *
 * Tick-driven: pg_cron calls /api/campaign/tick every 60s during market hours.
 * Each tick: check current trade → update stats → place next trade or stop.
 *
 * All functions are SERVER-SIDE ONLY (API routes).
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { createOrder, getOrders } from "@/lib/alpaca-client";
import { getCredentials } from "@/lib/credentials";
import { getAlpacaKeys } from "@/lib/clerk-metadata";

// ── Supabase service client ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase not configured for campaign engine");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Key resolution: Supabase → Clerk → env ────────────────────────────────────
const ALPACA_API_KEY = process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_PAPER_SECRET_KEY || process.env.ALPACA_SECRET_KEY;

async function resolveAlpacaKeys(clerkUserId) {
  // 1. Try Supabase encrypted credentials
  try {
    const creds = await getCredentials("paper");
    if (creds?.apiKey && creds?.secretKey) return creds;
  } catch {
    // Supabase unavailable
  }

  // 2. Try Clerk privateMetadata
  if (clerkUserId) {
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(clerkUserId);
      const meta = user?.privateMetadata || {};
      if (meta.alpaca_api_key && meta.alpaca_secret_key) {
        return { apiKey: meta.alpaca_api_key, secretKey: meta.alpaca_secret_key };
      }
    } catch {
      // Clerk unavailable
    }
  }

  // 3. Fallback to env vars (for cron / server-to-server)
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    return { apiKey: ALPACA_API_KEY, secretKey: ALPACA_SECRET_KEY };
  }

  return null;
}

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a new campaign in draft status.
 */
export async function createCampaign(params) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  const campaign = {
    clerk_user_id: userId,
    status: "draft",
    max_trades: params.maxTrades || 10,
    max_consecutive_losses: params.maxConsecutiveLosses || 3,
    max_drawdown_pct: params.maxDrawdownPct || 0.05,
    kelly_fraction: params.kellyFraction || 0.5,
    position_sizing_mode: params.positionSizingMode || "kelly",
    fixed_qty: params.fixedQty || null,
    analysis_id: params.analysisId || null,
    signal_source: params.signalSource || "renko",
  };

  const { data, error } = await client
    .from("trade_campaign")
    .insert(campaign)
    .select()
    .single();

  if (error) throw new Error(`Failed to create campaign: ${error.message}`);

  // If trades are provided, insert them too
  if (params.trades?.length > 0) {
    const tradeRows = params.trades.map((trade, i) => ({
      campaign_id: data.id,
      trade_index: i + 1,
      symbol: trade.symbol,
      side: trade.side || "buy",
      qty: trade.qty || 1,
      order_type: trade.orderType || "bracket",
      limit_price: trade.limitPrice || null,
      stop_loss_price: trade.stopLoss || null,
      take_profit_price: trade.takeProfit || null,
      signal_direction: trade.signalDirection || null,
      confidence: trade.confidence || null,
      regime: trade.regime || null,
      kelly_fraction_used: trade.kellyFraction || campaign.kelly_fraction,
      status: "pending",
    }));

    const { error: tradesErr } = await client
      .from("campaign_trades")
      .insert(tradeRows);

    if (tradesErr) {
      console.error("[campaign] Failed to insert trades:", tradesErr.message);
      // Clean up the campaign
      await client.from("trade_campaign").delete().eq("id", data.id);
      throw new Error(`Failed to create campaign trades: ${tradesErr.message}`);
    }
  }

  return data;
}

/**
 * Start a campaign: set status to running, place first trade.
 */
export async function startCampaign(campaignId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  // Fetch campaign
  const { data: campaign, error } = await client
    .from("trade_campaign")
    .select("*")
    .eq("id", campaignId)
    .eq("clerk_user_id", userId)
    .single();

  if (error || !campaign) throw new Error("Campaign not found");
  if (campaign.status !== "draft" && campaign.status !== "paused") {
    throw new Error(`Cannot start campaign in ${campaign.status} status`);
  }

  // Update status
  const { error: updateErr } = await client
    .from("trade_campaign")
    .update({
      status: "running",
      started_at: campaign.started_at || new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (updateErr) throw new Error(`Failed to start campaign: ${updateErr.message}`);

  // Place the first trade
  await placeNextTrade(campaignId, userId);

  return { success: true, campaignId };
}

/**
 * Pause a running campaign.
 */
export async function pauseCampaign(campaignId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  const { error } = await client
    .from("trade_campaign")
    .update({ status: "paused" })
    .eq("id", campaignId)
    .eq("clerk_user_id", userId)
    .eq("status", "running");

  if (error) throw new Error(`Failed to pause campaign: ${error.message}`);
  return { success: true };
}

/**
 * Resume a paused campaign.
 */
export async function resumeCampaign(campaignId) {
  return startCampaign(campaignId);
}

/**
 * Stop a campaign manually.
 */
export async function stopCampaign(campaignId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  const { error } = await client
    .from("trade_campaign")
    .update({
      status: "stopped_manual",
      stopped_reason: "Stopped by user",
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("clerk_user_id", userId)
    .in("status", ["running", "paused", "draft"]);

  if (error) throw new Error(`Failed to stop campaign: ${error.message}`);
  return { success: true };
}

/**
 * Get campaign details with trades.
 */
export async function getCampaign(campaignId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  const { data: campaign, error } = await client
    .from("trade_campaign")
    .select("*")
    .eq("id", campaignId)
    .eq("clerk_user_id", userId)
    .single();

  if (error || !campaign) throw new Error("Campaign not found");

  const { data: trades } = await client
    .from("campaign_trades")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("trade_index", { ascending: true });

  return { ...campaign, trades: trades || [] };
}

/**
 * List campaigns for the authenticated user.
 */
export async function listCampaigns({ status, limit = 20 } = {}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  let query = client
    .from("trade_campaign")
    .select("id, status, max_trades, trades_placed, trades_filled, wins, losses, consecutive_losses, realized_pnl, max_drawdown, started_at, completed_at, stopped_reason, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list campaigns: ${error.message}`);
  return data || [];
}

// ── Campaign Tick (called by pg_cron via /api/campaign/tick) ──────────────────

/**
 * Process all running campaigns — check fills, update stats, place next trades.
 * This is the main orchestrator loop, called every 60s during market hours.
 *
 * @param {string} [cronSecret] — If provided, processes ALL users' campaigns (cron mode)
 * @returns {Promise<{processed: number, actions: string[]}>}
 */
export async function tickCampaigns(cronSecret) {
  const client = getServiceClient();
  const actions = [];

  // Fetch all running campaigns
  const { data: campaigns, error } = await client
    .from("trade_campaign")
    .select("id, clerk_user_id, status, trades_placed, trades_filled, wins, losses, consecutive_losses, realized_pnl, peak_pnl, max_drawdown, max_trades, max_consecutive_losses, max_drawdown_pct, current_trade_id")
    .eq("status", "running");

  if (error) {
    console.error("[campaign/tick] Failed to fetch campaigns:", error.message);
    return { processed: 0, actions: ["error: " + error.message] };
  }

  if (!campaigns?.length) {
    return { processed: 0, actions: ["no running campaigns"] };
  }

  for (const campaign of campaigns) {
    try {
      const action = await processCampaignTick(campaign, client);
      actions.push(`campaign ${campaign.id.slice(0, 8)}: ${action}`);
    } catch (err) {
      console.error(`[campaign/tick] Error processing campaign ${campaign.id}:`, err.message);
      actions.push(`campaign ${campaign.id.slice(0, 8)}: error - ${err.message}`);

      // Mark campaign as error if it fails repeatedly
      await client
        .from("trade_campaign")
        .update({
          status: "error",
          stopped_reason: `Orchestration error: ${err.message.slice(0, 200)}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);
    }
  }

  return { processed: campaigns.length, actions };
}

/**
 * Process a single campaign tick.
 * 1. If there's a current trade, check its status (filled? SL/TP hit?)
 * 2. Update campaign stats based on outcome
 * 3. Check stop conditions (consecutive losses, max drawdown)
 * 4. If OK, place next trade
 */
async function processCampaignTick(campaign, client) {
  // ── Step 1: Check current trade status ────────────────────────────────
  if (campaign.current_trade_id) {
    const outcome = await checkTradeOutcome(campaign, client);

    if (outcome === "pending") {
      return "waiting for current trade to close";
    }

    // Trade has closed — update stats
    const tradeClosed = outcome !== null;

    if (tradeClosed) {
      const { isWin, pnl } = outcome;
      const newWins = campaign.wins + (isWin ? 1 : 0);
      const newLosses = campaign.losses + (isWin ? 0 : 1);
      const newConsecutiveLosses = isWin ? 0 : campaign.consecutive_losses + 1;
      const newPnl = (campaign.realized_pnl || 0) + (pnl || 0);
      const newPeakPnl = Math.max(campaign.peak_pnl || 0, newPnl);
      const newDrawdown = newPeakPnl - newPnl;
      const newMaxDrawdown = Math.max(campaign.max_drawdown || 0, newDrawdown);
      const newTradesFilled = campaign.trades_filled + 1;

      // ── Step 2: Check stop conditions ────────────────────────────────
      // Stop condition 1: Max consecutive losses
      if (newConsecutiveLosses >= campaign.max_consecutive_losses) {
        await client
          .from("trade_campaign")
          .update({
            trades_filled: newTradesFilled,
            wins: newWins,
            losses: newLosses,
            consecutive_losses: newConsecutiveLosses,
            realized_pnl: newPnl,
            peak_pnl: newPeakPnl,
            max_drawdown: newMaxDrawdown,
            current_trade_id: null,
            status: "stopped_loss_streak",
            stopped_reason: `${newConsecutiveLosses} consecutive losses (limit: ${campaign.max_consecutive_losses})`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        return `STOPPED: ${newConsecutiveLosses} consecutive losses`;
      }

      // Stop condition 2: Max drawdown exceeded
      // Calculate DD as % of equity (approximate — uses peak P&L as proxy)
      const drawdownPct = newPeakPnl > 0 ? newDrawdown / newPeakPnl : 0;
      if (drawdownPct > campaign.max_drawdown_pct && newTradesFilled >= 2) {
        await client
          .from("trade_campaign")
          .update({
            trades_filled: newTradesFilled,
            wins: newWins,
            losses: newLosses,
            consecutive_losses: newConsecutiveLosses,
            realized_pnl: newPnl,
            peak_pnl: newPeakPnl,
            max_drawdown: newMaxDrawdown,
            current_trade_id: null,
            status: "stopped_max_drawdown",
            stopped_reason: `Max drawdown ${(drawdownPct * 100).toFixed(1)}% exceeded limit ${(campaign.max_drawdown_pct * 100).toFixed(1)}%`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        return `STOPPED: drawdown ${(drawdownPct * 100).toFixed(1)}% exceeded ${campaign.max_drawdown_pct * 100}%`;
      }

      // Stop condition 3: All trades completed
      if (newTradesFilled >= campaign.max_trades) {
        await client
          .from("trade_campaign")
          .update({
            trades_filled: newTradesFilled,
            wins: newWins,
            losses: newLosses,
            consecutive_losses: newConsecutiveLosses,
            realized_pnl: newPnl,
            peak_pnl: newPeakPnl,
            max_drawdown: newMaxDrawdown,
            current_trade_id: null,
            status: "completed",
            stopped_reason: `All ${campaign.max_trades} trades completed`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        return `COMPLETED: ${newTradesFilled} trades done (${newWins}W/${newLosses}L)`;
      }

      // Update stats but keep running
      await client
        .from("trade_campaign")
        .update({
          trades_filled: newTradesFilled,
          wins: newWins,
          losses: newLosses,
          consecutive_losses: newConsecutiveLosses,
          realized_pnl: newPnl,
          peak_pnl: newPeakPnl,
          max_drawdown: newMaxDrawdown,
          current_trade_id: null,
        })
        .eq("id", campaign.id);

      // Update campaign object for placeNextTrade
      campaign.trades_filled = newTradesFilled;
      campaign.wins = newWins;
      campaign.losses = newLosses;
      campaign.consecutive_losses = newConsecutiveLosses;
      campaign.current_trade_id = null;
    }
  }

  // ── Step 3: Place next trade ──────────────────────────────────────────
  const tradesPlaced = campaign.trades_placed || 0;
  if (tradesPlaced < campaign.max_trades) {
    await placeNextTrade(campaign.id, campaign.clerk_user_id, client);
    return `placed trade ${tradesPlaced + 1}/${campaign.max_trades}`;
  }

  return "no action needed";
}

/**
 * Check if the current trade has closed.
 * Returns null if still open, { isWin, pnl } if closed.
 */
async function checkTradeOutcome(campaign, client) {
  // Fetch the current trade
  const { data: trade, error } = await client
    .from("campaign_trades")
    .select("*")
    .eq("id", campaign.current_trade_id)
    .single();

  if (error || !trade) {
    console.warn(`[campaign] Current trade ${campaign.current_trade_id} not found`);
    return null; // treat as pending — will be resolved
  }

  // If trade is already in a terminal state, use stored results
  if (["stopped_out", "taken_profit", "filled"].includes(trade.status) && trade.exit_price) {
    const pnl = calculatePnl(trade);
    return { isWin: pnl > 0, pnl };
  }

  // If trade hasn't been submitted yet, skip
  if (trade.status === "pending") {
    return "pending";
  }

  // Check Alpaca for order status
  const keys = await resolveAlpacaKeys(campaign.clerk_user_id);
  if (!keys) return "pending"; // can't check without keys

  try {
    const alpacaOrders = await getOrders(keys.apiKey, keys.secretKey, { status: "all" });
    const alpacaOrder = alpacaOrders.find(o => o.id === trade.alpaca_order_id);

    if (!alpacaOrder) {
      // Order not found on Alpaca — might have been replaced or expired
      await client
        .from("campaign_trades")
        .update({ status: "error" })
        .eq("id", trade.id);
      return { isWin: false, pnl: 0 };
    }

    // Check if the main order and its SL/TP legs are done
    if (alpacaOrder.status === "filled") {
      // Main order filled — check if SL or TP was hit
      // For bracket orders, Alpaca creates legs — check those
      const fillPrice = parseFloat(alpacaOrder.filled_avg_price || alpacaOrder.limit_price || 0);

      // Look for the exit order (SL or TP leg)
      const exitOrder = alpacaOrders.find(o =>
        o.client_order_id?.startsWith(trade.alpaca_order_id) ||
        (o.parent_order_id === trade.alpaca_order_id)
      );

      if (exitOrder && ["filled", "partially_filled"].includes(exitOrder.status)) {
        const exitPrice = parseFloat(exitOrder.filled_avg_price || exitOrder.limit_price || 0);
        const isStop = exitOrder.type === "stop" || exitOrder.side !== trade.side;
        const pnl = calculatePnlFromPrices(trade, fillPrice, exitPrice);

        // Update trade record
        await client
          .from("campaign_trades")
          .update({
            status: isStop ? "stopped_out" : "taken_profit",
            fill_price: fillPrice,
            fill_qty: parseInt(alpacaOrder.filled_qty || alpacaOrder.qty || 0),
            exit_price: exitPrice,
            realized_pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq("id", trade.id);

        return { isWin: pnl > 0, pnl };
      }

      // Main order filled but no exit yet — still in position
      if (!trade.fill_price) {
        await client
          .from("campaign_trades")
          .update({
            status: "filled",
            fill_price: fillPrice,
            fill_qty: parseInt(alpacaOrder.filled_qty || alpacaOrder.qty || 0),
            filled_at: new Date().toISOString(),
          })
          .eq("id", trade.id);
      }

      return "pending"; // position still open
    }

    if (alpacaOrder.status === "canceled" || alpacaOrder.status === "rejected") {
      await client
        .from("campaign_trades")
        .update({
          status: alpacaOrder.status === "canceled" ? "cancelled" : "rejected",
          closed_at: new Date().toISOString(),
        })
        .eq("id", trade.id);

      // Cancelled/rejected trade — don't count as win or loss
      return { isWin: false, pnl: 0 };
    }

    // Order still pending/new/partially_filled
    return "pending";
  } catch (err) {
    console.error(`[campaign] Error checking trade outcome:`, err.message);
    return "pending";
  }
}

/**
 * Place the next trade in the campaign.
 */
async function placeNextTrade(campaignId, clerkUserId, client) {
  if (!client) {
    const { userId } = await auth();
    clerkUserId = clerkUserId || userId;
    client = getServiceClient();
  }

  // Fetch campaign
  const { data: campaign } = await client
    .from("trade_campaign")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!campaign || campaign.status !== "running") return;

  // Find the next pending trade
  const { data: nextTrade } = await client
    .from("campaign_trades")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("trade_index", { ascending: true })
    .limit(1)
    .single();

  if (!nextTrade) {
    // No more pending trades — mark campaign completed
    await client
      .from("trade_campaign")
      .update({
        status: "completed",
        stopped_reason: "All pending trades placed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return;
  }

  // Resolve Alpaca keys
  const keys = await resolveAlpacaKeys(clerkUserId);
  if (!keys) {
    await client
      .from("trade_campaign")
      .update({
        status: "error",
        stopped_reason: "Alpaca API keys not configured",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return;
  }

  // Build the order payload
  const orderPayload = buildOrderPayload(nextTrade);

  try {
    const alpacaOrder = await createOrder(keys.apiKey, keys.secretKey, orderPayload);

    // Update trade with Alpaca order ID
    await client
      .from("campaign_trades")
      .update({
        status: "submitted",
        alpaca_order_id: alpacaOrder.id,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", nextTrade.id);

    // Update campaign: increment trades_placed, set current_trade_id
    await client
      .from("trade_campaign")
      .update({
        trades_placed: (campaign.trades_placed || 0) + 1,
        current_trade_id: nextTrade.id,
      })
      .eq("id", campaignId);

    console.info(`[campaign] Placed trade ${nextTrade.trade_index}/${campaign.max_trades}: ${nextTrade.side} ${nextTrade.qty} ${nextTrade.symbol}`);
  } catch (err) {
    console.error(`[campaign] Failed to place trade:`, err.message);

    // Mark trade as error
    await client
      .from("campaign_trades")
      .update({ status: "error" })
      .eq("id", nextTrade.id);

    // Don't stop the campaign — next tick will try the next trade
    // But increment trades_placed so we don't get stuck
    await client
      .from("trade_campaign")
      .update({
        trades_placed: (campaign.trades_placed || 0) + 1,
      })
      .eq("id", campaignId);
  }
}

/**
 * Build an Alpaca order payload from a campaign trade.
 * For bracket orders: main order + SL + TP legs.
 */
function buildOrderPayload(trade) {
  const base = {
    symbol: trade.symbol,
    qty: String(trade.qty),
    side: trade.side,
    type: "market",
    time_in_force: "day",
  };

  // Bracket order with SL and TP
  if (trade.order_type === "bracket" && trade.stop_loss_price && trade.take_profit_price) {
    return {
      ...base,
      type: "market",
      order_class: "bracket",
      stop_loss: {
        stop_price: String(trade.stop_loss_price),
      },
      take_profit: {
        limit_price: String(trade.take_profit_price),
      },
    };
  }

  // Limit order
  if (trade.order_type === "limit" && trade.limit_price) {
    return { ...base, type: "limit", limit_price: String(trade.limit_price) };
  }

  // Market order (default)
  return base;
}

/**
 * Calculate P&L from a closed trade record.
 */
function calculatePnl(trade) {
  if (!trade.exit_price || !trade.fill_price) return 0;
  return calculatePnlFromPrices(trade, trade.fill_price, trade.exit_price);
}

/**
 * Calculate P&L from fill and exit prices.
 */
function calculatePnlFromPrices(trade, fillPrice, exitPrice) {
  const qty = trade.qty || 1;
  const direction = trade.side === "buy" ? 1 : -1;
  const grossPnl = direction * (exitPrice - fillPrice) * qty;
  const commission = (trade.commission || 0) * 2; // round-trip
  return parseFloat((grossPnl - commission).toFixed(2));
}

// ── Campaign Results → Strategy Evolution ────────────────────────────────────

/**
 * Feed campaign results to strategy evolution for feedback.
 * Called when a campaign completes or stops.
 */
export async function feedCampaignResults(campaignId) {
  const client = getServiceClient();

  const { data: campaign } = await client
    .from("trade_campaign")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!campaign) return;

  const { data: trades } = await client
    .from("campaign_trades")
    .select("*")
    .eq("campaign_id", campaignId)
    .in("status", ["stopped_out", "taken_profit", "filled"]);

  const filledTrades = (trades || []).filter(t => t.exit_price);
  const totalPnl = filledTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  const winCount = filledTrades.filter(t => (t.realized_pnl || 0) > 0).length;
  const lossCount = filledTrades.filter(t => (t.realized_pnl || 0) <= 0).length;
  const totalTrades = winCount + lossCount;
  const winRate = totalTrades > 0 ? winCount / totalTrades : 0;

  // Build feedback payload for strategy evolution
  const feedback = {
    variantId: campaign.analysis_id,
    source: "campaign",
    campaignId: campaign.id,
    totalTrades,
    wins: winCount,
    losses: lossCount,
    winRate,
    totalPnl,
    maxDrawdown: campaign.max_drawdown,
    kellyFraction: campaign.kelly_fraction,
    signalSource: campaign.signal_source,
    completedAt: campaign.completed_at,
  };

  // Post to evolution feedback endpoint
  try {
    const evolutionUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/evolution/feedback`;
    await fetch(evolutionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback),
    });
    console.info(`[campaign] Fed results to evolution: ${totalTrades} trades, ${(winRate * 100).toFixed(1)}% win rate, $${totalPnl.toFixed(2)} P&L`);
  } catch (err) {
    console.error("[campaign] Failed to feed results to evolution:", err.message);
  }

  return feedback;
}

// ── Stats & Analytics ────────────────────────────────────────────────────────

/**
 * Get aggregate campaign stats for the authenticated user.
 */
export async function getCampaignStats() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const client = getServiceClient();

  const { data: campaigns } = await client
    .from("trade_campaign")
    .select("status, trades_placed, trades_filled, wins, losses, realized_pnl, max_drawdown")
    .eq("clerk_user_id", userId)
    .in("status", ["completed", "stopped_loss_streak", "stopped_max_drawdown", "stopped_manual"]);

  if (!campaigns?.length) {
    return {
      totalCampaigns: 0,
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      overallWinRate: 0,
      totalPnl: 0,
      avgMaxDrawdown: 0,
    };
  }

  const totalTrades = campaigns.reduce((s, c) => s + (c.trades_filled || 0), 0);
  const totalWins = campaigns.reduce((s, c) => s + (c.wins || 0), 0);
  const totalLosses = campaigns.reduce((s, c) => s + (c.losses || 0), 0);
  const totalPnl = campaigns.reduce((s, c) => s + (c.realized_pnl || 0), 0);
  const avgMaxDrawdown = campaigns.reduce((s, c) => s + (c.max_drawdown || 0), 0) / campaigns.length;

  return {
    totalCampaigns: campaigns.length,
    totalTrades,
    totalWins,
    totalLosses,
    overallWinRate: totalTrades > 0 ? totalWins / totalTrades : 0,
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    avgMaxDrawdown: parseFloat(avgMaxDrawdown.toFixed(2)),
  };
}
