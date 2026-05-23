'use client'

import { useState, useEffect, useCallback } from 'react'
import InfoTip from '@/components/shared/InfoTip'

/* ─── Inline SVG Icon Components ─── */

function IconDNA({ size = 20, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 15c6.667-6 13.333 0 20-6" /><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" /><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /><path d="M17 6l-2.5-2.5" /><path d="M14 8l-1-1" /><path d="M7 18l2.5 2.5" /><path d="M3.5 14.5l.5.5" /><path d="M20 9l.5.5" /><path d="M6.5 12.5l1 1" /><path d="M16.5 10.5l1 1" /><path d="M10 16l1.5 1.5" />
    </svg>
  )
}

function IconFlask({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 3h6" /><path d="M10 9V3" /><path d="M14 9V3" /><path d="M9 9l-4.5 8.5a2 2 0 0 0 1.7 2.9h10.6a2 2 0 0 0 1.7-2.9L15 9" />
    </svg>
  )
}

function IconRefresh({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
    </svg>
  )
}

function IconTrophy({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function IconArrowRightLeft({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
    </svg>
  )
}

function IconActivity({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  )
}

function IconGitBranch({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function IconSplit({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" /><path d="m15 9 6-6" />
    </svg>
  )
}

function IconZap({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

/* ─── Score Color Helpers ─── */

function scoreColorClass(score) {
  if (score == null) return 'text-base-content/40'
  if (score > 0.6) return 'text-success'
  if (score > 0.35) return 'text-warning'
  return 'text-error'
}

function scoreBadgeClass(score) {
  if (score == null) return 'badge-ghost'
  if (score > 0.6) return 'badge-success'
  if (score > 0.35) return 'badge-warning'
  return 'badge-error'
}

function scoreProgressClass(score) {
  if (score == null) return 'progress-ghost'
  if (score > 0.6) return 'progress-success'
  if (score > 0.35) return 'progress-warning'
  return 'progress-error'
}

function scoreDisplay(score) {
  if (score == null) return '---'
  return (score * 100).toFixed(1) + '%'
}

function triggerTypeBadge(triggerType) {
  const map = {
    manual: 'badge-info',
    optuna: 'badge-secondary',
    ab_test: 'badge-accent',
    performance: 'badge-warning',
    scheduled: 'badge-ghost',
  }
  return map[triggerType] || 'badge-ghost'
}

/* ─── Main Component ─── */

export default function EvolutionPanel() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState(null)
  const [optimizeSymbol, setOptimizeSymbol] = useState('')
  const [actionResult, setActionResult] = useState(null)

  const fetchSummary = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/evolution/summary')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSummary(data)
    } catch (err) {
      console.error('[EvolutionPanel] fetch error:', err)
      setError(err.message || 'Failed to load evolution data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const handleOptimize = async () => {
    if (!optimizeSymbol.trim()) return
    setOptimizing(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/evolution/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: optimizeSymbol.trim().toUpperCase(), nTrials: 10 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setActionResult({
        type: 'optimize',
        success: true,
        message: `Optimization complete for ${data.symbol}: ${data.nTrials} trials, best score ${data.bestVariant ? (data.bestVariant.composite * 100).toFixed(1) + '%' : 'N/A'}`,
      })
      await fetchSummary()
    } catch (err) {
      setActionResult({ type: 'optimize', success: false, message: err.message || 'Optimization failed' })
    } finally {
      setOptimizing(false)
    }
  }

  const handleRotate = async () => {
    setRotating(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/evolution/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: true }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setActionResult({
        type: 'rotate',
        success: true,
        message: data.rotated
          ? `Rotated: ${data.reason}`
          : `No rotation needed: ${data.reason}`,
      })
      await fetchSummary()
    } catch (err) {
      setActionResult({ type: 'rotate', success: false, message: err.message || 'Rotation check failed' })
    } finally {
      setRotating(false)
    }
  }

  /* ─── Loading State ─── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <div className="text-sm text-base-content/60">Loading evolution data...</div>
      </div>
    )
  }

  /* ─── Error State ─── */
  if (error) {
    return (
      <div className="alert alert-error">
        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 className="font-bold">Failed to Load Evolution Data</h3>
          <div className="text-xs mt-1">{error}</div>
        </div>
        <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost" onClick={fetchSummary}>
          <IconRefresh size={14} /> Retry
        </button>
      </div>
    )
  }

  /* ─── Empty State ─── */
  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center">
          <IconDNA size={32} className="text-base-content/30" />
        </div>
        <div className="text-base-content/50 text-sm">No evolution data available</div>
        <button className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary gap-1" onClick={fetchSummary}>
          <IconRefresh size={14} /> Refresh
        </button>
      </div>
    )
  }

  const active = summary.activeVariant
  const compositeScore = active?.scoreComposite ?? null
  const recentEvolutions = (summary.recentEvolutions || []).slice(0, 5)
  const variants = summary.variants || []
  const abTest = summary.activeABTest

  return (
    <div className="space-y-4">

      {/* ─── Active Variant Card ─── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <IconDNA size={16} className="text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Active Variant</h3>
            <InfoTip tip="This strategy variant is currently active in production"><span className="badge badge-success badge-sm ml-auto gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              LIVE
            </span></InfoTip>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Variant Info */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg">{active?.name || 'Unknown'}</span>
                {active?.generation != null && (
                  <InfoTip tip="Generation number — how many optimization cycles this variant has undergone"><span className="badge badge-outline badge-sm">Gen {active.generation}</span></InfoTip>
                )}
              </div>

              {/* Composite Score */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-base-content/50 uppercase tracking-wide">Composite Score<InfoTip tip="Weighted composite of Sharpe, win rate, and max drawdown scores" /></span>
                  <span className={`font-mono font-bold text-xl ${scoreColorClass(compositeScore)}`}>
                    {scoreDisplay(compositeScore)}
                  </span>
                </div>
                <progress
                  className={`progress w-full ${scoreProgressClass(compositeScore)}`}
                  value={compositeScore ?? 0}
                  max="1"
                />
              </div>

              {/* Key Params */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-base-300/30 rounded-lg p-2.5">
                  <div className="text-xs text-base-content/40">Kelly Fraction<InfoTip tip="Kelly criterion fraction used by this variant for position sizing" /></div>
                  <div className="font-mono font-bold text-sm">
                    {active?.kellyFraction != null ? (active.kellyFraction * 100).toFixed(0) + '%' : '---'}
                  </div>
                </div>
                <div className="bg-base-300/30 rounded-lg p-2.5">
                  <div className="text-xs text-base-content/40">Target Vol<InfoTip tip="Target annualized volatility for the strategy" /></div>
                  <div className="font-mono font-bold text-sm">
                    {active?.targetVol != null ? (active.targetVol * 100).toFixed(0) + '%' : '---'}
                  </div>
                </div>
                <div className="bg-base-300/30 rounded-lg p-2.5">
                  <div className="text-xs text-base-content/40">HMM States<InfoTip tip="Number of hidden states in the Hidden Markov Model configuration" /></div>
                  <div className="font-mono font-bold text-sm">
                    {active?.nHmmStates ?? '---'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Performance Summary Grid ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-base-content/50 uppercase tracking-wide">Total Trades</span>
              <span className="text-base-content/30"><IconActivity size={14} /></span>
            </div>
            <div className="text-2xl font-bold font-mono">{summary.totalTrades || 0}</div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-base-content/50 uppercase tracking-wide">Win Rate</span>
              <span className="text-base-content/30"><IconTrophy size={14} /></span>
            </div>
            <div className={`text-2xl font-bold font-mono ${summary.overallWinRate > 0.5 ? 'text-success' : summary.overallWinRate > 0.35 ? 'text-warning' : 'text-error'}`}>
              {summary.overallWinRate != null ? (summary.overallWinRate * 100).toFixed(1) + '%' : '---'}
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-base-content/50 uppercase tracking-wide">Best Score</span>
              <span className="text-base-content/30"><IconTrophy size={14} /></span>
            </div>
            <div className={`text-2xl font-bold font-mono ${scoreColorClass(summary.bestScore)}`}>
              {scoreDisplay(summary.bestScore)}
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-base-content/50 uppercase tracking-wide">Variants</span>
              <span className="text-base-content/30"><IconGitBranch size={14} /></span>
            </div>
            <div className="text-2xl font-bold font-mono">{summary.variantCount || 0}</div>
            <div className="text-xs text-base-content/40 mt-1">Gen {summary.generation || 0}</div>
          </div>
        </div>
      </div>

      {/* ─── Variant Table ─── */}
      {variants.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
                <IconGitBranch size={16} className="text-secondary" />
              </div>
              <h3 className="font-semibold text-sm">Strategy Variants</h3>
              <span className="badge badge-xs badge-ghost ml-auto">{variants.length} total</span>
            </div>
            {/* Variant Table — Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Name</th>
                    <th className="text-xs">Gen</th>
                    <th className="text-xs">Composite</th>
                    <th className="text-xs">Sharpe</th>
                    <th className="text-xs">Win Rate</th>
                    <th className="text-xs">Max DD</th>
                    <th className="text-xs">Trades</th>
                    <th className="text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const score = v.scoreComposite
                    const sharpe = v.scoreSharpe
                    const winRate = v.scoreWinRate
                    const maxDd = v.scoreMaxDd
                    const trades = v.totalTrades || 0
                    return (
                      <tr key={v.id} className={v.isActive ? 'bg-primary/5' : ''}>
                        <td>
                          <span className="font-mono text-sm font-medium">{v.name || '---'}</span>
                        </td>
                        <td>
                          <span className="badge badge-xs badge-ghost">{v.generation || 0}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <progress
                              className={`progress w-12 ${scoreProgressClass(score)}`}
                              value={score ?? 0}
                              max="1"
                            />
                            <span className={`font-mono text-xs ${scoreColorClass(score)}`}>
                              {scoreDisplay(score)}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-xs">
                          {sharpe != null ? sharpe.toFixed(3) : '---'}
                        </td>
                        <td>
                          <span className={`font-mono text-xs ${winRate != null ? (winRate > 0.5 ? 'text-success' : winRate > 0.35 ? 'text-warning' : 'text-error') : ''}`}>
                            {winRate != null ? (winRate * 100).toFixed(1) + '%' : '---'}
                          </span>
                        </td>
                        <td>
                          <span className={`font-mono text-xs ${maxDd != null ? (maxDd > 0.35 ? 'text-error' : maxDd > 0.2 ? 'text-warning' : 'text-success') : ''}`}>
                            {maxDd != null ? (maxDd * 100).toFixed(1) + '%' : '---'}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{trades}</td>
                        <td>
                          {v.isActive ? (
                            <span className="badge badge-xs badge-success gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                              Active
                            </span>
                          ) : v.isDefault ? (
                            <span className="badge badge-xs badge-outline">Default</span>
                          ) : (
                            <span className="badge badge-xs badge-ghost">Inactive</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Variant Cards — Mobile */}
            <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
              {variants.map((v) => {
                const score = v.scoreComposite
                const sharpe = v.scoreSharpe
                const winRate = v.scoreWinRate
                const maxDd = v.scoreMaxDd
                const trades = v.totalTrades || 0
                return (
                  <div key={v.id} className={`card p-3 ${v.isActive ? 'bg-primary/10' : 'bg-base-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold font-mono">{v.name || '---'}</span>
                      {v.isActive ? (
                        <span className="badge badge-xs badge-success gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                          Active
                        </span>
                      ) : v.isDefault ? (
                        <span className="badge badge-xs badge-outline">Default</span>
                      ) : (
                        <span className="badge badge-xs badge-ghost">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <progress
                        className={`progress flex-1 ${scoreProgressClass(score)}`}
                        value={score ?? 0}
                        max="1"
                      />
                      <span className={`font-mono text-sm font-bold ${scoreColorClass(score)}`}>
                        {scoreDisplay(score)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-base-content/50">Gen:</span> <span className="badge badge-xs badge-ghost">{v.generation || 0}</span></div>
                      <div><span className="text-base-content/50">Trades:</span> <span className="font-mono">{trades}</span></div>
                      <div><span className="text-base-content/50">Sharpe:</span> <span className="font-mono">{sharpe != null ? sharpe.toFixed(3) : '---'}</span></div>
                      <div><span className="text-base-content/50">WR:</span> <span className={`font-mono ${winRate != null ? (winRate > 0.5 ? 'text-success' : winRate > 0.35 ? 'text-warning' : 'text-error') : ''}`}>{winRate != null ? (winRate * 100).toFixed(1) + '%' : '---'}</span></div>
                      <div><span className="text-base-content/50">Max DD:</span> <span className={`font-mono ${maxDd != null ? (maxDd > 0.35 ? 'text-error' : maxDd > 0.2 ? 'text-warning' : 'text-success') : ''}`}>{maxDd != null ? (maxDd * 100).toFixed(1) + '%' : '---'}</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent Evolution Log ─── */}
      {recentEvolutions.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                <IconArrowRightLeft size={16} className="text-info" />
              </div>
              <h3 className="font-semibold text-sm">Recent Evolution Log</h3>
              <span className="badge badge-xs badge-ghost ml-auto">Last {recentEvolutions.length}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentEvolutions.map((entry) => {
                const delta = entry.scoreDelta
                const isPositive = delta != null && delta > 0
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 bg-base-300/30 rounded-lg px-3 py-2.5"
                  >
                    {/* From → To */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-mono text-xs truncate max-w-[120px]" title={entry.fromVariantId || 'None'}>
                        {entry.fromVariantId ? entry.fromVariantId.slice(0, 8) + '...' : 'None'}
                      </span>
                      <IconArrowRightLeft size={12} className="text-base-content/30 flex-shrink-0" />
                      <span className="font-mono text-xs truncate max-w-[120px] font-medium" title={entry.toVariantId}>
                        {entry.toVariantId ? entry.toVariantId.slice(0, 8) + '...' : '---'}
                      </span>
                    </div>

                    {/* Trigger Type */}
                    <span className={`badge badge-xs ${triggerTypeBadge(entry.triggerType)}`}>
                      {entry.triggerType || 'unknown'}
                    </span>

                    {/* Reason */}
                    {entry.triggerReason && (
                      <span className="text-xs text-base-content/50 truncate max-w-[200px]" title={entry.triggerReason}>
                        {entry.triggerReason}
                      </span>
                    )}

                    {/* Score Delta */}
                    <span className={`font-mono text-xs font-medium flex-shrink-0 ${delta == null ? 'text-base-content/30' : isPositive ? 'text-success' : 'text-error'}`}>
                      {delta != null ? (isPositive ? '+' : '') + (delta * 100).toFixed(1) + '%' : '---'}
                    </span>

                    {/* Timestamp */}
                    {entry.createdAt && (
                      <span className="text-xs text-base-content/30 flex-shrink-0">
                        {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── A/B Test Status ─── */}
      {abTest && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <IconSplit size={16} className="text-accent" />
              </div>
              <h3 className="font-semibold text-sm">A/B Test Active</h3>
              <span className="badge badge-xs badge-accent ml-auto gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
                RUNNING
              </span>
            </div>

            <div className="space-y-3">
              {/* Test Name */}
              <div className="text-sm font-medium">{abTest.name || 'Unnamed Test'}</div>

              {/* Variant Comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-base-300/30 rounded-lg p-3 border border-info/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="badge badge-xs badge-info">A</span>
                    <span className="text-xs text-base-content/50">Control<InfoTip tip="Current champion variant — the one in production" /></span>
                  </div>
                  <div className="font-mono text-sm font-medium truncate" title={abTest.variantAId}>
                    {abTest.variantAId ? abTest.variantAId.slice(0, 12) + '...' : '---'}
                  </div>
                </div>
                <div className="bg-base-300/30 rounded-lg p-3 border border-secondary/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="badge badge-xs badge-secondary">B</span>
                    <span className="text-xs text-base-content/50">Challenger<InfoTip tip="New variant being tested against the control" /></span>
                  </div>
                  <div className="font-mono text-sm font-medium truncate" title={abTest.variantBId}>
                    {abTest.variantBId ? abTest.variantBId.slice(0, 12) + '...' : '---'}
                  </div>
                </div>
              </div>

              {/* Allocation */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-base-content/50">Allocation to B</span>
                  <span className="font-mono text-xs font-medium">
                    {abTest.allocationPct != null ? (abTest.allocationPct * 100).toFixed(0) + '%' : '50%'}
                  </span>
                </div>
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-base-300">
                  <div
                    className="bg-info rounded-l-full transition-all duration-500"
                    style={{ width: `${(1 - (abTest.allocationPct || 0.5)) * 100}%` }}
                  />
                  <div
                    className="bg-secondary rounded-r-full transition-all duration-500"
                    style={{ width: `${(abTest.allocationPct || 0.5) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-base-content/30">
                  <span>A</span>
                  <span>B</span>
                </div>
              </div>

              {/* Started At */}
              {abTest.startedAt && (
                <div className="text-xs text-base-content/40">
                  Started {new Date(abTest.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <IconFlask size={16} className="text-warning" />
            </div>
            <h3 className="font-semibold text-sm">Evolution Actions</h3>
          </div>

          <div className="space-y-3">
            {/* Optimize */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Symbol (e.g. AAPL)"
                  className="input input-sm input-bordered w-full font-mono"
                  value={optimizeSymbol}
                  onChange={(e) => setOptimizeSymbol(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOptimize()}
                  disabled={optimizing}
                />
              </div>
              <button
                className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm gap-1.5 min-w-[140px]"
                onClick={handleOptimize}
                disabled={optimizing || !optimizeSymbol.trim()}
              >
                {optimizing ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Optimizing...
                  </>
                ) : (
                  <>
                    <IconFlask size={14} />
                    Optimize
                  </>
                )}
              </button>
            </div>

            {/* Check Rotation */}
            <button
              className="btn btn-secondary min-h-[44px] sm:min-h-0 sm:btn-sm gap-1.5"
              onClick={handleRotate}
              disabled={rotating}
            >
              {rotating ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Checking...
                </>
              ) : (
                <>
                  <IconZap size={14} />
                  Check Rotation
                </>
              )}
            </button>

            {/* Refresh */}
            <button
              className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm gap-1.5"
              onClick={fetchSummary}
            >
              <IconRefresh size={14} />
              Refresh Data
            </button>
          </div>

          {/* Action Result Feedback */}
          {actionResult && (
            <div className={`alert mt-3 ${actionResult.success ? 'alert-success' : 'alert-error'}`}>
              {actionResult.success ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div>
                <div className="text-sm font-medium">{actionResult.success ? 'Success' : 'Error'}</div>
                <div className="text-xs mt-0.5">{actionResult.message}</div>
              </div>
              <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => setActionResult(null)}>Dismiss</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
