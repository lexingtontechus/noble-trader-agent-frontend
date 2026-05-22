"use client";

/**
 * usePriceAlerts — Real-time price alert engine.
 *
 * Subscribes to PriceFeedContext prices and checks user-defined
 * alerts on every tick. Fires notifications when conditions are met.
 *
 * Features:
 *  - Loads alerts from /api/price-alerts on mount
 *  - Checks each price tick against active alerts
 *  - Fires multi-channel notifications (in-app toast + Discord + Telegram)
 *  - Auto-rearms alerts after cooldown period
 *  - Provides CRUD operations for managing alerts
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";
import { notify, notifySuccess, notifyWarning, notifyError, dismissByGroup } from "@/lib/notifications";

const COOLDOWN_CACHE_TTL = 30_000; // Re-check cooldown every 30s

export default function usePriceAlerts() {
  const { prices, watchlist } = usePriceFeed();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggeredIds, setTriggeredIds] = useState(new Set());
  const lastCheckRef = useRef({}); // { alertId: timestamp } for client-side cooldown
  const pricesRef = useRef(prices);

  // Keep prices ref fresh
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // ── Load alerts from API ──────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/price-alerts?includeTriggered=true");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("[usePriceAlerts] fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Refresh alerts every 60s
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Create alert ──────────────────────────────────────────────────────────

  const createAlert = useCallback(async ({ symbol, target_price, direction = "above", severity = "info", cooldown_minutes = 15, label = "" }) => {
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          target_price,
          direction,
          severity,
          cooldown_minutes,
          label,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create alert");
      }

      const data = await res.json();
      setAlerts(prev => [data.alert, ...prev]);
      notifySuccess(`Alert set: ${symbol} ${direction} $${target_price}`, 3000, {
        title: "Price Alert Created",
        group: "price_alert_action",
      });
      return data.alert;
    } catch (err) {
      notifyError(`Failed to create alert: ${err.message}`, 4000);
      throw err;
    }
  }, []);

  // ── Update alert ──────────────────────────────────────────────────────────

  const updateAlert = useCallback(async (id, updates) => {
    try {
      const res = await fetch(`/api/price-alerts?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update alert");
      }

      const data = await res.json();
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, ...data.alert } : a));
      return data.alert;
    } catch (err) {
      notifyError(`Failed to update alert: ${err.message}`, 4000);
      throw err;
    }
  }, []);

  // ── Delete alert ──────────────────────────────────────────────────────────

  const deleteAlert = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/price-alerts?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete alert");
      }

      setAlerts(prev => prev.filter(a => a.id !== id));
      notifySuccess("Alert deleted", 2000, { group: "price_alert_action" });
    } catch (err) {
      notifyError(`Failed to delete alert: ${err.message}`, 4000);
    }
  }, []);

  // ── Toggle alert enabled ──────────────────────────────────────────────────

  const toggleAlert = useCallback(async (id, enabled) => {
    return updateAlert(id, { enabled });
  }, [updateAlert]);

  // ── Re-arm a triggered alert ──────────────────────────────────────────────

  const rearmAlert = useCallback(async (id) => {
    try {
      const alert = await updateAlert(id, { triggered: false });
      setTriggeredIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return alert;
    } catch (err) {
      console.error("[usePriceAlerts] rearm error:", err.message);
    }
  }, [updateAlert]);

  // ── Real-time alert checking ──────────────────────────────────────────────

  useEffect(() => {
    if (!prices || !alerts.length) return;

    const activeAlerts = alerts.filter(a =>
      a.enabled && !a.triggered && !triggeredIds.has(a.id)
    );

    if (!activeAlerts.length) return;

    const now = Date.now();

    for (const alert of activeAlerts) {
      const tick = prices[alert.symbol];
      if (!tick || tick.price == null) continue;

      const currentPrice = tick.price;
      const targetPrice = alert.targetPrice || alert.target_price;
      const direction = alert.direction || alert.Direction || "above";
      const cooldownMinutes = alert.cooldownMinutes || alert.cooldown_minutes || 15;

      // Client-side cooldown check
      const lastTriggerTime = lastCheckRef.current[alert.id];
      if (lastTriggerTime && (now - lastTriggerTime) < cooldownMinutes * 60 * 1000) {
        continue;
      }

      let shouldFire = false;
      switch (direction) {
        case "above":
          shouldFire = currentPrice >= targetPrice;
          break;
        case "below":
          shouldFire = currentPrice <= targetPrice;
          break;
        case "crosses":
          shouldFire = Math.abs(currentPrice - targetPrice) / targetPrice < 0.001;
          break;
      }

      if (shouldFire) {
        // Mark as triggered locally (prevent double-fire)
        setTriggeredIds(prev => new Set(prev).add(alert.id));
        lastCheckRef.current[alert.id] = now;

        const directionLabel = direction === "above" ? "rose above" : direction === "below" ? "fell below" : "crossed";
        const message = `${alert.symbol} ${directionLabel} $${targetPrice} (now $${currentPrice.toFixed(2)})`;

        // In-app toast notification
        const notifyType = alert.severity === "error" ? "error" : alert.severity === "warning" ? "warning" : "success";
        notify(notifyType, message, 8000, {
          title: `Price Alert: ${alert.symbol}`,
          group: "price_alert",
        });

        // Fire server-side alert (persist + Discord + Telegram) — non-blocking
        fetch("/api/price-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "check",
            prices: { [alert.symbol]: currentPrice },
          }),
        }).catch(err => {
          console.error("[usePriceAlerts] server check error:", err.message);
        });

        // Also update the alert state locally
        setAlerts(prev => prev.map(a =>
          a.id === alert.id
            ? { ...a, triggered: true, triggeredAt: new Date().toISOString(), triggerCount: (a.triggerCount || 0) + 1 }
            : a
        ));
      }
    }
  }, [prices, alerts, triggeredIds]);

  // ── Auto rearm alerts after cooldown ──────────────────────────────────────

  useEffect(() => {
    const triggeredAlerts = alerts.filter(a => a.enabled && a.triggered);
    if (!triggeredAlerts.length) return;

    const now = Date.now();
    const rearmTimers = [];

    for (const alert of triggeredAlerts) {
      const triggeredAt = alert.triggeredAt || alert.triggered_at;
      if (!triggeredAt) continue;

      const cooldownMs = (alert.cooldownMinutes || alert.cooldown_minutes || 15) * 60 * 1000;
      const elapsed = now - new Date(triggeredAt).getTime();
      const remaining = cooldownMs - elapsed;

      if (remaining <= 0) {
        // Cooldown expired, rearm immediately
        rearmAlert(alert.id);
      } else if (remaining < 3600000) {
        // Schedule rearm if within 1 hour (don't schedule too far out)
        const timer = setTimeout(() => rearmAlert(alert.id), remaining);
        rearmTimers.push(timer);
      }
    }

    return () => {
      rearmTimers.forEach(clearTimeout);
    };
  }, [alerts, rearmAlert]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const activeAlerts = alerts.filter(a => a.enabled && !a.triggered);
  const triggeredAlertsList = alerts.filter(a => a.triggered);
  const alertsBySymbol = {};
  for (const alert of alerts) {
    if (!alertsBySymbol[alert.symbol]) alertsBySymbol[alert.symbol] = [];
    alertsBySymbol[alert.symbol].push(alert);
  }

  // Get alert count for a specific symbol
  const getAlertCount = useCallback((symbol) => {
    return (alertsBySymbol[symbol] || []).filter(a => a.enabled && !a.triggered).length;
  }, [alertsBySymbol]);

  return {
    alerts,
    activeAlerts,
    triggeredAlerts: triggeredAlertsList,
    alertsBySymbol,
    loading,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    rearmAlert,
    getAlertCount,
    refresh: fetchAlerts,
  };
}
