'use client'

import { useState, useCallback } from 'react'
import PriceFanChart from './PriceFanChart'
import { notifySuccess, notifyError } from '@/lib/notifications'

export default function SimulationPanel({ symbol, prices = [], currentPrice = null }) {
  const [horizon, setHorizon] = useState(20)
  const [nPaths, setNPaths] = useState(500)
  const [seed, setSeed] = useState(42)
  const [simulation, setSimulation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const canSimulate = prices.length >= 81

  const runSimulation = useCallback(async () => {
    if (!canSimulate || !symbol) return
    setLoading(true)
    setError(null)
    setSimulation(null)

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, prices, horizon,
          n_paths: nPaths, seed,
          ...(currentPrice ? { current_price: currentPrice } : {}),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setSimulation(data)
      notifySuccess(`Simulation complete for ${symbol}`)
    } catch (err) {
      setError(err.message || 'Simulation failed')
      notifyError(`Simulation failed: ${err.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [symbol, prices, horizon, nPaths, seed, currentPrice, canSimulate])

  if (!canSimulate) {
    return (
      <div className="alert alert-warning">
        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-sm">Need at least 81 price bars for simulation (have {prices.length})</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Configuration Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs font-mono">Horizon <span className="badge badge-xs badge-ghost">{horizon} bars</span></span>
          </label>
          <input type="range" min={1} max={252} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="range range-xs range-primary" />
          <div className="flex justify-between text-xs opacity-40 px-1 mt-0.5"><span>1</span><span>63</span><span>126</span><span>252</span></div>
        </div>
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs font-mono">Paths <span className="badge badge-xs badge-ghost">{nPaths}</span></span>
          </label>
          <input type="range" min={50} max={5000} step={50} value={nPaths} onChange={(e) => setNPaths(Number(e.target.value))} className="range range-xs range-primary" />
          <div className="flex justify-between text-xs opacity-40 px-1 mt-0.5"><span>50</span><span>1250</span><span>2500</span><span>5000</span></div>
        </div>
        <div className="form-control">
          <label className="label py-1"><span className="label-text text-xs font-mono">Seed</span></label>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="input input-sm input-bordered font-mono w-full" min={0} />
        </div>
      </div>

      {/* Run Button */}
      <div className="flex items-center gap-3">
        <button className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm gap-1 ${loading ? 'btn-ghost' : 'btn-primary'}`} onClick={runSimulation} disabled={loading}>
          {loading ? (<><span className="loading loading-spinner loading-xs" />Simulating...</>) : (<><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>Run Simulation</>)}
        </button>
        {simulation && <span className="text-xs text-base-content/50">{nPaths} paths × {horizon} steps</span>}
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error alert-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm">{error}</span>
          <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={runSimulation}>Retry</button>
        </div>
      )}

      {/* Results */}
      {simulation && (
        <div className="space-y-4">
          <PriceFanChart simulation={simulation} currentPrice={currentPrice} />
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Return Mean" value={`${((simulation.return_mean ?? 0) * 100).toFixed(2)}%`} color={(simulation.return_mean ?? 0) >= 0 ? 'text-success' : 'text-error'} />
            <MetricCard label="Return VaR 95" value={`${((simulation.return_var95 ?? 0) * 100).toFixed(2)}%`} color="text-error" />
            <MetricCard label="Paths Positive" value={`${((simulation.pct_paths_positive ?? 0) * 100).toFixed(1)}%`} color={(simulation.pct_paths_positive ?? 0) > 0.5 ? 'text-success' : 'text-error'} />
            <MetricCard label="Max DD (mean)" value={`${((simulation.max_drawdown_mean ?? 0) * 100).toFixed(2)}%`} color="text-error" />
          </div>
          {/* Regime Transition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card bg-base-300 rounded-lg">
              <div className="card-body p-3">
                <h4 className="text-xs font-mono opacity-50 mb-2">REGIME TRANSITION</h4>
                <div className="flex items-center gap-3">
                  <span className="badge badge-outline">{simulation.current_regime || '—'}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  <span className="badge badge-primary">{simulation.terminal_regime_mode || '—'}</span>
                </div>
                {simulation.step_dominant_regime?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs opacity-40 mb-1">Regime path (dominant)</p>
                    <div className="flex flex-wrap gap-1">
                      {simulation.step_dominant_regime.map((regime, i) => (
                        <span key={i} className={`badge badge-xs ${regime?.includes('bear') ? 'badge-error' : regime?.includes('bull') ? 'badge-success' : 'badge-warning'} badge-outline`} title={`Step ${i + 1}: ${regime}`}>{i + 1}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="card bg-base-300 rounded-lg">
              <div className="card-body p-3">
                <h4 className="text-xs font-mono opacity-50 mb-2">RETURN DISTRIBUTION</h4>
                <div className="space-y-1.5">
                  <StatRow label="Mean" value={simulation.return_mean} fmt="pct" />
                  <StatRow label="Std Dev" value={simulation.return_std} fmt="pct" />
                  <StatRow label="VaR 95" value={simulation.return_var95} fmt="pct" />
                  <StatRow label="CVaR 95" value={simulation.return_cvar95} fmt="pct" />
                </div>
              </div>
            </div>
          </div>
          {/* Expected Risk Multiplier */}
          {simulation.expected_risk_mult?.length > 0 && (
            <div className="card bg-base-300 rounded-lg">
              <div className="card-body p-3">
                <h4 className="text-xs font-mono opacity-50 mb-2">EXPECTED RISK MULTIPLIER PATH</h4>
                <div className="flex items-end gap-0.5 h-16">
                  {simulation.expected_risk_mult.map((mult, i) => {
                    const maxMult = Math.max(...simulation.expected_risk_mult, 1)
                    const heightPct = Math.min((mult / maxMult) * 100, 100)
                    const color = mult >= 1.0 ? 'bg-warning' : mult >= 0.5 ? 'bg-info' : 'bg-error'
                    return <div key={i} className={`flex-1 ${color} rounded-t-sm opacity-70 hover:opacity-100 transition-opacity`} style={{ height: `${heightPct}%` }} title={`Step ${i + 1}: ${mult.toFixed(3)}×`} />
                  })}
                </div>
                <div className="flex justify-between text-xs opacity-30 mt-1"><span>t+1</span><span>t+{simulation.expected_risk_mult.length}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, color = '' }) {
  return (
    <div className="stat bg-base-300 rounded-lg p-3">
      <div className="stat-title text-xs">{label}</div>
      <div className={`stat-value text-lg font-mono ${color}`}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, fmt = 'raw' }) {
  const display = value != null ? fmt === 'pct' ? `${(value * 100).toFixed(2)}%` : String(value) : '—'
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="opacity-60">{label}</span>
      <span className="font-mono font-bold">{display}</span>
    </div>
  )
}
