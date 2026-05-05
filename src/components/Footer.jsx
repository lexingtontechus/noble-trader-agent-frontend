"use client";

export default function Footer() {
  return (
    <footer className="footer footer-center p-4 bg-base-200 text-base-content mt-auto">
      <div className="flex flex-col gap-2 items-center w-full">
        {/* Top row: version and paper trading badge */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold text-base-content/70">
            Noble Trader v3.0
          </span>
          <span className="badge badge-warning badge-sm">
            Paper Trading Only
          </span>
          <span className="badge badge-success badge-sm badge-outline">
            SSE Streaming
          </span>
          <span className="badge badge-primary badge-sm badge-outline">
            Monte Carlo
          </span>
          <span className="badge badge-secondary badge-sm badge-outline">
            Correlation
          </span>
          <span className="badge badge-accent badge-sm badge-outline">
            Optimizer
          </span>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="badge badge-outline badge-sm">
            HMM Regime Detection
          </span>
          <span className="badge badge-outline badge-sm">Kelly Sizing</span>
          <span className="badge badge-outline badge-sm">VaR/CVaR Risk</span>
          <span className="badge badge-outline badge-sm">Live Streaming</span>
          <span className="badge badge-outline badge-sm">Regime Alerts</span>
          <span className="badge badge-outline badge-sm">Simulation</span>
          <span className="badge badge-outline badge-sm">Portfolio View</span>
          <span className="badge badge-outline badge-sm">Corr Detection</span>
          <span className="badge badge-outline badge-sm">Weight Optimizer</span>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-base-content/40 max-w-2xl text-center">
          This platform is for educational and simulation purposes only. No real
          money is at risk. Past performance does not guarantee future results.
          Always consult a qualified financial advisor before making investment
          decisions.
        </p>
      </div>
    </footer>
  );
}
