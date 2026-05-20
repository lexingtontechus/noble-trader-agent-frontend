"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * usePortfolioData — Fetches and auto-refreshes Alpaca account, positions, and equity history.
 *
 * @param {{ refreshInterval?: number, enabled?: boolean }} opts
 *   refreshInterval: polling interval in ms (default 10000 = 10s)
 *   enabled: whether to start polling (default true, but checks for keys)
 *
 * @returns {{
 *   account: object|null,
 *   positions: array,
 *   equityCurve: array,        // [{ timestamp, equity, pnl, pnlPc }]
 *   equityCurveLoading: boolean,
 *   equityCurvePeriod: string,
 *   setEquityCurvePeriod: (p: string) => void,
 *   loading: boolean,
 *   error: string|null,
 *   lastUpdated: Date|null,
 *   isStale: boolean,
 *   refresh: () => Promise<void>,
 *   totalUnrealizedPnl: number,
 *   totalUnrealizedPnlPc: number,
 *   dayPnl: number,
 *   dayPnlPc: number,
 * }}
 */
export function usePortfolioData({ refreshInterval = 10000, enabled = true } = {}) {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [equityCurve, setEquityCurve] = useState([]);
  const [equityCurveLoading, setEquityCurveLoading] = useState(false);
  const [equityCurvePeriod, setEquityCurvePeriod] = useState("1M");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [hasKeys, setHasKeys] = useState(null);
  const intervalRef = useRef(null);
  const staleTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [accountRes, positionsRes] = await Promise.all([
        fetch("/api/alpaca/account"),
        fetch("/api/alpaca/positions"),
      ]);

      if (!accountRes.ok || !positionsRes.ok) {
        // If 403 with NO_KEYS, just silently stop
        const errData = accountRes.status === 403 ? await accountRes.json() : null;
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

  // Fetch equity curve history (separate from the fast 10s polling)
  const refreshEquityCurve = useCallback(async (period) => {
    if (!hasKeys) return;
    setEquityCurveLoading(true);
    try {
      const res = await fetch(
        `/api/alpaca/portfolio/history?period=${period}&timeframe=1D`
      );
      if (!res.ok) {
        // Silently skip if not available
        setEquityCurve([]);
        return;
      }
      const data = await res.json();

      // Alpaca returns: { timestamp: [...], equity: [...], profit_loss: [...], ... }
      if (data?.timestamp && data?.equity) {
        const startEquity = data.equity[0] || 1;
        const curve = data.timestamp.map((ts, i) => ({
          timestamp: ts * 1000, // Alpaca returns seconds, JS needs ms
          date: new Date(ts * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          equity: parseFloat(data.equity[i]) || 0,
          pnl: parseFloat(data.profit_loss?.[i]) || 0,
          pnlPc: startEquity > 0
            ? ((parseFloat(data.equity[i]) - startEquity) / startEquity) * 100
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
  }, [hasKeys]);

  // Re-fetch equity curve when period changes
  useEffect(() => {
    if (hasKeys) {
      refreshEquityCurve(equityCurvePeriod);
    }
  }, [equityCurvePeriod, hasKeys, refreshEquityCurve]);

  // Initial fetch + polling for account/positions
  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, refreshInterval, refresh]);

  // Computed P&L values
  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + (parseFloat(p.unrealized_pl) || 0),
    0
  );

  const totalMarketValue = positions.reduce(
    (sum, p) => sum + (parseFloat(p.market_value) || 0),
    0
  );

  const totalUnrealizedPnlPc = totalMarketValue > 0
    ? (totalUnrealizedPnl / (totalMarketValue - totalUnrealizedPnl)) * 100
    : 0;

  // Day P&L from account equity change
  const dayPnl = account
    ? (parseFloat(account.equity) || 0) - (parseFloat(account.last_equity) || 0)
    : 0;

  const dayPnlPc = account && parseFloat(account.last_equity) > 0
    ? (dayPnl / parseFloat(account.last_equity)) * 100
    : 0;

  return {
    account,
    positions,
    equityCurve,
    equityCurveLoading,
    equityCurvePeriod,
    setEquityCurvePeriod,
    loading,
    error,
    lastUpdated,
    isStale,
    refresh,
    totalUnrealizedPnl,
    totalUnrealizedPnlPc,
    dayPnl,
    dayPnlPc,
  };
}
