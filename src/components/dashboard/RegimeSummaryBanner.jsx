"use client";

import { useStream } from "@/context/StreamContext";

function getRegimeBadgeClass(regimeLabel) {
  if (!regimeLabel) return "badge-ghost";
  const lower = regimeLabel.toLowerCase();
  if (lower.includes("bull")) return "badge-success";
  if (lower.includes("bear")) return "badge-error";
  if (lower.includes("neutral")) return "badge-warning";
  return "badge-ghost";
}

function getDisplayName(symbol) {
  const names = {
    "GC=F": "GOLD",
    "BTC-USD": "BTC",
    "EURUSD=X": "EUR/USD",
  };
  return names[symbol] || symbol;
}

export default function RegimeSummaryBanner({ tickers }) {
  const { streamStates, anyConnected } = useStream();

  if (!tickers || tickers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4 items-center">
      <span className="text-xs text-base-content/50 font-semibold uppercase tracking-wider">
        Regime Overview
        {anyConnected && (
          <span className="ml-2 badge badge-xs badge-success badge-outline gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
            </span>
            LIVE
          </span>
        )}
      </span>
      {tickers.map(({ symbol, displayName, data }) => {
        // Check if there's a live stream for this symbol
        const stream = streamStates[symbol];
        const liveRegimeLabel = stream?.lastTick?.regime_label;
        const batchRegimeLabel = data?.analysis?.regime?.regime_label;
        const regimeLabel = liveRegimeLabel || batchRegimeLabel;
        const name = displayName || getDisplayName(symbol);
        const isLive = !!liveRegimeLabel;

        return (
          <div key={symbol} className="flex items-center gap-1">
            <span className="text-xs text-base-content/60 font-semibold">
              {name}:
            </span>
            <span
              className={`badge badge-lg ${getRegimeBadgeClass(regimeLabel)} ${isLive ? "animate-pulse" : ""}`}
            >
              {isLive && (
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
              )}
              {regimeLabel || "Loading..."}
            </span>
          </div>
        );
      })}
    </div>
  );
}
