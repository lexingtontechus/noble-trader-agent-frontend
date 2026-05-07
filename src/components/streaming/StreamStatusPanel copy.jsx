"use client";
import { useStream } from "@/context/StreamContext";

export default function StreamStatusPanel() {
  const { subscriptions, streamStates, anyConnected } = useStream();

  const hasSubscriptions = subscriptions.size > 0;

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-sm">
            📡 Active Streams
            <span className="badge badge-primary badge-sm ml-2">
              {subscriptions.size}
            </span>
          </h3>
          {anyConnected && (
            <span className="badge badge-success badge-sm">
              <span className="animate-pulse mr-1">●</span> Connected
            </span>
          )}
        </div>

        {/* Empty state — prompt user to start streaming */}
        {!hasSubscriptions && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📡</div>
            <p className="text-sm text-base-content/60 mb-2">
              No active streams
            </p>
            <p className="text-xs text-base-content/40">
              Click{" "}
              <span className="badge badge-primary badge-xs">📡 Go Live</span>{" "}
              on any ticker card above to start real-time streaming
            </p>
          </div>
        )}

        {/* Active streams list */}
        {hasSubscriptions && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...subscriptions].map((symbol) => {
              const state = streamStates[symbol] || {};
              const statusColor = state.streaming
                ? "badge-success"
                : state.error
                  ? "badge-error"
                  : state.connected
                    ? "badge-warning"
                    : "badge-ghost";
              const statusText = state.streaming
                ? "Live"
                : state.error
                  ? "Error"
                  : state.connected
                    ? "Connecting"
                    : "Idle";

              return (
                <div
                  key={symbol}
                  className="flex items-center justify-between bg-base-300 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-sm ${statusColor}`}>
                      {statusText}
                    </span>
                    <span className="font-mono text-sm font-semibold">
                      {symbol}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {state.lastTick?.regime_label && (
                      <span className="badge badge-outline badge-sm">
                        {state.lastTick.regime_label}
                      </span>
                    )}
                    {state.lastTick?.price && (
                      <span className="font-mono text-xs">
                        {state.lastTick.price.toFixed(2)}
                      </span>
                    )}
                    {state.sseMode === false && state.streaming && (
                      <span className="badge badge-warning badge-xs">POLL</span>
                    )}
                    {state.sseMode === true && state.streaming && (
                      <span className="badge badge-info badge-xs">SSE</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
