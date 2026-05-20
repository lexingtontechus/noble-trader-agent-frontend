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
 *   1. SSE /sse/pnl  (Phase 3 — real-time, not yet connected)
 *   2. REST polling   (current — every 10s for account/positions, on-demand for equity curve)
 *
 * Future: When SSE connects, polling throttles to 30s fallback.
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

  // ── SSE connection (Phase 3 placeholder) ───────────────────
  // Will connect to /sse/pnl when backend endpoint is ready.
  // For now, SSE is not active; all data comes from polling.
  useEffect(() => {
    // Phase 3: Open EventSource to /sse/pnl with JWT auth
    // On connect: setSseConnected(true), throttle polling to 30s
    // On event: update positions/account/priceTicks from SSE data
    // On disconnect: setSseConnected(false), restore 10s polling
    // On error: fall back to polling

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
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
