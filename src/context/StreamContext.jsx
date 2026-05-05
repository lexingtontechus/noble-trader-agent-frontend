"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import useStreamPrice from "@/hooks/useStreamPrice";

const StreamContext = createContext(null);

const MAX_ALERTS = 50;
const DEFAULT_SYMBOLS = ["GC=F", "BTC-USD", "EURUSD=X"];

/**
 * StreamProvider — wraps the app and provides streaming state to all components.
 *
 * Features:
 * - Manages multiple simultaneous symbol streams
 * - Single global alert subscription (deduplicated)
 * - Provides subscribe/unsubscribe for symbols
 * - Tracks alert history with severity
 * - Exposes connection status for each stream
 * - Stream All / Stop All for batch operations
 * - Per-symbol tick count tracking
 */
export function StreamProvider({ children }) {
  // Active subscriptions: symbol → { enabled, subscribedAt }
  const [subscriptions, setSubscriptions] = useState({});
  // Alert history (most recent first, max 50)
  const [alerts, setAlerts] = useState([]);
  // Stream states keyed by symbol
  const [streamStates, setStreamStates] = useState({});
  // Tick counts keyed by symbol
  const [tickCounts, setTickCounts] = useState({});

  // Ref to track subscriptions without triggering re-renders in callbacks
  const subscriptionsRef = useRef({});

  // Keep ref in sync
  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);

  // Handle a regime change alert from any stream
  const handleAlert = useCallback((alert) => {
    setAlerts((prev) => {
      const entry = {
        ...alert,
        id: `${alert.symbol}-${alert.ts || Date.now()}`,
        receivedAt: Date.now(),
      };
      // Deduplicate: don't add if same symbol+current regime already in last 5
      const recent = prev.slice(0, 5);
      const isDuplicate = recent.some(
        (a) =>
          a.symbol === entry.symbol &&
          a.current === entry.current &&
          a.previous === entry.previous,
      );
      if (isDuplicate) return prev;

      return [entry, ...prev].slice(0, MAX_ALERTS);
    });
  }, []);

  // Handle a tick received from any stream
  const handleTick = useCallback((symbol, tickData) => {
    setTickCounts((prev) => ({
      ...prev,
      [symbol]: (prev[symbol] || 0) + 1,
    }));
  }, []);

  // Subscribe to a symbol's stream
  const subscribe = useCallback((symbol) => {
    setSubscriptions((prev) => {
      if (prev[symbol]) return prev;
      return { ...prev, [symbol]: { enabled: true, subscribedAt: Date.now() } };
    });
  }, []);

  // Unsubscribe from a symbol's stream
  const unsubscribe = useCallback((symbol) => {
    setSubscriptions((prev) => {
      if (!prev[symbol]) return prev;
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setStreamStates((prev) => {
      if (!prev[symbol]) return prev;
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setTickCounts((prev) => {
      if (!prev[symbol]) return prev;
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }, []);

  // Toggle streaming for a symbol (fixed: no double-setSubscriptions bug)
  const toggleStream = useCallback((symbol) => {
    setSubscriptions((prev) => {
      if (prev[symbol]) {
        // Unsubscribing
        const next = { ...prev };
        delete next[symbol];
        // Clean up stream state + tick count in same batch conceptually
        // (React will batch these state updates)
        setStreamStates((s) => {
          const n = { ...s };
          delete n[symbol];
          return n;
        });
        setTickCounts((t) => {
          const n = { ...t };
          delete n[symbol];
          return n;
        });
        return next;
      }
      // Subscribing
      return { ...prev, [symbol]: { enabled: true, subscribedAt: Date.now() } };
    });
  }, []);

  // Stream all default symbols at once
  const streamAll = useCallback((symbols = DEFAULT_SYMBOLS) => {
    setSubscriptions((prev) => {
      const next = { ...prev };
      for (const symbol of symbols) {
        if (!next[symbol]) {
          next[symbol] = { enabled: true, subscribedAt: Date.now() };
        }
      }
      return next;
    });
  }, []);

  // Stop all streams
  const stopAll = useCallback(() => {
    setSubscriptions({});
    setStreamStates({});
    setTickCounts({});
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Update a symbol's stream state (called from StreamHookWrapper via callback)
  const updateStreamState = useCallback((symbol, state) => {
    setStreamStates((prev) => {
      const existing = prev[symbol];
      // Only update if something changed (shallow comparison of key fields)
      if (
        existing?.isConnected === state.isConnected &&
        existing?.isSeeded === state.isSeeded &&
        existing?.isStreaming === state.isStreaming &&
        existing?.lastTick === state.lastTick &&
        existing?.sseMode === state.sseMode &&
        existing?.error === state.error
      ) {
        return prev;
      }
      return { ...prev, [symbol]: { ...state } };
    });
  }, []);

  // Count of active streams
  const activeStreamCount = Object.keys(subscriptions).length;

  // Check if any stream is connected (derived from state)
  const anyConnected = Object.values(streamStates).some((s) => s?.isConnected);

  // Total ticks received across all streams
  const totalTicks = Object.values(tickCounts).reduce((sum, c) => sum + c, 0);

  // Get streaming state for a specific symbol
  const getStreamState = useCallback(
    (symbol) => {
      return streamStates[symbol] || null;
    },
    [streamStates],
  );

  // Get tick count for a specific symbol
  const getTickCount = useCallback(
    (symbol) => {
      return tickCounts[symbol] || 0;
    },
    [tickCounts],
  );

  return (
    <StreamContext.Provider
      value={{
        subscriptions,
        streamStates,
        alerts,
        tickCounts,
        activeStreamCount,
        anyConnected,
        totalTicks,
        subscribe,
        unsubscribe,
        toggleStream,
        streamAll,
        stopAll,
        clearAlerts,
        handleAlert,
        handleTick,
        updateStreamState,
        getStreamState,
        getTickCount,
      }}
    >
      {children}
      {/* Render stream hooks for each subscribed symbol */}
      {Object.keys(subscriptions).map((symbol) => (
        <StreamHookWrapper
          key={symbol}
          symbol={symbol}
          enabled={subscriptions[symbol]?.enabled ?? false}
          onAlert={handleAlert}
          onTick={handleTick}
          onUpdateState={updateStreamState}
        />
      ))}
    </StreamContext.Provider>
  );
}

/**
 * StreamHookWrapper — renders useStreamPrice for a subscribed symbol
 * and reports its state back to the context via callbacks.
 */
function StreamHookWrapper({
  symbol,
  enabled,
  onAlert,
  onTick,
  onUpdateState,
}) {
  const stream = useStreamPrice(symbol, { enabled, onAlert, onTick });

  // Report stream state changes back to context
  useEffect(() => {
    onUpdateState(symbol, {
      symbol: stream.symbol,
      isSeeded: stream.isSeeded,
      isConnected: stream.isConnected,
      isStreaming: stream.isStreaming,
      lastTick: stream.lastTick,
      error: stream.error,
      sseMode: stream.sseMode,
      tickCount: stream.tickCount,
      connectedAt: stream.connectedAt,
    });
  }, [
    symbol,
    stream.isSeeded,
    stream.isConnected,
    stream.isStreaming,
    stream.lastTick,
    stream.error,
    stream.sseMode,
    stream.tickCount,
    stream.connectedAt,
    onUpdateState,
  ]);

  // This component doesn't render anything visible
  return null;
}

/**
 * useStream — convenience hook to access the StreamContext.
 * Returns the full context value.
 */
export function useStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) {
    throw new Error("useStream must be used within a StreamProvider");
  }
  return ctx;
}

/**
 * useStreamSymbol — convenience hook to get streaming data for a specific symbol.
 * Returns the stream state from context, or null if not subscribed.
 */
export function useStreamSymbol(symbol) {
  const { streamStates, tickCounts, subscribe, unsubscribe, toggleStream } =
    useStream();
  const streamState = streamStates[symbol] || null;

  return {
    ...streamState,
    tickCount: tickCounts[symbol] || 0,
    subscribe: () => subscribe(symbol),
    unsubscribe: () => unsubscribe(symbol),
    toggleStream: () => toggleStream(symbol),
    isSubscribed: !!streamState,
  };
}

export default StreamContext;
