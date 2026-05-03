'use client'

import { useState, useEffect, useCallback } from 'react'
import PriceChart from '@/components/analysis/PriceChart'
import RegimeCard from '@/components/analysis/RegimeCard'
import ObservationFeatures from '@/components/analysis/ObservationFeatures'
import RiskCard from '@/components/analysis/RiskCard'
import RecommendationsCard from '@/components/analysis/RecommendationsCard'
import CommentaryCard from '@/components/analysis/CommentaryCard'

function CommentaryCardWrapper({ symbol, regime, sizing, risk }) {
  const [commentary, setCommentary] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchCommentary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, regime, sizing, risk }),
      })
      const data = await res.json()
      setCommentary(data.commentary || 'No commentary available.')
    } catch {
      setCommentary('AI commentary temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [symbol, regime, sizing, risk])

  useEffect(() => {
    if (regime?.regime_label) {
      fetchCommentary()
    }
  }, [regime?.regime_label, fetchCommentary])

  return <CommentaryCard commentary={commentary} loading={loading} />
}

export default function SearchResults({ data, onBuySell }) {
  if (!data) return null

  const { symbol, period, prices, dates, analysis } = data
  const regime = analysis?.regime || {}
  const risk = analysis?.risk || {}
  const sizing = analysis?.sizing || {}

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Buy/Sell Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button className="btn btn-success btn-sm" onClick={() => onBuySell(symbol)}>
          Buy {symbol}
        </button>
        <button className="btn btn-error btn-sm" onClick={() => onBuySell(symbol)}>
          Sell {symbol}
        </button>
        <span className="badge badge-outline badge-sm">{period}</span>
        <span className="badge badge-ghost badge-sm">{prices?.length || 0} bars</span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Price Chart + Regime */}
        <div className="space-y-4">
          <PriceChart prices={prices} dates={dates} regimeLabel={regime.regime_label} />
          <div className="collapse collapse-arrow bg-base-300 rounded-lg">
            <input type="radio" name="search-accordion" defaultChecked />
            <div className="collapse-title text-sm font-semibold">
              🏛️ Regime State
            </div>
            <div className="collapse-content">
              <RegimeCard data={regime} />
            </div>
          </div>
        </div>

        {/* Right column: Features, Risk, Sizing, Commentary */}
        <div className="space-y-4">
          <div className="collapse collapse-arrow bg-base-300 rounded-lg">
            <input type="radio" name="search-accordion-b" defaultChecked />
            <div className="collapse-title text-sm font-semibold">
              🔬 HMM Features
            </div>
            <div className="collapse-content">
              <ObservationFeatures data={analysis} />
            </div>
          </div>
          <div className="collapse collapse-arrow bg-base-300 rounded-lg">
            <input type="radio" name="search-accordion-b" />
            <div className="collapse-title text-sm font-semibold">
              ⚠️ Risk Metrics
            </div>
            <div className="collapse-content">
              <RiskCard data={risk} />
            </div>
          </div>
          <div className="collapse collapse-arrow bg-base-300 rounded-lg">
            <input type="radio" name="search-accordion-b" />
            <div className="collapse-title text-sm font-semibold">
              💡 Recommendations
            </div>
            <div className="collapse-content">
              <RecommendationsCard data={analysis} />
            </div>
          </div>
          <div className="collapse collapse-arrow bg-base-300 rounded-lg">
            <input type="radio" name="search-accordion-b" />
            <div className="collapse-title text-sm font-semibold">
              🤖 AI Commentary
            </div>
            <div className="collapse-content">
              <CommentaryCardWrapper symbol={symbol} regime={regime} sizing={sizing} risk={risk} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
