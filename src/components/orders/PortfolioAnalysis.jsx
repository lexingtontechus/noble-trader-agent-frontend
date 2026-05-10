'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import PortfolioAnalysisCard from './PortfolioAnalysisCard'

const PERIOD_MAP = {
  '1m': '1mo',
  '3m': '6mo',   // yahoo doesn't have 3mo exactly, use 6mo
  '6m': '6mo',
  '1y': '1y',
}

/**
 * Extract unique symbols from orders with position context
 */
function extractSymbols(orders = []) {
  const symbolMap = {}

  for (const order of orders) {
    const sym = order.symbol
    if (!sym) continue

    if (!symbolMap[sym]) {
      symbolMap[sym] = { totalBuyQty: 0, totalSellQty: 0, totalBuyValue: 0, totalSellValue: 0, fillCount: 0 }
    }

    const qty = parseFloat(order.qty || order.filled_qty || 0)
    const price = parseFloat(order.filled_avg_price || 0)
    const side = String(typeof order.side === 'string' ? order.side : '').toLowerCase()
    const status = String(typeof order.status === 'string' ? order.status : '').toLowerCase()

    // Only count filled/partially filled orders
    if (['filled', 'partially_filled'].includes(status) && qty > 0) {
      if (side === 'buy') {
        symbolMap[sym].totalBuyQty += qty
        symbolMap[sym].totalBuyValue += qty * price
      } else if (side === 'sell') {
        symbolMap[sym].totalSellQty += qty
        symbolMap[sym].totalSellValue += qty * price
      }
      symbolMap[sym].fillCount += 1
    }
  }

  return Object.entries(symbolMap).map(([symbol, info]) => {
    const netQty = info.totalBuyQty - info.totalSellQty
    let avgPrice = 0
    let netSide = 'flat'

    if (netQty > 0) {
      avgPrice = info.totalBuyValue / info.totalBuyQty
      netSide = 'long'
    } else if (netQty < 0) {
      avgPrice = info.totalSellValue / info.totalSellQty
      netSide = 'short'
    } else if (info.fillCount > 0) {
      // Flat but had activity
      avgPrice = (info.totalBuyValue + info.totalSellValue) / (info.totalBuyQty + info.totalSellQty)
      netSide = 'flat'
    }

    return {
      symbol,
      positionInfo: {
        totalQty: Math.abs(netQty),
        avgPrice,
        netSide,
        fillCount: info.fillCount,
        totalBuyQty: info.totalBuyQty,
        totalSellQty: info.totalSellQty,
      },
    }
  })
}

export default function PortfolioAnalysis({ orders = [], period = '3m' }) {
  const [tickerData, setTickerData] = useState({})
  const [loading, setLoading] = useState({})
  const [errors, setErrors] = useState({})
  const [isExpanded, setIsExpanded] = useState(false)

  // Extract unique symbols from orders with position context
  const symbols = useMemo(() => extractSymbols(orders), [orders])

  const analysisPeriod = PERIOD_MAP[period] || '6mo'

  const fetchAnalysis = useCallback(async (symbol) => {
    setLoading((prev) => ({ ...prev, [symbol]: true }))
    setErrors((prev) => ({ ...prev, [symbol]: null }))

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period: analysisPeriod }),
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
  }, [analysisPeriod])

  const fetchAll = useCallback(() => {
    symbols.forEach((s) => fetchAnalysis(s.symbol))
  }, [symbols, fetchAnalysis])

  // Fetch when expanded or when symbols change
  useEffect(() => {
    if (isExpanded && symbols.length > 0) {
      fetchAll()
    }
  }, [isExpanded, symbols.length, fetchAll])

  // Don't render if no symbols
  if (symbols.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Section Header with Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Portfolio Analysis</h2>
          <span className="badge badge-primary badge-sm">{symbols.length} symbol{symbols.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <button
              className="btn btn-sm btn-ghost gap-1"
              onClick={fetchAll}
              disabled={Object.values(loading).some(Boolean)}
            >
              {Object.values(loading).some(Boolean) ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              )}
              Refresh
            </button>
          )}
          <button
            className={`btn btn-sm ${isExpanded ? 'btn-primary' : 'btn-outline btn-primary'}`}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 11 12 6 7 11" />
                  <polyline points="17 18 12 13 7 18" />
                </svg>
                Collapse
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 13 12 18 17 13" />
                  <polyline points="7 6 12 11 17 6" />
                </svg>
                Analyze {symbols.length} Symbol{symbols.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Symbol Quick-View Strip (always visible when symbols exist) */}
      {!isExpanded && (
        <div className="flex flex-wrap gap-2">
          {symbols.map((s) => (
            <div key={s.symbol} className="badge badge-lg badge-outline gap-1 py-3 px-4">
              <span className="font-mono font-bold">{s.symbol}</span>
              <span className={`badge badge-xs ${s.positionInfo.netSide === 'long' ? 'badge-success' : s.positionInfo.netSide === 'short' ? 'badge-error' : 'badge-ghost'}`}>
                {s.positionInfo.netSide === 'long' ? 'L' : s.positionInfo.netSide === 'short' ? 'S' : '—'}
              </span>
              {s.positionInfo.totalQty > 0 && (
                <span className="text-xs opacity-60">{s.positionInfo.totalQty} shares</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Expanded Analysis Cards */}
      {isExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {symbols.map((s) => {
            const data = tickerData[s.symbol]
            // Inject positionInfo into data so the card can display it
            const dataWithPosition = data ? { ...data, positionInfo: s.positionInfo } : null

            return (
              <PortfolioAnalysisCard
                key={s.symbol}
                symbol={s.symbol}
                data={dataWithPosition}
                loading={loading[s.symbol] || false}
                error={errors[s.symbol] || null}
                onRetry={() => fetchAnalysis(s.symbol)}
                period={analysisPeriod}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
