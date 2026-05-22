"use client";

import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * TickerTape — Scrolling horizontal ticker tape showing real-time prices.
 *
 * Features:
 *   - Continuous scrolling animation with CSS keyframes
 *   - Connection status badge (LIVE / POLL / OFF) with pulse indicator
 *   - Market status badge (OPEN / PRE / AFTER / CLOSED)
 *   - Price flash animation on each tick (green/red)
 *   - Direction arrows (▲▼) with color coding
 *   - Green for gainers, red for losers, neutral for unchanged
 *   - Pause on hover for readability
 */
export default function TickerTape() {
  const { watchlist, connected, connectionMode, marketStatus } = usePriceFeed();

  if (watchlist.length === 0) return null;

  // Duplicate items for seamless infinite scroll
  const items = [...watchlist, ...watchlist];

  const marketLabel = {
    open: { text: "OPEN", className: "badge-success" },
    "pre-market": { text: "PRE", className: "badge-warning" },
    "after-hours": { text: "AFTER", className: "badge-info" },
    closed: { text: "CLOSED", className: "badge-ghost" },
  }[marketStatus] || { text: marketStatus?.toUpperCase(), className: "badge-ghost" };

  return (
    <div className="w-full overflow-hidden bg-base-200/50 border-b border-base-300">
      <div className="flex items-center">
        {/* Connection status badge */}
        <div className="shrink-0 px-3 py-1.5 border-r border-base-300 flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              connected
                ? "bg-success animate-pulse"
                : connectionMode === "polling"
                  ? "bg-warning animate-pulse"
                  : "bg-base-content/20"
            }`}
          />
          <span className="text-[10px] uppercase font-bold text-base-content/50 tracking-wider">
            {connectionMode === "websocket" ? "LIVE" : connectionMode === "polling" ? "POLL" : "OFF"}
          </span>
        </div>

        {/* Market status badge */}
        <div className="shrink-0 px-2 py-1.5 border-r border-base-300">
          <span className={`badge badge-xs ${marketLabel.className}`}>
            {marketLabel.text}
          </span>
        </div>

        {/* Scrolling ticker */}
        <div className="overflow-hidden flex-1">
          <div className="flex animate-scroll whitespace-nowrap py-1.5">
            {items.map((item, i) => (
              <TickerItem key={`${item.symbol}-${i}`} item={item} />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

function TickerItem({ item }) {
  const isUp = item.change > 0;
  const isDown = item.change < 0;

  return (
    <div className="inline-flex items-center gap-2 px-4 text-xs">
      <span className="font-bold text-base-content/80">{item.symbol}</span>
      {item.price != null ? (
        <>
          {/* Direction arrow */}
          <span
            className={`text-[10px] font-bold ${
              isUp
                ? "text-success arrow-up"
                : isDown
                  ? "text-error arrow-down"
                  : "text-base-content/20"
            }`}
          >
            {isUp ? "▲" : isDown ? "▼" : "•"}
          </span>
          <span className={`font-mono ${isUp || isDown ? "price-flash" : "text-base-content/70"}`}>
            ${formatPrice(item.price, item.symbol)}
          </span>
          <span
            className={`font-mono font-medium ${
              isUp
                ? "text-success"
                : isDown
                  ? "text-error"
                  : "text-base-content/40"
            }`}
          >
            {isUp ? "+" : ""}
            {item.change.toFixed(2)}%
          </span>
        </>
      ) : (
        <span className="text-base-content/30">—</span>
      )}
    </div>
  );
}

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
