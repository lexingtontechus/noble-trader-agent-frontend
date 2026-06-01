'use client'

import { useState, useEffect, useCallback } from 'react'
import PortfolioOverview from './PortfolioOverview'
import LivePnLDashboard from '@/components/operational/LivePnLDashboard'
import TradingWorkflow from '@/components/trading/TradingWorkflow'
import PerformanceReport from '@/components/orders/PerformanceReport'
import { usePortfolio } from '@/context/PortfolioContext'

export default function PortfolioPage() {
  const [keysConfigured, setKeysConfigured] = useState(null)
  const [checkingKeys, setCheckingKeys] = useState(true)

  // Read from shared portfolio context (single source of truth)
  const {
    account,
    positions,
    equityCurve,
    lastUpdated,
  } = usePortfolio()

  // Check Alpaca key status on mount
  // Uses the unified credential endpoint (Supabase → Clerk fallback)
  // NOT the legacy /api/clerk/alpaca-keys-status which only checks Clerk
  const checkKeys = useCallback(async () => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/credentials/paper', { signal: controller.signal }).finally(() => clearTimeout(id))
      const data = await res.json().catch(() => ({ configured: false }))
      setKeysConfigured(data.configured === true)
    } catch {
      setKeysConfigured(false)
    } finally {
      setCheckingKeys(false)
    }
  }, [])

  useEffect(() => {
    checkKeys()
  }, [checkKeys])

  // Loading state (checking keys)
  if (checkingKeys) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">Portfolio</h1>
          <span className="badge badge-primary badge-sm">P&L</span>
        </div>
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      </div>
    )
  }

  // Keys not configured
  if (keysConfigured === false) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">Portfolio</h1>
          <span className="badge badge-primary badge-sm">P&L</span>
        </div>
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body items-center text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-base-content/30 mb-4">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Alpaca Keys Required</h3>
            <p className="text-sm text-base-content/60 max-w-md">
              To view your portfolio P&L and analysis, configure your Alpaca API keys in the Orders tab first.
            </p>
            <p className="text-xs text-base-content/40 mt-2">
              Go to <strong>Orders &rarr; Manage Alpaca Keys</strong> to get started.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-primary">Portfolio</h1>
        <span className="badge badge-primary badge-sm">P&L</span>
      </div>

      {/* Live P&L Dashboard — equity curve, metrics, positions table */}
      <LivePnLDashboard />

      {/* Correlation & Optimization Analysis */}
      <PortfolioOverview
        positions={positions}
        account={account}
        lastUpdated={lastUpdated}
      />

      {/* Performance Report (PDF Download) */}
      <PerformanceReport
        account={account}
        positions={positions}
        equityCurve={equityCurve}
        activities={[]}
      />

      {/* Trading Workflow */}
      <div className="divider text-base-content/40 uppercase tracking-wider text-sm font-semibold">
        Trading Workflow
      </div>
      <TradingWorkflow />
    </div>
  )
}
