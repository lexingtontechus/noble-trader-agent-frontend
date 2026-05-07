"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";

const StreamContext = createContext(null);

export function StreamProvider({ children }) {
  const [subscriptions, setSubscriptions] = useState({});
  const [tickCounts, setTickCounts] = useState({});
  const [alerts, setAlerts] = useState([]);
  const subscriptionsRef = useRef({});

  const activeStreamCount = Object.values(subscriptions).filter(Boolean).length;
  const streamStates = subscriptions;

  const toggleStream = useCallback((symbol) => {
    setSubscriptions((prev) => {
      const next = { ...prev, [symbol]: !prev[symbol] };
      subscriptionsRef.current = next;
      return next;
    });
  }, []);

  const setStreamActive = useCallback((symbol, active) => {
    setSubscriptions((prev) => {
      const next = { ...prev, [symbol]: active };
      subscriptionsRef.current = next;
      return next;
    });
  }, []);

  const incrementTick = useCallback((symbol) => {
    setTickCounts((prev) => ({ ...prev, [symbol]: (prev[symbol] || 0) + 1 }));
  }, []);

  const getTickCount = useCallback(
    (symbol) => tickCounts[symbol] || 0,
    [tickCounts],
  );

  const streamAll = useCallback((symbols) => {
    setSubscriptions((prev) => {
      const next = { ...prev };
      symbols.forEach((s) => {
        next[s] = true;
      });
      subscriptionsRef.current = next;
      return next;
    });
  }, []);

  const stopAll = useCallback(() => {
    setSubscriptions({});
    subscriptionsRef.current = {};
  }, []);

  const addAlert = useCallback((alert) => {
    setAlerts((prevAlerts) => {
      // Check if alert with same id already exists
      const exists = prevAlerts.some((a) => a.id === alert.id);
      if (exists) return prevAlerts;

      // Limit to 50 alerts to prevent memory issues
      const newAlerts = [alert, ...prevAlerts];
      return newAlerts.slice(0, 50);
    });
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const removeAlert = useCallback((alertId) => {
    setAlerts((prevAlerts) => prevAlerts.filter((a) => a.id !== alertId));
  }, []);

  const value = {
    subscriptions,
    streamStates,
    activeStreamCount,
    tickCounts,
    alerts,
    toggleStream,
    setStreamActive,
    incrementTick,
    getTickCount,
    streamAll,
    stopAll,
    addAlert,
    clearAlerts,
    removeAlert,
  };

  return (
    <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
  );
}

export function useStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within StreamProvider");
  return ctx;
}
