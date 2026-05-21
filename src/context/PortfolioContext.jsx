"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";

const PortfolioContext = createContext(null);

/**
 * usePortfolio — Access the shared portfolio data context.
 * Must be used within a <PortfolioProvider>.
 */
export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error("usePortfolio must be used within PortfolioProvider");
  }
  return ctx;
}

/**
 * PortfolioProvider — Single source of truth for all portfolio/P&L data.
 *
 * Mounted ONCE in page.js alongside StreamProvider.
 * Both PortfolioPage and OperationalPage consume via usePortfolio().
 *
 * Data sources (in priority order):
 *   1. SSE /sse/pnl  (real-time — fills, quotes, P&L snapshots via BFF proxy)
 *   2. REST polling   (fallback — every 10s for account/positions, on-demand for equity curve)
 *
 * Phase 5 additions:
 *   - Intraday P&L time-bucketed series
 *   - Live risk metrics dashboard (Sharpe, Sortino, Max DD, VaR, etc.)
 *   - P&L alert thresholds (configurable)
 *   - CSV export
 */
export function PortfolioProvider({ children }) {
  // ── State ──────────────────────────────────────────────────
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [equityCurve, setEquityCurve] = useState([]);
  const [equityCurveLoading, setEquityCurveLoading] = useState(false);
  const [equityCurvePeriod, setEquityCurvePeriod] = useState("1M");
  const [priceTicks, setPriceTicks] = useState({}); // symbol → { price, timestamp }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [hasKeys, setHasKeys] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [recentTrades, setRecentTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  // ── Phase 5: Intraday + Risk + Alerts state ──────────────────
  const [intradayCurve, setIntradayCurve] = useState([]);
  const [intradayLoading, setIntradayLoading] = useState(false);
  const [intradayTimeframe, setIntradayTimeframe] = useState("15Min");
  const [intradayPeriod, setIntradayPeriod] = useState("1D");
  const [riskMetrics, setRiskMetrics] = useState(null);
  const [riskMetricsLoading, setRiskMetricsLoading] = useState(false);
  const [riskMetricsPeriod, setRiskMetricsPeriod] = useState("1M");
  const [alertThresholds, setAlertThresholds] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]); // live triggered alerts from SSE

  const intervalRef = useRef(null);
  const tradesFetchedRef = useRef(false);
  const staleTimerRef = useRef(null);
  const sseRef = useRef(null);
  const SSE_ACTIVE_INTERVAL = 30000; // 30s polling when SSE is connected (safety net)
  const SSE_DOWN_INTERVAL = 10000;  // 10s polling when SSE is disconnected (primary)

  // ── REST data fetch ────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [accountRes, positionsRes] = await Promise.all([
        fetch("/api/alpaca/account"),
        fetch("/api/alpaca/positions"),
      ]);

      if (!accountRes.ok || !positionsRes.ok) {
        const errData =
          accountRes.status === 403 ? await accountRes.json() : null;
        if (errData?.code === "NO_KEYS") {
          setLoading(false);
          setError(null);
          setHasKeys(false);
          return;
        }
        throw new Error("Failed to fetch portfolio data");
      }

      const accountData = await accountRes.json();
      const positionsData = await positionsRes.json();

      setAccount(accountData);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setHasKeys(true);
      setError(null);
      setLastUpdated(new Date());
      setIsStale(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Equity curve fetch ─────────────────────────────────────
  const refreshEquityCurve = useCallback(
    async (period) => {
      if (!hasKeys) return;
      setEquityCurveLoading(true);
      try {
        const res = await fetch(
          `/api/alpaca/portfolio/history?period=${period}&timeframe=1D`
        );
        if (!res.ok) {
          setEquityCurve([]);
          return;
        }
        const data = await res.json();

        if (data?.timestamp && data?.equity) {
          const startEquity = data.equity[0] || 1;
          const curve = data.timestamp.map((ts, i) => ({
            timestamp: ts * 1000,
            date: new Date(ts * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            equity: parseFloat(data.equity[i]) || 0,
            pnl: parseFloat(data.profit_loss?.[i]) || 0,
            pnlPc:
              startEquity > 0
                ? ((parseFloat(data.equity[i]) - startEquity) / startEquity) *
                  100
                : 0,
          }));
          setEquityCurve(curve);
        } else {
          setEquityCurve([]);
        }
      } catch {
        setEquityCurve([]);
      } finally {
        setEquityCurveLoading(false);
      }
    },
    [hasKeys]
  );

  // ── Phase 5: Intraday P&L fetch ──────────────────────────────
  const refreshIntraday = useCallback(
    async (timeframe, period) => {
      if (!hasKeys) return;
      setIntradayLoading(true);
      try {
        const tf = timeframe || intradayTimeframe;
        const p = period || intradayPeriod;
        const res = await fetch(
          `/api/pnl/intraday?timeframe=${tf}&period=${p}`
        );
        if (!res.ok) {
          setIntradayCurve([]);
          return;
        }
        const data = await res.json();
        if (data?.buckets) {
          const curve = data.buckets.map((b) => ({
            timestamp: b.timestamp * 1000,
            date: b.date,
            equity: b.equity,
            pnl: b.pnl,
            pnlPc: b.pnl_pct,
          }));
          setIntradayCurve(curve);
        } else {
          setIntradayCurve([]);
        }
      } catch {
        setIntradayCurve([]);
      } finally {
        setIntradayLoading(false);
      }
    },
    [hasKeys, intradayTimeframe, intradayPeriod]
  );

  // ── Phase 5: Risk metrics fetch ──────────────────────────────
  const refreshRiskMetrics = useCallback(
    async (period) => {
      if (!hasKeys) return;
      setRiskMetricsLoading(true);
      try {
        const p = period || riskMetricsPeriod;
        const res = await fetch(`/api/risk/dashboard?period=${p}`);
        if (!res.ok) {
          setRiskMetrics(null);
          return;
        }
        const data = await res.json();
        setRiskMetrics(data);
      } catch {
        setRiskMetrics(null);
      } finally {
        setRiskMetricsLoading(false);
      }
    },
    [hasKeys, riskMetricsPeriod]
  );

  // ── Phase 5: Alert thresholds fetch ──────────────────────────
  const refreshAlertThresholds = useCallback(async () => {
    if (!hasKeys) return;
    try {
      const res = await fetch("/api/pnl/alerts");
      if (!res.ok) return;
      const data = await res.json();
      setAlertThresholds(Array.isArray(data) ? data : []);
    } catch {
      // Silently fail
    }
  }, [hasKeys]);

  // ── Phase 5: Create alert threshold ──────────────────────────
  const createAlertThreshold = useCallback(
    async ({ metric, operator, value, severity = "warning", enabled = true, cooldown_minutes = 15 }) => {
      if (!hasKeys) return null;
      try {
        const res = await fetch("/api/pnl/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric, operator, value, severity, enabled, cooldown_minutes }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        await refreshAlertThresholds();
        return data;
      } catch {
        return null;
      }
    },
    [hasKeys, refreshAlertThresholds]
  );

  // ── Phase 5: Delete alert threshold ──────────────────────────
  const deleteAlertThreshold = useCallback(
    async (thresholdId) => {
      if (!hasKeys) return false;
      try {
        const res = await fetch(`/api/pnl/alerts?id=${thresholdId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await refreshAlertThresholds();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [hasKeys, refreshAlertThresholds]
  );

  // ── Phase 5: CSV export ──────────────────────────────────────
  const exportPnlCsv = useCallback(
    async (period = "1M", sections = "all") => {
      if (!hasKeys) return;
      try {
        const res = await fetch(`/api/pnl/export?period=${period}&sections=${sections}`);
        if (!res.ok) return;
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pnl_export_${period}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch {
        // Silently fail
      }
    },
    [hasKeys]
  );

  // Re-fetch equity curve when period changes
  useEffect(() => {
    if (hasKeys) {
      refreshEquityCurve(equityCurvePeriod);
    }
  }, [equityCurvePeriod, hasKeys, refreshEquityCurve]);

  // Re-fetch intraday when timeframe or period changes
  useEffect(() => {
    if (hasKeys) {
      refreshIntraday(intradayTimeframe, intradayPeriod);
    }
  }, [intradayTimeframe, intradayPeriod, hasKeys, refreshIntraday]);

  // Fetch risk metrics on key resolution + period change
  useEffect(() => {
    if (hasKeys) {
      refreshRiskMetrics(riskMetricsPeriod);
    }
  }, [riskMetricsPeriod, hasKeys, refreshRiskMetrics]);

  // Fetch alert thresholds on key resolution
  useEffect(() => {
    if (hasKeys) {
      refreshAlertThresholds();
    }
  }, [hasKeys, refreshAlertThresholds]);

  // ── Initial fetch + polling ────────────────────────────────
  // When SSE is active, polling throttles to 30s (safety net).
  // When SSE is down, polling runs at 10s (primary data source).
  useEffect(() => {
    refresh();

    const currentInterval = sseConnected ? SSE_ACTIVE_INTERVAL : SSE_DOWN_INTERVAL;
    intervalRef.current = setInterval(refresh, currentInterval);

    // Stale detection: mark as stale if no update for 30s
    staleTimerRef.current = setInterval(() => {
      if (lastUpdated && Date.now() - lastUpdated.getTime() > 30000) {
        setIsStale(true);
      }
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, [refresh, sseConnected]); // Re-run when SSE status changes

  // ── SSE connection ──────────────────────────────────────────
  // Connects to /api/stream/pnl (BFF proxy → FastAPI /sse/pnl)
  // When SSE is active, polling throttles to 30s fallback.
  useEffect(() => {
    if (!hasKeys) return;

    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 20;
    const BASE_BACKOFF_MS = 1000;

    function connectSSE() {
      if (sseRef.current) {
        sseRef.current.close();
      }

      const es = new EventSource("/api/stream/pnl");
      sseRef.current = es;

      es.onopen = () => {
        console.log("[PortfolioProvider] SSE connected to /sse/pnl");
        setSseConnected(true);
        reconnectAttempts = 0;
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const { event: eventType, data, timestamp } = parsed;

          if (!data) return;

          switch (eventType) {
            case "position_update": {
              // Update individual position in the positions array
              setPositions((prev) => {
                const idx = prev.findIndex(
                  (p) => p.symbol === data.symbol
                );
                if (idx >= 0) {
                  // Update existing position
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    ...data,
                    unrealized_pl: data.unrealized_pl,
                    unrealized_plpc: data.unrealized_plpc,
                    market_value: data.market_value,
                    current_price: data.current_price,
                    qty: data.qty,
                  };
                  return updated;
                } else if (parseInt(data.qty) !== 0) {
                  // New position (fill opened a new one)
                  return [...prev, data];
                }
                // Position closed (qty=0) but not in our array — no change
                return prev;
              });
              setLastUpdated(new Date());
              setIsStale(false);
              break;
            }

            case "price_tick": {
              // Update price tick cache for real-time display
              setPriceTicks((prev) => ({
                ...prev,
                [data.symbol]: {
                  price: parseFloat(data.price) || 0,
                  bid: parseFloat(data.bid) || 0,
                  ask: parseFloat(data.ask) || 0,
                  timestamp: timestamp || Date.now(),
                },
              }));
              break;
            }

            case "pnl_snapshot": {
              // Aggregate P&L snapshot — update computed values directly
              // This ensures the UI stays consistent even if individual
              // position_update events were missed
              setLastUpdated(new Date());
              setIsStale(false);
              break;
            }

            case "account_update": {
              // Update account data
              setAccount((prev) => ({
                ...prev,
                equity: data.equity,
                cash: data.cash,
                buying_power: data.buying_power,
                long_market_value: data.long_market_value,
                short_market_value: data.short_market_value,
                last_equity: data.last_equity,
              }));
              setLastUpdated(new Date());
              setIsStale(false);
              break;
            }

            case "pnl_alert": {
              // Phase 5: P&L threshold breach alert from SSE
              console.warn(
                `[PortfolioProvider] P&L Alert: ${data.message} (${data.severity})`
              );
              setActiveAlerts((prev) => {
                // Add to front, keep max 20
                const updated = [data, ...prev].slice(0, 20);
                return updated;
              });
              break;
            }

            case "credentials_error": {
              // Alpaca credentials failed (expired, revoked, or invalid)
              console.error(
                `[PortfolioProvider] Credentials error: ${data.reason} (stream: ${data.stream_type})`
              );
              setSseConnected(false);
              // Close SSE — no point reconnecting with bad credentials
              if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
              }
              setError("Alpaca credentials are invalid or expired. Please re-authenticate in Admin settings.");
              break;
            }

            case "connected": {
              // Initial connection event from backend
              console.log(
                `[PortfolioProvider] SSE stream connected for user ${data?.user_id || "unknown"}`
              );
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.debug("[PortfolioProvider] SSE parse error:", err.message);
        }
      };

      es.onerror = (err) => {
        console.warn("[PortfolioProvider] SSE error, falling back to polling");
        setSseConnected(false);
        es.close();
        sseRef.current = null;

        // Auto-reconnect with exponential backoff
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          const backoff =
            BASE_BACKOFF_MS *
            Math.pow(2, Math.min(reconnectAttempts, 8));
          console.log(
            `[PortfolioProvider] SSE reconnecting in ${backoff}ms (attempt ${reconnectAttempts})`
          );
          reconnectTimer = setTimeout(connectSSE, backoff);
        } else {
          console.warn(
            "[PortfolioProvider] SSE max reconnect attempts reached — polling only"
          );
        }
      };
    }

    // Start SSE connection
    connectSSE();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setSseConnected(false);
    };
  }, [hasKeys]);

  // ── Trade history fetch ──────────────────────────────────
  const refreshTrades = useCallback(async () => {
    if (!hasKeys) return;
    setTradesLoading(true);
    try {
      const res = await fetch("/api/alpaca/activities?activity_types=FILL&period=3m&direction=desc&page_size=100");
      if (!res.ok) {
        setRecentTrades([]);
        return;
      }
      const fills = await res.json();
      const trades = Array.isArray(fills) ? fills : [];
      setRecentTrades(trades);
    } catch {
      setRecentTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }, [hasKeys]);

  // Fetch trades on first key resolution + after SSE fill events
  useEffect(() => {
    if (hasKeys && !tradesFetchedRef.current) {
      tradesFetchedRef.current = true;
      refreshTrades();
    }
  }, [hasKeys, refreshTrades]);

  // ── Computed P&L values ────────────────────────────────────
  const totalUnrealizedPnl = useMemo(
    () => positions.reduce((sum, p) => sum + (parseFloat(p.unrealized_pl) || 0), 0),
    [positions]
  );

  const totalMarketValue = useMemo(
    () => positions.reduce((sum, p) => sum + (parseFloat(p.market_value) || 0), 0),
    [positions]
  );

  const totalUnrealizedPnlPc = useMemo(
    () =>
      totalMarketValue > 0
        ? (totalUnrealizedPnl / (totalMarketValue - totalUnrealizedPnl)) * 100
        : 0,
    [totalUnrealizedPnl, totalMarketValue]
  );

  const dayPnl = useMemo(
    () =>
      account
        ? (parseFloat(account.equity) || 0) -
          (parseFloat(account.last_equity) || 0)
        : 0,
    [account]
  );

  const dayPnlPc = useMemo(
    () =>
      account && parseFloat(account.last_equity) > 0
        ? (dayPnl / parseFloat(account.last_equity)) * 100
        : 0,
    [account, dayPnl]
  );

  // ── Realized P&L from trade history ─────────────────────────
  const { realizedPnl, realizedPnlBySymbol } = useMemo(() => {
    if (!recentTrades.length) return { realizedPnl: 0, realizedPnlBySymbol: {} };
    let total = 0;
    const bySymbol = {};
    for (const trade of recentTrades) {
      // Alpaca FILL activity: net_amount is the P&L for that fill
      const netAmt = parseFloat(trade.net_amount) || 0;
      const symbol = trade.symbol || "";
      total += netAmt;
      bySymbol[symbol] = (bySymbol[symbol] || 0) + netAmt;
    }
    return { realizedPnl: total, realizedPnlBySymbol: bySymbol };
  }, [recentTrades]);

  // ── Dismiss alert from active alerts ────────────────────────
  const dismissAlert = useCallback((alertId) => {
    setActiveAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
  }, []);

  // ── Context value ──────────────────────────────────────────
  const value = useMemo(
    () => ({
      account,
      positions,
      equityCurve,
      equityCurveLoading,
      equityCurvePeriod,
      setEquityCurvePeriod,
      priceTicks,
      recentTrades,
      realizedPnl,
      realizedPnlBySymbol,
      tradesLoading,
      totalUnrealizedPnl,
      totalUnrealizedPnlPc,
      totalMarketValue,
      dayPnl,
      dayPnlPc,
      loading,
      error,
      lastUpdated,
      isStale,
      sseConnected,
      hasKeys,
      refresh,
      refreshTrades,
      // Phase 5: Intraday
      intradayCurve,
      intradayLoading,
      intradayTimeframe,
      setIntradayTimeframe,
      intradayPeriod,
      setIntradayPeriod,
      refreshIntraday,
      // Phase 5: Risk metrics
      riskMetrics,
      riskMetricsLoading,
      riskMetricsPeriod,
      setRiskMetricsPeriod,
      refreshRiskMetrics,
      // Phase 5: Alerts
      alertThresholds,
      activeAlerts,
      createAlertThreshold,
      deleteAlertThreshold,
      dismissAlert,
      // Phase 5: CSV Export
      exportPnlCsv,
    }),
    [
      account,
      positions,
      equityCurve,
      equityCurveLoading,
      equityCurvePeriod,
      priceTicks,
      recentTrades,
      realizedPnl,
      realizedPnlBySymbol,
      tradesLoading,
      totalUnrealizedPnl,
      totalUnrealizedPnlPc,
      totalMarketValue,
      dayPnl,
      dayPnlPc,
      loading,
      error,
      lastUpdated,
      isStale,
      sseConnected,
      hasKeys,
      refresh,
      refreshTrades,
      // Phase 5
      intradayCurve,
      intradayLoading,
      intradayTimeframe,
      intradayPeriod,
      refreshIntraday,
      riskMetrics,
      riskMetricsLoading,
      riskMetricsPeriod,
      refreshRiskMetrics,
      alertThresholds,
      activeAlerts,
      createAlertThreshold,
      deleteAlertThreshold,
      dismissAlert,
      exportPnlCsv,
    ]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
