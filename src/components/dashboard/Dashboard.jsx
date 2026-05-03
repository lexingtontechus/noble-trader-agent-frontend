'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import TickerCard from '@/components/dashboard/TickerCard'
import ComparisonTable from '@/components/dashboard/ComparisonTable'
import RegimeSummaryBanner from '@/components/dashboard/RegimeSummaryBanner'

const DEFAULT_TICKERS = [
  { symbol: 'GC=F', displayName: 'Gold' },
  { symbol: 'BTC-USD', displayName: 'Bitcoin' },
  { symbol: 'EURUSD=X', displayName: 'USD/EUR' },
]

const PERIOD_MAP = {
  '6M': '6mo',
  '1Y': '1y',
  '2Y': '2y',
}

export default function Dashboard() {
  const [period, setPeriod] = useState('6M')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [tickerData, setTickerData] = useState({})
  const [loading, setLoading] = useState({})
  const [errors, setErrors] = useState({})
  const [showComparison, setShowComparison] = useState(false)
  const intervalRef = useRef(null)

  const fetchTicker = useCallback(async (symbol, periodKey) => {
    const apiPeriod = PERIOD_MAP[periodKey] || '6mo'

    setLoading((prev) => ({ ...prev, [symbol]: true }))
    setErrors((prev) => ({ ...prev, [symbol]: null }))

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period: apiPeriod }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setTickerData((prev) => ({ ...prev, [symbol]: data }))
    } catch (err) {
      setErrors((prev) => ({ ...prev, [symbol]: err.message }))
    } finally {
      setLoading((prev) => ({ ...prev, [symbol]: false }))
    }
  }, [])

  const fetchAllTickers = useCallback(() => {
    DEFAULT_TICKERS.forEach((t) => fetchTicker(t.symbol, period))
    setLastUpdated(new Date())
  }, [period, fetchTicker])

  // Initial fetch + period change
  useEffect(() => {
    fetchAllTickers()
  }, [fetchAllTickers])

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchAllTickers()
      }, 2 * 60 * 1000) // 2 minutes
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, fetchAllTickers])

  const handleRetry = useCallback((symbol) => {
    fetchTicker(symbol, period)
  }, [period, fetchTicker])

  const handlePeriodChange = useCallback((newPeriod) => {
    setPeriod(newPeriod)
    setTickerData({})
    setErrors({})
  }, [])

  // Build ticker objects for banner and comparison
  const tickerObjects = DEFAULT_TICKERS.map((t) => ({
    ...t,
    data: tickerData[t.symbol] || null,
  }))

  const anyLoading = Object.values(loading).some(Boolean)
  const allLoaded = DEFAULT_TICKERS.every((t) => tickerData[t.symbol])

  return (
    <div className="space-y-6">
      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Period Selector */}
        <div className="btn-group">
          {Object.keys(PERIOD_MAP).map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${period === p ? 'btn-active btn-primary' : ''}`}
              onClick={() => handlePeriodChange(p)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-4">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-base-content/60">Auto-refresh</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>

          {/* Manual refresh */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={fetchAllTickers}
            disabled={anyLoading}
          >
            {anyLoading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>

          {/* Comparison toggle */}
          {allLoaded && (
            <button
              className={`btn btn-sm ${showComparison ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? 'Hide Comparison' : 'Compare'}
            </button>
          )}
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-base-content/40">
          Last updated: {lastUpdated.toLocaleTimeString()}
          {autoRefresh && (
            <span className="ml-2 badge badge-xs badge-primary badge-outline">auto 2m</span>
          )}
        </div>
      )}

      {/* Regime Summary Banner */}
      <RegimeSummaryBanner tickers={tickerObjects} />

      {/* Comparison Table */}
      {showComparison && allLoaded && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">Ticker Comparison</h3>
            <ComparisonTable tickers={tickerObjects} />
          </div>
        </div>
      )}

      {/* Ticker Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {DEFAULT_TICKERS.map((t) => (
          <TickerCard
            key={t.symbol}
            symbol={t.symbol}
            displayName={t.displayName}
            data={tickerData[t.symbol] || null}
            loading={loading[t.symbol] || false}
            error={errors[t.symbol] || null}
            onRetry={() => handleRetry(t.symbol)}
          />
        ))}
      </div>
    </div>
  )
}
