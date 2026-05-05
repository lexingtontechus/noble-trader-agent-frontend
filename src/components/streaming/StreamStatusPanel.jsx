"use client";

import { useStream } from "@/context/StreamContext";
import LiveBadge from "./LiveBadge";

/**
 * StreamStatusPanel — Phase 3
 * Dashboard panel showing all active streaming sessions and their status.
 *
 * Features:
 * - Per-symbol status with animated indicators
 * - Tick count, regime label, live price per stream
 * - SSE mode badge (direct vs polling)
 * - Stream All / Stop All batch actions
 * - Connection duration display
 * - Error state with re-seed hint
 */
export default function StreamStatusPanel() {
  const {
    subscriptions,
    streamStates,
    tickCounts,
    activeStreamCount,
    anyConnected,
    toggleStream,
    streamAll,
    stopAll,
    totalTicks,
  } = useStream();

  const symbols = Object.keys(subscriptions);

  if (symbols.length === 0) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body p-4">
          <h3 className="card-title text-base flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M8 12l2 2 4-4" />
            </svg>
            Live Streams
          </h3>
          <p className="text-sm text-base-content/50 mb-3">
            No active streams. Click &quot;Go Live&quot; on any ticker card to
            start streaming real-time regime detection.
          </p>
          <button
            className="btn btn-sm btn-outline btn-success gap-1"
            onClick={() => streamAll()}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Stream All Default Tickers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-base flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M8 12l2 2 4-4" />
            </svg>
            Live Streams
            <span className="badge badge-sm badge-primary">
              {activeStreamCount}
            </span>
            {totalTicks > 0 && (
              <span className="badge badge-sm badge-ghost">
                {totalTicks} ticks
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <LiveBadge isConnected={anyConnected} />
          </div>
        </div>

        {/* Stream list */}
        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
          {symbols.map((symbol) => (
            <StreamRow
              key={symbol}
              symbol={symbol}
              stream={streamStates[symbol] || {}}
              tickCount={tickCounts[symbol] || 0}
              onToggle={() => toggleStream(symbol)}
            />
          ))}
        </div>

        {/* Batch actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-base-300">
          <button
            className="btn btn-xs btn-outline btn-success gap-1"
            onClick={() => streamAll()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Stream All
          </button>
          <button
            className="btn btn-xs btn-outline btn-error gap-1"
            onClick={stopAll}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            Stop All
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: Individual stream row ─────────────────────────────────────

function StreamRow({ symbol, stream, tickCount, onToggle }) {
  const {
    isSeeded,
    isConnected,
    isStreaming,
    lastTick,
    error,
    sseMode,
    connectedAt,
  } = stream;

  // Connection duration
  const duration = connectedAt
    ? formatDuration(Date.now() - connectedAt)
    : null;

  // Regime label with color
  const regimeLabel = lastTick?.regime_label;
  const isBear = regimeLabel?.toLowerCase().includes("bear");
  const isBull = regimeLabel?.toLowerCase().includes("bull");

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-base-300 hover:bg-base-300/80 transition-colors">
      <div className="flex items-center gap-2.5">
        {/* Status dot */}
        <div className="flex items-center">
          {isStreaming ? (
            isConnected ? (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
              </span>
            ) : isSeeded ? (
              <span
                className="h-3 w-3 rounded-full bg-warning"
                title="Seeded, connecting..."
              />
            ) : (
              <span
                className="loading loading-spinner loading-xs text-primary"
                title="Seeding..."
              />
            )
          ) : (
            <span
              className="h-3 w-3 rounded-full bg-base-content/20"
              title="Stopped"
            />
          )}
        </div>

        {/* Symbol + regime + duration */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{symbol}</span>
            {regimeLabel && (
              <span
                className={`badge badge-xs ${
                  isBear
                    ? "badge-error"
                    : isBull
                      ? "badge-success"
                      : "badge-warning"
                }`}
              >
                {regimeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            {tickCount > 0 && <span>{tickCount} ticks</span>}
            {duration && <span>· {duration}</span>}
            {sseMode && (
              <span
                className={`badge badge-xs badge-outline ${
                  sseMode === "direct" ? "badge-success" : "badge-warning"
                }`}
              >
                {sseMode === "direct" ? "SSE" : "POLL"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Live price */}
        {lastTick?.price && (
          <span className="font-mono text-sm font-semibold">
            ${lastTick.price.toFixed(2)}
          </span>
        )}

        {/* Error indicator */}
        {error && (
          <span className="text-xs text-error" title={error}>
            ⚠
          </span>
        )}

        {/* Stop button */}
        <button
          className="btn btn-xs btn-ghost btn-circle text-error hover:bg-error/10"
          onClick={onToggle}
          title="Stop streaming"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
