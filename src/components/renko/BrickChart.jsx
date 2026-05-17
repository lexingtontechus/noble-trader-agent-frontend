"use client";

import { useMemo } from "react";

/**
 * BrickChart — Renders Renko bricks as colored CSS rectangles.
 * Shows last 50 bricks in a horizontal scrolling container.
 * Each brick shows direction arrow, open/close price.
 * Swing labels (HH/HL/LH/LL) shown as badges.
 */

const SWING_COLORS = {
  HH: "badge-warning",
  HL: "badge-info",
  LH: "badge-info",
  LL: "badge-warning",
};

function SingleBrick({ brick, classified, maxPrice, minPrice, priceRange }) {
  const isUp = brick.direction === "UP";
  const bgColor = isUp ? "bg-success/80" : "bg-error/80";
  const textColor = isUp ? "text-success" : "text-error";
  const arrow = isUp ? "▲" : "▼";

  // Calculate vertical position based on price
  const topPct =
    priceRange > 0
      ? ((maxPrice - brick.close_price) / priceRange) * 100
      : 50;
  const bottomPct =
    priceRange > 0
      ? ((maxPrice - brick.open_price) / priceRange) * 100
      : 40;

  const heightPct = Math.max(Math.abs(bottomPct - topPct), 2);

  // Find swing label for this brick
  const swingLabel = classified?.label || null;

  return (
    <div
      className="relative flex flex-col items-center justify-end"
      style={{ width: 48, minWidth: 48 }}
    >
      {/* Price label on top */}
      <div
        className={`text-[9px] font-mono ${textColor} opacity-70 mb-0.5 whitespace-nowrap`}
      >
        {brick.close_price?.toFixed(2)}
      </div>

      {/* Brick body */}
      <div
        className={`w-10 rounded-sm ${bgColor} flex items-center justify-center relative transition-all duration-200`}
        style={{ height: Math.max(heightPct * 2.5, 18) }}
      >
        <span className="text-xs font-bold text-white/90">{arrow}</span>

        {/* Swing label badge */}
        {swingLabel && (
          <span
            className={`badge badge-xs absolute -top-2 left-1/2 -translate-x-1/2 ${
              SWING_COLORS[swingLabel] || "badge-ghost"
            }`}
          >
            {swingLabel}
          </span>
        )}
      </div>

      {/* Price label on bottom */}
      <div
        className={`text-[9px] font-mono ${textColor} opacity-50 mt-0.5 whitespace-nowrap`}
      >
        {brick.open_price?.toFixed(2)}
      </div>

      {/* Index */}
      <div className="text-[8px] text-base-content/20 mt-0.5">
        #{brick.index}
      </div>
    </div>
  );
}

function CompactBrick({ brick, classified }) {
  const isUp = brick.direction === "UP";
  const bgColor = isUp ? "bg-success" : "bg-error";
  const arrow = isUp ? "▲" : "▼";
  const swingLabel = classified?.label || null;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: 36, minWidth: 36 }}
    >
      {/* Swing label */}
      {swingLabel && (
        <span
          className={`badge badge-xs mb-0.5 ${
            SWING_COLORS[swingLabel] || "badge-ghost"
          }`}
        >
          {swingLabel}
        </span>
      )}

      {/* Brick rectangle */}
      <div
        className={`w-8 h-6 rounded-sm ${bgColor} flex items-center justify-center`}
      >
        <span className="text-[10px] font-bold text-white/90">{arrow}</span>
      </div>

      {/* Price */}
      <div
        className={`text-[8px] font-mono mt-0.5 ${
          isUp ? "text-success" : "text-error"
        } opacity-60 whitespace-nowrap`}
      >
        {brick.close_price?.toFixed(2)}
      </div>
    </div>
  );
}

export default function BrickChart({ bricks = [], classified = [] }) {
  // Build a map of classified bricks by index for swing labels
  const classifiedMap = useMemo(() => {
    const map = {};
    if (Array.isArray(classified)) {
      classified.forEach((c) => {
        if (c?.index != null) map[c.index] = c;
      });
    }
    return map;
  }, [classified]);

  // Compute price range for vertical positioning
  const { maxPrice, minPrice, priceRange } = useMemo(() => {
    if (!bricks.length) return { maxPrice: 0, minPrice: 0, priceRange: 0 };
    let max = -Infinity,
      min = Infinity;
    bricks.forEach((b) => {
      if (b.close_price > max) max = b.close_price;
      if (b.open_price > max) max = b.open_price;
      if (b.close_price < min) min = b.close_price;
      if (b.open_price < min) min = b.open_price;
    });
    return { maxPrice: max, minPrice: min, priceRange: max - min || 1 };
  }, [bricks]);

  // Velocity: bricks per minute estimate
  const velocity = useMemo(() => {
    if (bricks.length < 2) return 0;
    const recent = bricks.slice(-20);
    if (recent.length < 2) return 0;
    const first = recent[0]?.timestamp;
    const last = recent[recent.length - 1]?.timestamp;
    if (!first || !last) return 0;
    const t1 = new Date(first).getTime();
    const t2 = new Date(last).getTime();
    const minutes = (t2 - t1) / 60000;
    return minutes > 0 ? (recent.length / minutes).toFixed(1) : 0;
  }, [bricks]);

  // Last 50 bricks
  const displayBricks = bricks.slice(-50);

  if (!displayBricks.length) {
    return (
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4 items-center justify-center py-12">
          <span className="text-4xl mb-3">🧱</span>
          <h3 className="text-lg font-bold mb-1">No Bricks Yet</h3>
          <p className="text-base-content/50 text-sm text-center max-w-md">
            Feed ticks into the Renko pipeline to start generating bricks.
            Use the process tick button or enable auto-refresh.
          </p>
        </div>
      </div>
    );
  }

  // Last direction for color indicator
  const lastDirection = displayBricks[displayBricks.length - 1]?.direction;

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <span className="text-sm">🧱</span>
            </div>
            <h3 className="font-semibold text-sm">Brick Chart</h3>
          </div>
          <div className="flex items-center gap-2">
            {velocity > 0 && (
              <span className="badge badge-sm badge-ghost">
                {velocity} bricks/min
              </span>
            )}
            <span
              className={`badge badge-sm ${
                lastDirection === "UP" ? "badge-success" : "badge-error"
              }`}
            >
              {lastDirection === "UP" ? "▲ Bullish" : "▼ Bearish"}
            </span>
            <span className="text-xs text-base-content/40">
              {displayBricks.length} bricks
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-success"></div>
            <span className="text-base-content/50">UP</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-error"></div>
            <span className="text-base-content/50">DOWN</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="badge badge-xs badge-warning">HH</span>
            <span className="text-base-content/50">Higher High</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="badge badge-xs badge-info">HL</span>
            <span className="text-base-content/50">Higher Low</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="badge badge-xs badge-info">LH</span>
            <span className="text-base-content/50">Lower High</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="badge badge-xs badge-warning">LL</span>
            <span className="text-base-content/50">Lower Low</span>
          </div>
        </div>

        {/* Bricks container — horizontal scroll */}
        <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
          <div className="flex items-end gap-1 min-w-min">
            {displayBricks.map((brick) => (
              <CompactBrick
                key={brick.index ?? brick.timestamp ?? Math.random()}
                brick={brick}
                classified={classifiedMap[brick.index]}
              />
            ))}
          </div>
        </div>

        {/* Price range indicator */}
        <div className="flex items-center justify-between mt-2 text-xs font-mono text-base-content/40">
          <span>${minPrice?.toFixed(2)}</span>
          <span className="text-base-content/20">─ ─ ─ ─ ─ ─ ─ ─ ─ ─</span>
          <span>${maxPrice?.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
