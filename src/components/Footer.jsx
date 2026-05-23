'use client'

import { useState, useEffect } from 'react'

const APP_VERSION = "v7.0.0"

export default function Footer() {
  const [tradingMode, setTradingMode] = useState("paper")

  useEffect(() => {
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
    const interval = setInterval(fetchMode, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <footer className="px-4 py-2 bg-base-200/50 border-t border-base-300 text-base-content mt-auto">
      <div className="flex items-center justify-between text-[10px] text-base-content/40">
        <div className="flex items-center gap-2">
          <span>Noble Trader {APP_VERSION}</span>
          {tradingMode === "live" ? (
            <span className="badge badge-error badge-xs animate-pulse">LIVE</span>
          ) : tradingMode === "simulation" ? (
            <span className="badge badge-ghost badge-xs">SIM</span>
          ) : (
            <span className="badge badge-success badge-xs">Paper</span>
          )}
        </div>
        <span className="max-w-md truncate">
          {tradingMode === "live"
            ? "Real money at risk. Monitor positions closely."
            : "For educational & simulation purposes only. Past performance does not guarantee future results."
          }
        </span>
      </div>
    </footer>
  )
}
