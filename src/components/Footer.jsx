'use client'

export default function Footer() {
  return (
    <footer className="footer footer-center p-4 bg-base-200 text-base-content mt-auto">
      <div className="flex flex-col gap-2 items-center w-full">
        {/* Top row: version and paper trading badge */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold text-base-content/70">
            Noble Trader v1.0
          </span>
          <span className="badge badge-warning badge-sm">Paper Trading Only</span>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="badge badge-outline badge-sm">HMM Regime Detection</span>
          <span className="badge badge-outline badge-sm">Kelly Sizing</span>
          <span className="badge badge-outline badge-sm">VaR/CVaR Risk</span>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-base-content/40 max-w-2xl text-center">
          This platform is for educational and simulation purposes only. No real money is at risk.
          Past performance does not guarantee future results. Always consult a qualified financial
          advisor before making investment decisions.
        </p>
      </div>
    </footer>
  );
}
