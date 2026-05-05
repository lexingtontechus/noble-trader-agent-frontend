"use client";

/**
 * LiveBadge — Phase 3
 * A pulsing "LIVE" indicator badge showing stream connection status.
 *
 * Variants:
 * - Connected (SSE direct): Green pulsing "LIVE"
 * - Connected (polling): Yellow pulsing "LIVE · POLL"
 * - Disconnected: null (renders nothing)
 */
export default function LiveBadge({ isConnected = false, sseMode = null }) {
  if (!isConnected) return null;

  const isDirectSSE = sseMode === "direct";

  return (
    <div
      className="tooltip"
      data-tip={isDirectSSE ? "Connected via SSE" : "Connected via polling"}
    >
      <span
        className={`inline-flex items-center gap-1 badge badge-sm badge-outline ${
          isDirectSSE ? "badge-success" : "badge-warning"
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
              isDirectSSE ? "bg-success" : "bg-warning"
            } opacity-75`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isDirectSSE ? "bg-success" : "bg-warning"
            }`}
          />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider">
          LIVE
        </span>
        {!isDirectSSE && sseMode === "fallback" && (
          <span className="text-[9px] opacity-60">· POLL</span>
        )}
      </span>
    </div>
  );
}
