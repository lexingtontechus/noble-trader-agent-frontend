'use client'

import { useState, useEffect, useCallback } from 'react'
import PortfolioOverview from './PortfolioOverview'
import { notifyError } from '@/lib/notifications'

export default function PortfolioPage() {
  const [positions, setPositions] = useState([])
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [keysConfigured, setKeysConfigured] = useState(null)

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/positions')
      if (res.ok) {
        const data = await res.json()
        setPositions(Array.isArray(data) ? data : [])
      } else if (res.status === 403) {
        setKeysConfigured(false)
        setPositions([])
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err)
      notifyError('Failed to fetch positions')
      setPositions([])
    }
  }, [])

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/account')
      if (res.ok) {
        const data = await res.json()
        setAccount(data)
      } else if (res.status === 403) {
        setKeysConfigured(false)
      }
    } catch (err) {
      console.error('Failed to fetch account:', err)
      notifyError('Failed to fetch account data')
    }
  }, [])

  const checkKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/clerk/alpaca-keys-status')
      const data = await res.json()
      setKeysConfigured(data.configured === true)
      return data.configured === true
    } catch {
      setKeysConfigured(false)
      return false
    }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const hasKeys = await checkKeys()
      if (hasKeys) {
        await Promise.all([fetchPositions(), fetchAccount()])
      }
      setLoading(false)
    }
    init()
  }, [checkKeys, fetchPositions, fetchAccount])

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">Portfolio Overview</h1>
          <span className="badge badge-primary badge-sm">v3.0</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card bg-base-200 shadow-sm">
              <div className="card-body p-4">
                <div className="skeleton h-3 w-20 mb-2"></div>
                <div className="skeleton h-8 w-16"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card bg-base-200 shadow-lg">
              <div className="card-body p-4">
                <div className="skeleton h-6 w-40 mb-3"></div>
                <div className="skeleton h-20 w-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Keys not configured
  if (keysConfigured === false) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">Portfolio Overview</h1>
          <span className="badge badge-primary badge-sm">v3.0</span>
        </div>
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body items-center text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-base-content/30 mb-4">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Alpaca Keys Required</h3>
            <p className="text-sm text-base-content/60 max-w-md">
              To view your portfolio overview, configure your Alpaca API keys in the Orders tab first.
            </p>
            <p className="text-xs text-base-content/40 mt-2">
              Go to <strong>Orders → Manage Alpaca Keys</strong> to get started.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <PortfolioOverview
      positions={positions}
      account={account}
    />
  )
}
