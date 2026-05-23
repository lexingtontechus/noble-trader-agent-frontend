'use client'

import { useState, useEffect, useCallback } from 'react'
import PriceChart from '@/components/analysis/PriceChart'
import RegimeCard from '@/components/analysis/RegimeCard'
import ObservationFeatures from '@/components/analysis/ObservationFeatures'
import RiskCard from '@/components/analysis/RiskCard'
import RecommendationsCard from '@/components/analysis/RecommendationsCard'
import CommentaryCard from '@/components/analysis/CommentaryCard'
import InfoTip from '@/components/shared/InfoTip'

/**
 * CommentaryCardWrapper — fetches AI commentary for a symbol's regime/risk data
 */
function CommentaryCardWrapper({ symbol, regime, sizing, risk }) {
  const [commentary, setCommentary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchCommentary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, regime, sizing, risk }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setCommentary('')
      } else {
        setCommentary(data.commentary || 'No commentary available.')
      }
    } catch (err) {
      setError(err.message || 'Network error')
      setCommentary('')
    } finally {
      setLoading(false)
    }
  }, [symbol, regime, sizing, risk])

  useEffect(() => {
    if (regime?.regime_label) {
      fetchCommentary()
    }
  }, [regime?.regime_label, fetchCommentary])

  if (loading) {
    return <CommentaryCard commentary="" loading={true} />
  }

  if (error) {
    return (
      <div className="alert alert-warning py-2 px-3 text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>AI commentary unavailable: {error}</span>
        <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost ml-auto" onClick={fetchCommentary}>Retry</button>
      </div>
    )
  }

  return <CommentaryCard commentary={commentary} loading={false} />
}

/**
 * PortfolioAnalysisCard — renders a single symbol's full analysis
 * Mirrors the dashboard's TickerCard layout: header + chart + accordion sections
 */
export default function PortfolioAnalysisCard({ symbol, data, loading, error, onRetry, period }) {
  const [openSections, setOpenSections] = useState({
    regime: true,
    hmm: false,
    risk: false,
    recommendations: false,
    commentary: false,
  })

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Loading state
  if (loading) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-3">
            <div className="skeleton h-6 w-24"></div>
            <div className="skeleton h-6 w-16"></div>
          </div>
          <div className="skeleton h-40 w-full mb-3"></div>
          <div className="skeleton h-8 w-full mb-2"></div>
          <div className="skeleton h-8 w-full mb-2"></div>
          <div className="skeleton h-8 w-full"></div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between mb-3">
            <h3 className="card-title text-lg">{symbol}</h3>
          </div>
          <div className="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
            {onRetry && (
              <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost" onClick={onRetry}>Retry</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const analysis = data.analysis || {}
  const regime = analysis.regime || {}
  const sizing = analysis.sizing || {}
  const risk = analysis.risk || {}
  const prices = data.prices || []
  const dates = data.dates || []

  // Calculate return metrics
  const lastPrice = prices.length > 0 ? prices[prices.length - 1] : null
  const firstPrice = prices.length > 0 ? prices[0] : null
  const totalReturn = firstPrice && lastPrice ? (lastPrice - firstPrice) / firstPrice : null
  const isPositiveReturn = totalReturn != null && totalReturn >= 0

  // Position context from orders
  const positionInfo = data.positionInfo || null

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <h3 className="card-title text-lg">{symbol}</h3>
            {positionInfo && (
              <InfoTip tip={positionInfo.netSide === 'long' ? 'Net position direction based on order history: more buys than sells' : positionInfo.netSide === 'short' ? 'Net position direction: more sells than buys' : ''}>
                <span className={`badge badge-sm ${positionInfo.netSide === 'long' ? 'badge-success' : positionInfo.netSide === 'short' ? 'badge-error' : 'badge-ghost'}`}>
                  {positionInfo.netSide === 'long' ? 'LONG' : positionInfo.netSide === 'short' ? 'SHORT' : '—'}
                </span>
              </InfoTip>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastPrice != null && (
              <span className="text-lg font-bold font-mono">
                {lastPrice.toFixed(2)}
              </span>
            )}
            {totalReturn != null && (
              <span className={`badge ${isPositiveReturn ? 'badge-success' : 'badge-error'}`}>
                {isPositiveReturn ? '▲' : '▼'} {(Math.abs(totalReturn) * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Position Context Bar */}
        {positionInfo && (
          <div className="flex flex-wrap gap-3 text-xs text-base-content/60 mb-2 bg-base-300/50 rounded-lg px-3 py-2">
            {positionInfo.totalQty > 0 && (
              <span>Qty: <strong className="text-base-content">{positionInfo.totalQty}</strong></span>
            )}
            {positionInfo.avgPrice > 0 && (
              <span>Avg: <strong className="text-base-content">${positionInfo.avgPrice.toFixed(2)}</strong></span>
            )}
            {positionInfo.fillCount > 0 && (
              <span>Fills: <strong className="text-base-content">{positionInfo.fillCount}</strong></span>
            )}
          </div>
        )}

        {/* Price Chart */}
        <PriceChart
          prices={prices}
          dates={dates}
          regimeLabel={regime.regime_label}
        />

        {/* Accordion: Regime State (default open) */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.regime}
            onChange={() => toggleSection('regime')}
          />
          <div className="collapse-title text-sm font-semibold">
            🏛️ Regime State<InfoTip tip="Hidden Markov Model regime detection — identifies market state (bull/bear/neutral)" />
          </div>
          <div className="collapse-content">
            <RegimeCard data={regime} />
          </div>
        </div>

        {/* Accordion: HMM Features */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.hmm}
            onChange={() => toggleSection('hmm')}
          />
          <div className="collapse-title text-sm font-semibold">
            🔬 HMM Features<InfoTip tip="Hidden Markov Model observation features used for regime classification" />
          </div>
          <div className="collapse-content">
            <ObservationFeatures data={analysis} />
          </div>
        </div>

        {/* Accordion: Risk Metrics */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.risk}
            onChange={() => toggleSection('risk')}
          />
          <div className="collapse-title text-sm font-semibold">
            ⚠️ Risk Metrics<InfoTip tip="Value at Risk, CVaR, drawdown, and volatility analysis" />
          </div>
          <div className="collapse-content">
            <RiskCard data={risk} />
          </div>
        </div>

        {/* Accordion: Recommendations */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.recommendations}
            onChange={() => toggleSection('recommendations')}
          />
          <div className="collapse-title text-sm font-semibold">
            💡 Recommendations<InfoTip tip="Strategy-driven position sizing and trade recommendations" />
          </div>
          <div className="collapse-content">
            <RecommendationsCard data={analysis} />
          </div>
        </div>

        {/* Accordion: AI Commentary */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.commentary}
            onChange={() => toggleSection('commentary')}
          />
          <div className="collapse-title text-sm font-semibold">
            🤖 AI Commentary<InfoTip tip="LLM-generated market analysis and interpretation" />
          </div>
          <div className="collapse-content">
            <CommentaryCardWrapper symbol={symbol} regime={regime} sizing={sizing} risk={risk} />
          </div>
        </div>
      </div>
    </div>
  )
}
