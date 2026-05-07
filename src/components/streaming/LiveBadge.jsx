"use client";

export default function LiveBadge({ connected = false, sseMode = true }) {
  if (!connected) return null;

  return (
    <span className="badge badge-success badge-sm gap-1">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
      </span>
      LIVE
      {!sseMode && <span className="text-xs opacity-60">(poll)</span>}
    </span>
  );
}
