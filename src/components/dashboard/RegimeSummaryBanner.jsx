"use client";

import InfoTip from "@/components/shared/InfoTip";

function getRegimeBadgeClass(regimeLabel) {
  if (!regimeLabel || typeof regimeLabel !== 'string') return "badge-ghost";
  const lower = String(regimeLabel).toLowerCase();
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
  if (!tickers || tickers.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="text-xs text-base-content/50 font-semibold uppercase tracking-wider">
          Regime Overview<InfoTip tip="At-a-glance regime status for all tracked tickers via HMM detection" />
        </div>
        {tickers.map(({ symbol, displayName, data }) => {
          const regimeLabel = data?.analysis?.regime?.regime_label;
          const name = displayName || getDisplayName(symbol);

          return (
            <div key={symbol} className="flex items-center gap-1">
              <span className="text-xs text-base-content/60 font-semibold">
                {name}:
              </span>
              <InfoTip
                tip={
                  !regimeLabel
                    ? "Awaiting regime detection data"
                    : regimeLabel.toLowerCase().includes("bull")
                      ? "HMM-detected rising market"
                      : regimeLabel.toLowerCase().includes("bear")
                        ? "HMM-detected falling market"
                        : "HMM-detected sideways market"
                }
              >
                <span
                  className={`badge badge-lg ${getRegimeBadgeClass(regimeLabel)}`}
                >
                  {regimeLabel || "Loading..."}
                </span>
              </InfoTip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
