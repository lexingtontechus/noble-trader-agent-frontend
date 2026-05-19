'use client'

import { useState, useEffect } from 'react'

const APP_VERSION = "v3.2"

export default function Footer() {
  const [tradingMode, setTradingMode] = useState("paper")

  useEffect(() => {
    // Fetch current trading mode from backend
    async function fetchMode() {
      try {
        const res = await fetch('/api/operational/mode')
        if (res.ok) {
          const data = await res.json()
          setTradingMode(data.current_mode || "paper")
        }
      } catch {
        // Silently fail — default to paper
      }
    }
    fetchMode()
    // Refresh every 60 seconds
    const interval = setInterval(fetchMode, 60000)
    return () => clearInterval(interval)
  }, [])

  const modeBadge = () => {
    switch (tradingMode) {
      case "live":
        return <span className="badge badge-error badge-sm animate-pulse">LIVE TRADING — Real Money at Risk</span>
      case "simulation":
        return <span className="badge badge-ghost badge-sm">Simulation Mode</span>
      default:
        return <span className="badge badge-success badge-sm">Paper Trading</span>
    }
  }

  return (
    <footer className="footer footer-center p-4 bg-base-200 text-base-content mt-auto">
      <div className="flex flex-col gap-2 items-center w-full">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold text-base-content/70">
            Noble Trader {APP_VERSION}
          </span>
          {modeBadge()}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="badge badge-outline badge-sm">HMM Regime Detection</span>
          <span className="badge badge-outline badge-sm">Kelly Sizing</span>
          <span className="badge badge-outline badge-sm">VaR/CVaR Risk</span>
          <span className="badge badge-primary badge-sm">Monte Carlo Simulation</span>
          <span className="badge badge-outline badge-sm">Portfolio View</span>
          <span className="badge badge-outline badge-sm">Corr Detection</span>
          <span className="badge badge-outline badge-sm">Weight Optimizer</span>
          <span className="badge badge-secondary badge-sm">Kill Switch</span>
          <span className="badge badge-secondary badge-sm">Audit Trail</span>
          <span className="badge badge-secondary badge-sm">Fill Recon</span>
        </div>
        <p className="text-xs text-base-content/40 max-w-2xl text-center">
          {tradingMode === "live"
            ? "LIVE TRADING MODE ACTIVE — Real money is at risk. All orders will be executed on the live Alpaca API. Monitor positions closely and use the kill switch if needed."
            : "This platform is for educational and simulation purposes only. No real money is at risk. Past performance does not guarantee future results. Always consult a qualified financial advisor before making investment decisions."
          }
        </p>
      </div>
    </footer>
  )
}
