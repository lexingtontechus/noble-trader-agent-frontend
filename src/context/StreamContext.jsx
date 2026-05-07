"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useStreamPrice } from "@/hooks/useStreamPrice";

const StreamContext = createContext(null);

export function useStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within StreamProvider");
  return ctx;
}

export function StreamProvider({ children }) {
  // subscriptions: Set of symbol strings
  const [subscriptions, setSubscriptions] = useState(new Set());
  // streamStates: { [symbol]: { seeded, connected, streaming, lastTick, error, sseMode } }
  const [streamStates, setStreamStates] = useState({});
  // alerts: [{ id, symbol, type, message, severity, timestamp }]
  const [alerts, setAlerts] = useState([]);

  const subscribe = useCallback((symbol) => {
    setSubscriptions((prev) => new Set([...prev, symbol]));
  }, []);

  const unsubscribe = useCallback((symbol) => {
    setSubscriptions((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });
    setStreamStates((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }, []);

  const subscribeAll = useCallback((symbols) => {
    setSubscriptions((prev) => new Set([...prev, ...symbols]));
  }, []);

  const unsubscribeAll = useCallback(() => {
    setSubscriptions(new Set());
    setStreamStates({});
  }, []);

  const toggleSubscription = useCallback((symbol) => {
    setSubscriptions((prev) => {
      if (prev.has(symbol)) {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      }
      return new Set([...prev, symbol]);
    });
  }, []);

  const updateStreamState = useCallback((symbol, state) => {
    setStreamStates((prev) => ({
      ...prev,
      [symbol]: { ...prev[symbol], ...state },
    }));
  }, []);

  const addAlert = useCallback((alert) => {
    const id = `${alert.symbol}-${alert.type}-${Date.now()}`;
    setAlerts((prev) => {
      const now = Date.now();
      const recent = prev.find(
        (a) =>
          a.symbol === alert.symbol &&
          a.type === alert.type &&
          now - a.timestamp < 5000,
      );
      if (recent) return prev;
      return [
        { id, ...alert, timestamp: alert.timestamp || now },
        ...prev,
      ].slice(0, 50);
    });
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const activeStreamCount = useMemo(
    () => Object.values(streamStates).filter((s) => s.streaming).length,
    [streamStates],
  );

  const anyConnected = useMemo(
    () => Object.values(streamStates).some((s) => s.connected),
    [streamStates],
  );

  const value = useMemo(
    () => ({
      subscriptions,
      streamStates,
      alerts,
      subscribe,
      unsubscribe,
      subscribeAll,
      unsubscribeAll,
      toggleSubscription,
      updateStreamState,
      addAlert,
      clearAlerts,
      activeStreamCount,
      anyConnected,
    }),
    [
      subscriptions,
      streamStates,
      alerts,
      subscribe,
      unsubscribe,
      subscribeAll,
      unsubscribeAll,
      toggleSubscription,
      updateStreamState,
      addAlert,
      clearAlerts,
      activeStreamCount,
      anyConnected,
    ],
  );

  return (
    <StreamContext.Provider value={value}>
      {children}
      <StreamHookWrapper
        subscriptions={subscriptions}
        updateStreamState={updateStreamState}
        addAlert={addAlert}
      />
    </StreamContext.Provider>
  );
}

function StreamHookWrapper({ subscriptions, updateStreamState, addAlert }) {
  // Render useStreamPrice for each subscribed symbol
  return subscriptions.size > 0 ? (
    <div style={{ display: "none" }}>
      {[...subscriptions].map((symbol) => (
        <StreamHookRenderer
          key={symbol}
          symbol={symbol}
          updateStreamState={updateStreamState}
          addAlert={addAlert}
        />
      ))}
    </div>
  ) : null;
}

function StreamHookRenderer({ symbol, updateStreamState, addAlert }) {
  useStreamPrice(symbol, updateStreamState, addAlert);
  return null;
}
