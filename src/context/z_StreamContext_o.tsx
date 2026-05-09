"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useStreamPrice } from "@/hooks/useStreamPrice";

interface StreamState {
  seeded?: boolean;
  connected?: boolean;
  streaming?: boolean;
  lastTick?: Record<string, unknown>;
  error?: string | null;
  sseMode?: boolean;
}

interface Alert {
  id: string;
  symbol: string;
  type: string;
  message: string;
  severity: string;
  timestamp: number;
}

interface StreamContextValue {
  subscriptions: Set<string>;
  streamStates: Record<string, StreamState>;
  alerts: Alert[];
  subscribe: (symbol: string) => void;
  unsubscribe: (symbol: string) => void;
  subscribeAll: (symbols: string[]) => void;
  unsubscribeAll: () => void;
  toggleSubscription: (symbol: string) => void;
  updateStreamState: (symbol: string, state: Partial<StreamState>) => void;
  addAlert: (
    alert: Omit<Alert, "id" | "timestamp"> & { timestamp?: number },
  ) => void;
  clearAlerts: () => void;
  activeStreamCount: number;
  anyConnected: boolean;
}

const StreamContext = createContext<StreamContextValue | null>(null);

export function useStream(): StreamContextValue {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within StreamProvider");
  return ctx;
}

export function StreamProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  const [streamStates, setStreamStates] = useState<Record<string, StreamState>>(
    {},
  );
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const subscribe = useCallback((symbol: string) => {
    setSubscriptions((prev) => new Set([...prev, symbol]));
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
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

  const subscribeAll = useCallback((symbols: string[]) => {
    setSubscriptions((prev) => new Set([...prev, ...symbols]));
  }, []);

  const unsubscribeAll = useCallback(() => {
    setSubscriptions(new Set());
    setStreamStates({});
  }, []);

  const toggleSubscription = useCallback((symbol: string) => {
    setSubscriptions((prev) => {
      if (prev.has(symbol)) {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      }
      return new Set([...prev, symbol]);
    });
  }, []);

  const updateStreamState = useCallback(
    (symbol: string, state: Partial<StreamState>) => {
      setStreamStates((prev) => ({
        ...prev,
        [symbol]: { ...prev[symbol], ...state },
      }));
    },
    [],
  );

  const addAlert = useCallback(
    (alert: Omit<Alert, "id" | "timestamp"> & { timestamp?: number }) => {
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
    },
    [],
  );

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const activeStreamCount = useMemo(
    () => Object.values(streamStates).filter((s) => s.streaming).length,
    [streamStates],
  );

  const anyConnected = useMemo(
    () => Object.values(streamStates).some((s) => s.connected),
    [streamStates],
  );

  const value = useMemo<StreamContextValue>(
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

function StreamHookWrapper({
  subscriptions,
  updateStreamState,
  addAlert,
}: {
  subscriptions: Set<string>;
  updateStreamState: (symbol: string, state: Partial<StreamState>) => void;
  addAlert: (
    alert: Omit<Alert, "id" | "timestamp"> & { timestamp?: number },
  ) => void;
}) {
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

function StreamHookRenderer({
  symbol,
  updateStreamState,
  addAlert,
}: {
  symbol: string;
  updateStreamState: (symbol: string, state: Partial<StreamState>) => void;
  addAlert: (
    alert: Omit<Alert, "id" | "timestamp"> & { timestamp?: number },
  ) => void;
}) {
  useStreamPrice(symbol, updateStreamState, addAlert);
  return null;
}
