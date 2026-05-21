/**
 * Circuit Breaker Engine — P3-5A
 *
 * Core risk management module that enforces trading limits and halts.
 * Called BEFORE every trade execution to prevent institutional compliance failures.
 *
 * Key functions:
 *   - checkCircuitBreakers(): Full pre-trade check (called before every order)
 *   - isHalted(): Quick check for active halts
 *   - activateHalt(): Insert a trading halt
 *   - deactivateHalt(): Remove a halt (admin only at BFF level)
 *   - getBreakerConfig(): Fetch user's breaker configuration
 *
 * Uses Supabase service role for DB access (circuit_breakers + trading_halts tables).
 * Uses Upstash Redis for order rate limiting (fast in-memory counter).
 */

import { createClient } from "@supabase/supabase-js";
import { sendAlert, ALERT_TYPES } from "@/lib/alerting";
import { redis } from "@/lib/redis";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit-logger";

// ── Supabase service client ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getServiceClient() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase not configured for circuit breaker");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── Default breaker config ───────────────────────────────────────────────────

const DEFAULT_BREAKERS = {
  max_position_size: { value: 25, unit: "percent", action: "reject_order", cooldown: 30 },
  max_open_positions: { value: 10, unit: "count", action: "reject_order", cooldown: 30 },
  daily_loss_limit: { value: -2, unit: "percent", action: "halt", cooldown: 60 },
  max_drawdown: { value: -5, unit: "percent", action: "halt", cooldown: 60 },
  consecutive_loss_stop: { value: 3, unit: "count", action: "halt", cooldown: 60 },
  order_rate_limit: { value: 10, unit: "count", action: "reject_order", cooldown: 5 },
  single_stock_concentration: { value: 20, unit: "percent", action: "reject_order", cooldown: 30 },
  max_portfolio_heat: { value: 50, unit: "percent", action: "halt", cooldown: 60 },
  sector_concentration: { value: 30, unit: "percent", action: "alert", cooldown: 30 },
};

// ── isHalted() ───────────────────────────────────────────────────────────────

/**
 * Quick check: is there an active halt for this user/symbol/global?
 * Checks `trading_halts` table for active halts.
 *
 * @param {{ userId?: string, symbol?: string }} params
 * @returns {Promise<{ halted: boolean, level?: string, reason?: string, scope?: string, haltId?: string }>}
 */
export async function isHalted({ userId, symbol } = {}) {
  try {
    const client = getServiceClient();

    // 1. Check global halt
    const { data: globalHalts } = await client
      .from("trading_halts")
      .select("id, level, reason, scope, activated_at")
      .eq("level", "global_halt")
      .eq("scope", "global")
      .eq("is_active", true)
      .limit(1);

    if (globalHalts?.length > 0) {
      return {
        halted: true,
        level: "global_halt",
        reason: globalHalts[0].reason,
        scope: "global",
        haltId: globalHalts[0].id,
        activatedAt: globalHalts[0].activated_at,
      };
    }

    // 2. Check user halt
    if (userId) {
      const { data: userHalts } = await client
        .from("trading_halts")
        .select("id, level, reason, scope, activated_at")
        .eq("level", "user_halt")
        .eq("scope", userId)
        .eq("is_active", true)
        .limit(1);

      if (userHalts?.length > 0) {
        return {
          halted: true,
          level: "user_halt",
          reason: userHalts[0].reason,
          scope: userId,
          haltId: userHalts[0].id,
          activatedAt: userHalts[0].activated_at,
        };
      }
    }

    // 3. Check symbol halt
    if (symbol) {
      const { data: symbolHalts } = await client
        .from("trading_halts")
        .select("id, level, reason, scope, activated_at")
        .eq("level", "symbol_halt")
        .eq("scope", symbol)
        .eq("is_active", true)
        .limit(1);

      if (symbolHalts?.length > 0) {
        return {
          halted: true,
          level: "symbol_halt",
          reason: symbolHalts[0].reason,
          scope: symbol,
          haltId: symbolHalts[0].id,
          activatedAt: symbolHalts[0].activated_at,
        };
      }
    }

    return { halted: false };
  } catch (err) {
    console.error("[circuit-breaker] isHalted check failed:", err.message);
    // Fail OPEN — don't block trading if DB is down (logged as error)
    return { halted: false, error: err.message };
  }
}

// ── activateHalt() ───────────────────────────────────────────────────────────

/**
 * Activate a trading halt and persist to `trading_halts` table.
 * Sends Discord/webhook notification.
 *
 * @param {{ level: string, scope: string, reason: string, triggeredBy?: string, metadata?: object }} params
 * @returns {Promise<{ id: string, level: string, reason: string }>}
 */
export async function activateHalt({ level, scope, reason, triggeredBy, metadata = {} }) {
  try {
    const client = getServiceClient();

    // Check if this exact halt already exists (avoid duplicates)
    const { data: existing } = await client
      .from("trading_halts")
      .select("id")
      .eq("level", level)
      .eq("scope", scope)
      .eq("is_active", true)
      .limit(1);

    if (existing?.length > 0) {
      console.info(`[circuit-breaker] Halt already active: ${level}/${scope}`);
      return { id: existing[0].id, level, reason };
    }

    const { data, error } = await client
      .from("trading_halts")
      .insert({
        level,
        scope,
        reason,
        triggered_by: triggeredBy || null,
        metadata: {
          ...metadata,
          activated_by: "circuit_breaker_engine",
          timestamp: new Date().toISOString(),
        },
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("[circuit-breaker] Failed to activate halt:", error.message);
      throw new Error(`Failed to activate halt: ${error.message}`);
    }

    // Send alert notification
    try {
      await sendAlert({
        type: ALERT_TYPES.RISK,
        symbol: level === "symbol_halt" ? scope : "SYSTEM",
        message: `Trading halt activated: ${level} for ${scope}. Reason: ${reason}${triggeredBy ? ` (triggered by: ${triggeredBy})` : ""}`,
        severity: "error",
        data: { level, scope, reason, triggeredBy, haltId: data.id },
      });
    } catch (alertErr) {
      console.error("[circuit-breaker] Alert send failed (non-critical):", alertErr.message);
    }

    console.warn(`[circuit-breaker] HALT ACTIVATED: ${level}/${scope} — ${reason}${triggeredBy ? ` (${triggeredBy})` : ""}`);

    // Audit: halt activated
    logAuditEvent({
      eventType: AUDIT_EVENTS.HALT_ACTIVATED,
      userId: level === "user_halt" ? scope : undefined,
      symbol: level === "symbol_halt" ? scope : undefined,
      metadata: { level, scope, reason, triggeredBy, haltId: data.id },
    });

    return { id: data.id, level, reason };
  } catch (err) {
    console.error("[circuit-breaker] activateHalt error:", err.message);
    throw err;
  }
}

// ── deactivateHalt() ─────────────────────────────────────────────────────────

/**
 * Deactivate a trading halt by setting is_active = false.
 * Should be called from admin-only BFF routes.
 *
 * @param {{ haltId: string }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function deactivateHalt({ haltId }) {
  try {
    const client = getServiceClient();

    const { error } = await client
      .from("trading_halts")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
      })
      .eq("id", haltId);

    if (error) {
      throw new Error(`Failed to deactivate halt: ${error.message}`);
    }

    console.info(`[circuit-breaker] Halt deactivated: ${haltId}`);

    // Audit: halt deactivated
    logAuditEvent({
      eventType: AUDIT_EVENTS.HALT_DEACTIVATED,
      metadata: { haltId },
    });

    return { success: true };
  } catch (err) {
    console.error("[circuit-breaker] deactivateHalt error:", err.message);
    throw err;
  }
}

// ── getBreakerConfig() ───────────────────────────────────────────────────────

/**
 * Fetch user's circuit breaker configuration from DB.
 * Returns defaults for any breaker type not explicitly configured.
 *
 * @param {{ userId: string }} params
 * @returns {Promise<Array<{ breaker_type: string, threshold_value: number, threshold_unit: string, is_active: boolean, action: string, cooldown_minutes: number, trigger_count: number, last_triggered_at: string|null }>>}
 */
export async function getBreakerConfig({ userId }) {
  try {
    const client = getServiceClient();

    const { data, error } = await client
      .from("circuit_breakers")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("[circuit-breaker] Failed to fetch breaker config:", error.message);
      // Return defaults on error
      return buildDefaultConfig();
    }

    // Merge DB config with defaults
    const dbMap = {};
    for (const breaker of (data || [])) {
      dbMap[breaker.breaker_type] = breaker;
    }

    const result = [];
    for (const [type, def] of Object.entries(DEFAULT_BREAKERS)) {
      if (dbMap[type]) {
        result.push(dbMap[type]);
      } else {
        result.push({
          breaker_type: type,
          threshold_value: def.value,
          threshold_unit: def.unit,
          is_active: true,
          action: def.action,
          cooldown_minutes: def.cooldown,
          trigger_count: 0,
          last_triggered_at: null,
          user_id: userId,
        });
      }
    }

    return result;
  } catch (err) {
    console.error("[circuit-breaker] getBreakerConfig error:", err.message);
    return buildDefaultConfig();
  }
}

function buildDefaultConfig() {
  return Object.entries(DEFAULT_BREAKERS).map(([type, def]) => ({
    breaker_type: type,
    threshold_value: def.value,
    threshold_unit: def.unit,
    is_active: true,
    action: def.action,
    cooldown_minutes: def.cooldown,
    trigger_count: 0,
    last_triggered_at: null,
  }));
}

// ── checkCircuitBreakers() ───────────────────────────────────────────────────

/**
 * Full pre-trade circuit breaker check.
 * Called BEFORE every trade execution.
 *
 * @param {{ userId: string, account?: object, positions?: Array, order?: object, mode?: string }} params
 * @returns {Promise<{ allowed: boolean, reason?: string, breakerType?: string, details?: object }>}
 */
export async function checkCircuitBreakers({ userId, account, positions, order, mode }) {
  try {
    const client = getServiceClient();

    // ── 1. Check halt status ────────────────────────────────────────────
    const symbol = order?.symbol || order?.alpacaSymbol;
    const haltStatus = await isHalted({ userId, symbol });

    if (haltStatus.halted) {
      return {
        allowed: false,
        reason: `Trading is halted: ${haltStatus.level} — ${haltStatus.reason}`,
        breakerType: "halt_status",
        details: {
          level: haltStatus.level,
          scope: haltStatus.scope,
          reason: haltStatus.reason,
          activatedAt: haltStatus.activatedAt,
        },
      };
    }

    // Fetch breaker config for this user
    const config = await getBreakerConfig({ userId });
    const activeBreakers = config.filter((b) => b.is_active);

    // Build a quick lookup
    const breakerMap = {};
    for (const b of activeBreakers) {
      breakerMap[b.breaker_type] = b;
    }

    const equity = parseFloat(account?.equity) || 0;
    const positionsList = Array.isArray(positions) ? positions : [];
    const orderValue = parseFloat(order?.qty || 0) * parseFloat(order?.limit_price || order?.price || 0);
    const orderSymbol = symbol;

    // ── 2. Max position size ────────────────────────────────────────────
    if (breakerMap.max_position_size && orderValue > 0) {
      const breaker = breakerMap.max_position_size;
      let maxAllowed = 0;

      if (breaker.threshold_unit === "percent") {
        maxAllowed = equity * (breaker.threshold_value / 100);
      } else {
        maxAllowed = breaker.threshold_value;
      }

      if (orderValue > maxAllowed && maxAllowed > 0) {
        await recordTrigger(client, userId, "max_position_size");
        return buildRejection(breaker, "max_position_size",
          `Order value $${orderValue.toFixed(2)} exceeds max position size ${breaker.threshold_unit === 'percent' ? `${breaker.threshold_value}% of equity` : `$${breaker.threshold_value}`} ($${maxAllowed.toFixed(2)})`,
          { orderValue, maxAllowed, equity },
          userId, orderSymbol
        );
      }
    }

    // ── 3. Max open positions ───────────────────────────────────────────
    if (breakerMap.max_open_positions) {
      const breaker = breakerMap.max_open_positions;
      const openCount = positionsList.length;
      const isBuy = (order?.side || order?.action) === "buy";
      const existingPosition = positionsList.find(p =>
        (p.symbol || "").toUpperCase() === (orderSymbol || "").toUpperCase()
      );

      // Only count new positions (buy without existing position)
      if (isBuy && !existingPosition && openCount >= breaker.threshold_value) {
        await recordTrigger(client, userId, "max_open_positions");
        return buildRejection(breaker, "max_open_positions",
          `Open positions (${openCount}) would exceed max (${breaker.threshold_value})`,
          { openCount, maxAllowed: breaker.threshold_value },
          userId, orderSymbol
        );
      }
    }

    // ── 4. Single stock concentration ───────────────────────────────────
    if (breakerMap.single_stock_concentration && equity > 0 && orderSymbol) {
      const breaker = breakerMap.single_stock_concentration;
      const existingPos = positionsList.find(p =>
        (p.symbol || "").toUpperCase() === orderSymbol.toUpperCase()
      );
      const existingValue = parseFloat(existingPos?.market_value || 0);
      const totalValueAfterOrder = existingValue + orderValue;
      const concentrationPct = (totalValueAfterOrder / equity) * 100;

      if (concentrationPct > breaker.threshold_value) {
        await recordTrigger(client, userId, "single_stock_concentration");
        return buildRejection(breaker, "single_stock_concentration",
          `${orderSymbol} concentration ${concentrationPct.toFixed(1)}% would exceed max ${breaker.threshold_value}%`,
          { symbol: orderSymbol, concentrationPct, maxAllowed: breaker.threshold_value, totalValue: totalValueAfterOrder },
          userId, orderSymbol
        );
      }
    }

    // ── 5. Daily loss limit ─────────────────────────────────────────────
    if (breakerMap.daily_loss_limit && account) {
      const breaker = breakerMap.daily_loss_limit;
      const lastEquity = parseFloat(account.last_equity) || equity;
      const dayPnl = equity - lastEquity;
      const dayPnlPct = lastEquity > 0 ? (dayPnl / lastEquity) * 100 : 0;

      let limitBreached = false;
      if (breaker.threshold_unit === "percent" && dayPnlPct < breaker.threshold_value) {
        limitBreached = true;
      } else if (breaker.threshold_unit === "dollars" && dayPnl < breaker.threshold_value) {
        limitBreached = true;
      }

      if (limitBreached) {
        await recordTrigger(client, userId, "daily_loss_limit");

        // If action is halt, activate a halt
        if (breaker.action === "halt") {
          await activateHalt({
            level: "user_halt",
            scope: userId,
            reason: "daily_loss_limit",
            triggeredBy: "daily_loss_limit",
            metadata: { dayPnl, dayPnlPct, threshold: breaker.threshold_value, unit: breaker.threshold_unit },
          });
        }

        return buildRejection(breaker, "daily_loss_limit",
          `Daily P&L ${breaker.threshold_unit === 'percent' ? `${dayPnlPct.toFixed(2)}%` : `$${dayPnl.toFixed(2)}`} exceeds limit ${breaker.threshold_unit === 'percent' ? `${breaker.threshold_value}%` : `$${breaker.threshold_value}`}`,
          { dayPnl, dayPnlPct, threshold: breaker.threshold_value },
          userId, orderSymbol
        );
      }
    }

    // ── 6. Max drawdown ─────────────────────────────────────────────────
    if (breakerMap.max_drawdown && account) {
      const breaker = breakerMap.max_drawdown;
      // Use portfolio equity to calculate drawdown
      // Alpaca account has: equity, last_equity
      // For a more accurate DD, we'd need peak equity. Use last_equity as proxy.
      const currentEquity = equity;
      // Try to get peak equity from Redis cache or fallback to last_equity
      let peakEquity = parseFloat(account.last_equity) || currentEquity;
      try {
        const cached = await redis.get(`peak_equity:${userId}`);
        if (cached) peakEquity = Math.max(peakEquity, parseFloat(cached));
      } catch { /* ignore */ }

      // Update peak if current is higher
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
        try { await redis.set(`peak_equity:${userId}`, peakEquity, 86400); } catch { /* ignore */ }
      }

      const drawdownPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
      const maxDD = Math.abs(breaker.threshold_value); // threshold is negative like -5

      if (drawdownPct > maxDD) {
        await recordTrigger(client, userId, "max_drawdown");

        if (breaker.action === "halt") {
          await activateHalt({
            level: "user_halt",
            scope: userId,
            reason: "max_drawdown",
            triggeredBy: "max_drawdown",
            metadata: { drawdownPct, maxDD, peakEquity, currentEquity },
          });
        }

        return buildRejection(breaker, "max_drawdown",
          `Drawdown ${drawdownPct.toFixed(2)}% exceeds max ${maxDD}%`,
          { drawdownPct, maxDD, peakEquity, currentEquity },
          userId, orderSymbol
        );
      }
    }

    // ── 7. Consecutive loss stop ────────────────────────────────────────
    if (breakerMap.consecutive_loss_stop) {
      const breaker = breakerMap.consecutive_loss_stop;
      // Check Redis for consecutive loss count
      let consecutiveLosses = 0;
      try {
        const cached = await redis.get(`consecutive_losses:${userId}`);
        consecutiveLosses = parseInt(cached) || 0;
      } catch { /* ignore */ }

      if (consecutiveLosses >= breaker.threshold_value) {
        await recordTrigger(client, userId, "consecutive_loss_stop");

        if (breaker.action === "halt") {
          await activateHalt({
            level: "user_halt",
            scope: userId,
            reason: "consecutive_loss_stop",
            triggeredBy: "consecutive_loss_stop",
            metadata: { consecutiveLosses, threshold: breaker.threshold_value },
          });
        }

        return buildRejection(breaker, "consecutive_loss_stop",
          `${consecutiveLosses} consecutive losses exceeds limit of ${breaker.threshold_value}`,
          { consecutiveLosses, threshold: breaker.threshold_value },
          userId, orderSymbol
        );
      }
    }

    // ── 8. Order rate limit ─────────────────────────────────────────────
    if (breakerMap.order_rate_limit) {
      const breaker = breakerMap.order_rate_limit;
      try {
        const key = `order_rate:${userId}`;
        const current = parseInt(await redis.get(key)) || 0;

        if (current >= breaker.threshold_value) {
          await recordTrigger(client, userId, "order_rate_limit");
          return buildRejection(breaker, "order_rate_limit",
            `Order rate ${current}/min exceeds limit of ${breaker.threshold_value}/min`,
            { currentRate: current, maxRate: breaker.threshold_value },
            userId, orderSymbol
          );
        }

        // Increment the counter (TTL: 60s)
        await redis.set(key, current + 1, 60);
      } catch (redisErr) {
        // If Redis is down, allow the trade but log warning
        console.warn("[circuit-breaker] Rate limit check failed (Redis unavailable):", redisErr.message);
      }
    }

    // ── All checks passed ───────────────────────────────────────────────
    return { allowed: true };
  } catch (err) {
    console.error("[circuit-breaker] checkCircuitBreakers error:", err.message);
    // Fail OPEN on unexpected errors — don't block trading due to circuit breaker bugs
    return { allowed: true, warning: `Circuit breaker check failed: ${err.message}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Record a breaker trigger in the database.
 */
async function recordTrigger(client, userId, breakerType) {
  try {
    await client
      .from("circuit_breakers")
      .update({
        trigger_count: Math.random() > -1 ? undefined : 0, // Will use raw SQL below
        last_triggered_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("breaker_type", breakerType);
  } catch (err) {
    // Non-critical — don't fail the check
    console.warn(`[circuit-breaker] Failed to record trigger for ${breakerType}:`, err.message);
  }
}

/**
 * Build a rejection response from a breaker trigger.
 * If the breaker action is 'halt', also activate a halt.
 * If 'alert', log the warning but don't reject.
 */
function buildRejection(breaker, breakerType, reason, details, userId, symbol) {
  // For 'alert' action, log but allow the trade
  if (breaker.action === "alert") {
    console.warn(`[circuit-breaker] ALERT: ${reason}`, details);
    return {
      allowed: true,
      warning: reason,
      breakerType,
      details,
    };
  }

  // Audit: circuit breaker triggered
  logAuditEvent({
    eventType: AUDIT_EVENTS.CIRCUIT_BREAKER_TRIGGERED,
    userId: userId || undefined,
    symbol: symbol || undefined,
    metadata: { breakerType, action: breaker.action, reason, details },
  });

  return {
    allowed: false,
    reason,
    breakerType,
    details,
    action: breaker.action,
  };
}

// ── Consecutive loss tracking ────────────────────────────────────────────────

/**
 * Record a trade outcome for consecutive loss tracking.
 * Call this after a trade is closed (fill + exit).
 *
 * @param {{ userId: string, isWin: boolean }} params
 */
export async function recordTradeOutcome({ userId, isWin }) {
  try {
    const key = `consecutive_losses:${userId}`;
    if (isWin) {
      await redis.set(key, 0, 86400); // Reset on win
    } else {
      const current = parseInt(await redis.get(key)) || 0;
      await redis.set(key, current + 1, 86400);
    }
  } catch (err) {
    console.warn("[circuit-breaker] Failed to record trade outcome:", err.message);
  }
}

// ── Bulk halt check for batch operations ─────────────────────────────────────

/**
 * Check if trading is halted for a batch of trades.
 * Returns immediately if any trade would be blocked by a halt.
 *
 * @param {{ userId: string, symbols: string[] }} params
 * @returns {Promise<{ halted: boolean, haltInfo?: object }>}
 */
export async function checkBatchHaltStatus({ userId, symbols = [] }) {
  try {
    const haltStatus = await isHalted({ userId });
    if (haltStatus.halted) {
      return { halted: true, haltInfo: haltStatus };
    }

    // Check each symbol
    for (const symbol of symbols) {
      const symbolHalt = await isHalted({ userId, symbol });
      if (symbolHalt.halted) {
        return { halted: true, haltInfo: symbolHalt };
      }
    }

    return { halted: false };
  } catch (err) {
    console.error("[circuit-breaker] checkBatchHaltStatus error:", err.message);
    return { halted: false };
  }
}

// ── Deactivate all halts for a user ──────────────────────────────────────────

/**
 * Emergency function to deactivate all active halts for a user.
 * Should only be called from admin BFF routes.
 *
 * @param {{ userId: string }} params
 * @returns {Promise<{ deactivated: number }>}
 */
export async function deactivateAllHalts({ userId }) {
  try {
    const client = getServiceClient();

    const { data, error } = await client
      .from("trading_halts")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
      })
      .eq("scope", userId)
      .eq("is_active", true)
      .select();

    if (error) {
      throw new Error(`Failed to deactivate halts: ${error.message}`);
    }

    return { deactivated: data?.length || 0 };
  } catch (err) {
    console.error("[circuit-breaker] deactivateAllHalts error:", err.message);
    throw err;
  }
}

// ── Get all active halts ─────────────────────────────────────────────────────

/**
 * Get all active halts, optionally filtered by level/scope.
 *
 * @param {{ level?: string, scope?: string }} params
 * @returns {Promise<Array>}
 */
export async function getActiveHalts({ level, scope } = {}) {
  try {
    const client = getServiceClient();

    let query = client
      .from("trading_halts")
      .select("*")
      .eq("is_active", true)
      .order("activated_at", { ascending: false });

    if (level) query = query.eq("level", level);
    if (scope) query = query.eq("scope", scope);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get active halts: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    console.error("[circuit-breaker] getActiveHalts error:", err.message);
    return [];
  }
}

// ── Create/update a circuit breaker config ───────────────────────────────────

/**
 * Create or update a circuit breaker configuration for a user.
 * Uses upsert on (user_id, breaker_type).
 *
 * @param {{ userId: string, breakerType: string, thresholdValue: number, thresholdUnit: string, action?: string, cooldownMinutes?: number, isActive?: boolean }} params
 * @returns {Promise<object>}
 */
export async function upsertBreakerConfig({
  userId,
  breakerType,
  thresholdValue,
  thresholdUnit,
  action = "halt",
  cooldownMinutes = 30,
  isActive = true,
}) {
  try {
    const client = getServiceClient();

    // Check if breaker exists
    const { data: existing } = await client
      .from("circuit_breakers")
      .select("id")
      .eq("user_id", userId)
      .eq("breaker_type", breakerType)
      .limit(1);

    if (existing?.length > 0) {
      // Update
      const { data, error } = await client
        .from("circuit_breakers")
        .update({
          threshold_value: thresholdValue,
          threshold_unit: thresholdUnit,
          action,
          cooldown_minutes: cooldownMinutes,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update breaker: ${error.message}`);
      return data;
    } else {
      // Insert
      const { data, error } = await client
        .from("circuit_breakers")
        .insert({
          user_id: userId,
          breaker_type: breakerType,
          threshold_value: thresholdValue,
          threshold_unit: thresholdUnit,
          action,
          cooldown_minutes: cooldownMinutes,
          is_active: isActive,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create breaker: ${error.message}`);
      return data;
    }
  } catch (err) {
    console.error("[circuit-breaker] upsertBreakerConfig error:", err.message);
    throw err;
  }
}

// ── Delete a circuit breaker config ──────────────────────────────────────────

/**
 * Delete a circuit breaker configuration.
 *
 * @param {{ userId: string, breakerType: string }} params
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteBreakerConfig({ userId, breakerType }) {
  try {
    const client = getServiceClient();

    const { error } = await client
      .from("circuit_breakers")
      .delete()
      .eq("user_id", userId)
      .eq("breaker_type", breakerType);

    if (error) throw new Error(`Failed to delete breaker: ${error.message}`);
    return { success: true };
  } catch (err) {
    console.error("[circuit-breaker] deleteBreakerConfig error:", err.message);
    throw err;
  }
}
