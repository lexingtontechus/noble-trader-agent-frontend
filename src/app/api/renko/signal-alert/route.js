/**
 * BFF Route: /api/renko/signal-alert
 * Called when a new Renko signal is detected.
 *
 * POST /api/renko/signal-alert  { symbol, signal, pipelineState }
 */

import { sendAlert, ALERT_TYPES } from "@/lib/alerting";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol, signal, pipelineState } = body;

    if (!symbol) {
      return Response.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    if (!signal) {
      return Response.json(
        { error: "Signal data is required" },
        { status: 400 }
      );
    }

    const results = [];

    // Send SIGNAL alert
    try {
      const direction = signal.direction || signal.pattern_type || "—";
      const pattern = signal.pattern || signal.pattern_type || "unknown";
      const confidence = typeof signal.confidence === "number"
        ? `${(signal.confidence * 100).toFixed(1)}%`
        : "N/A";
      const price = typeof signal.price === "number"
        ? `$${signal.price.toFixed(2)}`
        : "N/A";

      const signalRecord = await sendAlert({
        type: ALERT_TYPES.SIGNAL,
        symbol,
        message: `${symbol} signal: ${direction} ${pattern} at ${price} (conf: ${confidence})`,
        severity: "info",
        data: {
          direction,
          pattern,
          confidence: signal.confidence,
          price: signal.price,
          velocity: signal.velocity,
          brick_count: signal.brick_count,
          timestamp: signal.timestamp,
        },
      });

      results.push({ type: "SIGNAL", id: signalRecord.id });
    } catch (sigErr) {
      console.error("[signal-alert] Failed to send SIGNAL alert:", sigErr.message);
      results.push({ type: "SIGNAL", error: sigErr.message });
    }

    // If signal has a trade attached, also send a TRADE alert
    const hasTrade = signal.trade || signal.executed_trade || signal.has_trade;
    if (hasTrade) {
      try {
        const trade = signal.trade || signal.executed_trade || {};
        const tradeDirection = trade.direction || trade.side || direction || "—";
        const entryPrice = typeof (trade.entry_price || trade.price) === "number"
          ? `$${(trade.entry_price || trade.price).toFixed(2)}`
          : "N/A";

        const tradeRecord = await sendAlert({
          type: ALERT_TYPES.TRADE,
          symbol,
          message: `${symbol} trade executed: ${tradeDirection} at ${entryPrice}`,
          severity: "success",
          data: {
            direction: tradeDirection,
            entry_price: trade.entry_price || trade.price,
            sl_bricks: trade.sl_bricks,
            tp_bricks: trade.tp_bricks,
            pnl_bricks: trade.pnl_bricks,
            pnl_dollars: trade.pnl_dollars,
          },
        });

        results.push({ type: "TRADE", id: tradeRecord.id });
      } catch (tradeErr) {
        console.error("[signal-alert] Failed to send TRADE alert:", tradeErr.message);
        results.push({ type: "TRADE", error: tradeErr.message });
      }
    }

    // Check for risk conditions in pipeline state
    if (pipelineState) {
      try {
        const sessionPnl = pipelineState.session_pnl_bricks ?? 0;
        const consecutiveLosses = pipelineState.consecutive_losses ?? 0;

        // Risk alert: large daily loss
        if (sessionPnl <= -5) {
          await sendAlert({
            type: ALERT_TYPES.RISK,
            symbol,
            message: `${symbol} daily loss limit: ${sessionPnl} bricks`,
            severity: "error",
            data: { session_pnl_bricks: sessionPnl },
          });
          results.push({ type: "RISK", reason: "daily_loss" });
        }

        // Risk alert: consecutive losses
        if (consecutiveLosses >= 3) {
          await sendAlert({
            type: ALERT_TYPES.RISK,
            symbol,
            message: `${symbol} consecutive losses: ${consecutiveLosses}`,
            severity: "warning",
            data: { consecutive_losses: consecutiveLosses },
          });
          results.push({ type: "RISK", reason: "consecutive_losses" });
        }
      } catch (riskErr) {
        console.error("[signal-alert] Risk check failed:", riskErr.message);
      }
    }

    return Response.json({
      success: true,
      results,
    });
  } catch (err) {
    console.error("[signal-alert] Error:", err);
    return Response.json(
      { error: `Signal alert failed: ${err.message}` },
      { status: 500 }
    );
  }
}, { minRole: "trader" });
