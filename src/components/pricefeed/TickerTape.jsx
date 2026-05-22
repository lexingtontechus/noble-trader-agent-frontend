"use client";

import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * TickerTape — Scrolling horizontal ticker tape showing real-time prices.
 *
 * Displays all watchlist symbols with their current price and change %.
 * Uses CSS animation for smooth continuous scrolling.
 * Green for gainers, red for losers, neutral for unchanged.
 */
export default function TickerTape() {
  const { watchlist, connected, connectionMode } = usePriceFeed();

  if (watchlist.length === 0) return null;

  // Duplicate items for seamless infinite scroll
  const items = [...watchlist, ...watchlist];

  return (
    <div className="w-full overflow-hidden bg-base-200/50 border-b border-base-300">
      {/* Connection status badge */}
      <div className="flex items-center">
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

        {/* Scrolling ticker */}
        <div className="overflow-hidden flex-1">
          <div className="flex animate-scroll whitespace-nowrap py-1.5">
            {items.map((item, i) => (
              <div
                key={`${item.symbol}-${i}`}
                className="inline-flex items-center gap-2 px-4 text-xs"
              >
                <span className="font-bold text-base-content/80">{item.symbol}</span>
                {item.price != null ? (
                  <>
                    <span className="font-mono text-base-content/70">
                      ${formatPrice(item.price, item.symbol)}
                    </span>
                    <span
                      className={`font-mono font-medium ${
                        item.change > 0
                          ? "text-success"
                          : item.change < 0
                            ? "text-error"
                            : "text-base-content/40"
                      }`}
                    >
                      {item.change > 0 ? "+" : ""}
                      {item.change.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span className="text-base-content/30">—</span>
                )}
              </div>
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

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
