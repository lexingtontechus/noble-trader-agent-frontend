"use client";
import { useStream } from "@/context/StreamContext";

const DEFAULT_SYMBOLS = ["GC=F", "BTC-USD", "EURUSD=X"];

export default function StreamStatusPanel() {
  const {
    subscriptions,
    streamStates,
    anyConnected,
    subscribeAll,
    unsubscribeAll,
    unsubscribe,
  } = useStream();

  const hasSubscriptions = subscriptions.size > 0;

  return (
    <div className="card bg-base-200 shadow-xl h-full">
      <div className="card-body p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-sm">
            📡 Active Streams
            <span className="badge badge-primary badge-sm ml-2">
              {subscriptions.size}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {anyConnected && (
              <span className="badge badge-success badge-sm">
                <span className="animate-pulse mr-1">●</span> Connected
              </span>
            )}
            {/* Go Live All / Stop All buttons */}
            {hasSubscriptions ? (
              <button
                className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-error gap-1`}
                onClick={unsubscribeAll}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
                ⏹ Stop All
              </button>
            ) : (
              <button
                className={`btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-primary gap-1`}
                onClick={() => subscribeAll(DEFAULT_SYMBOLS)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                📡 Go Live All
              </button>
            )}
          </div>
        </div>

        {/* Empty state — prompt user to start streaming */}
        {!hasSubscriptions && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📡</div>
            <p className="text-sm text-base-content/60 mb-3">
              No active streams
            </p>
            <div className="flex flex-col items-center gap-2">
              <button
                className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary gap-1"
                onClick={() => subscribeAll(DEFAULT_SYMBOLS)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                📡 Go Live — All Tickers
              </button>
              <p className="text-xs text-base-content/40">
                or click{" "}
                <span className="badge badge-primary badge-xs">📡 Go Live</span>{" "}
                on individual ticker cards
              </p>
            </div>
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
                    {/* Per-symbol stop button */}
                    <button
                      className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost btn-circle text-error"
                      onClick={() => unsubscribe(symbol)}
                      title={`Stop ${symbol}`}
                    >
                      ✕
                    </button>
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
