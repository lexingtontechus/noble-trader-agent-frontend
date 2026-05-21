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
 *
 * @returns {{
 *   account: object|null,
 *   positions: array,
 *   equityCurve: array,
 *   equityCurveLoading: boolean,
 *   equityCurvePeriod: string,
 *   setEquityCurvePeriod: (p: string) => void,
 *   priceTicks: Record<string, { price: number, timestamp: number }>,
 *   totalUnrealizedPnl: number,
 *   totalUnrealizedPnlPc: number,
 *   totalMarketValue: number,
 *   dayPnl: number,
 *   dayPnlPc: number,
 *   loading: boolean,
 *   error: string|null,
 *   lastUpdated: Date|null,
 *   isStale: boolean,
 *   sseConnected: boolean,
 *   refresh: () => Promise<void>,
 * }}
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
 * When SSE connects, it provides real-time position/fill/quote updates.
 * REST polling continues as a safety net at 10s intervals.
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

  const intervalRef = useRef(null);
  const staleTimerRef = useRef(null);
  const sseRef = useRef(null);
  const refreshInterval = 10000; // 10s polling (will throttle to 30s when SSE active)

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

  // Re-fetch equity curve when period changes
  useEffect(() => {
    if (hasKeys) {
      refreshEquityCurve(equityCurvePeriod);
    }
  }, [equityCurvePeriod, hasKeys, refreshEquityCurve]);

  // ── Initial fetch + polling ────────────────────────────────
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, refreshInterval);

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
  }, [refresh, refreshInterval, lastUpdated]);

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
    }),
    [
      account,
      positions,
      equityCurve,
      equityCurveLoading,
      equityCurvePeriod,
      priceTicks,
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
    ]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
