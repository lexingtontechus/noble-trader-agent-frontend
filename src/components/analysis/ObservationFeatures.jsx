'use client'

import { useState, useEffect, useCallback } from 'react'

function FeatureBar({ index, label, value, max = 1, color = 'progress-primary' }) {
  const pct = Math.min(Math.abs(value) / max * 100, 100)
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span>
          <span className="badge badge-ghost badge-xs font-mono mr-1">[{index}]</span>
          {label}
        </span>
        <span className="font-mono opacity-70">{typeof value === 'number' ? value.toFixed(4) : '—'}</span>
      </div>
      <progress className={`progress ${color} w-full`} value={pct} max="100" />
    </div>
  )
}

function Section({ title, defaultOpen, children }) {
  return (
    <div className="collapse collapse-arrow bg-base-200 mb-2">
      <input type="checkbox" defaultChecked={defaultOpen} />
      <div className="collapse-title text-sm font-medium">{title}</div>
      <div className="collapse-content">{children}</div>
    </div>
  )
}

// Feature index → section mapping (mirrors backend obs_builder.py F class)
const FEATURE_SECTIONS = [
  { title: 'Returns [0–2]', range: [0, 2], defaultOpen: true, color: 'progress-info',
    labels: ['Log Return (1-bar)', 'Log Return (3-bar)', 'Log Return (10-bar)'] },
  { title: 'Volatility [3–5]', range: [3, 5], defaultOpen: true, color: 'progress-warning',
    labels: ['Normalized ATR', 'Rolling Volatility', 'EMA Distance'] },
  { title: 'Derived [6–9]', range: [6, 9], defaultOpen: false, color: 'progress-secondary',
    labels: ['HHLL Score', 'Vol Percentile', 'ATR Ratio', 'Vol Slope'] },
  { title: 'HMM Raw Posteriors [10–13]', range: [10, 13], defaultOpen: false, color: 'progress-accent',
    labels: ['Vol Posterior 0', 'Vol Posterior 1', 'Vol Posterior 2', 'Vol Posterior 3'] },
]

export default function ObservationFeatures({ data, symbol, period }) {
  const [observation, setObservation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [obsError, setObsError] = useState('')

  const regime = data?.regime || data || {}
  const volProbs = Object.entries(regime.vol_probs || {})
  const trendProbs = Object.entries(regime.trend_probs || {})
  const confidence = regime.confidence ?? 0

  // Check if we already have the observation vector from the parent data
  const hasFullVector = !!(data?.observation_vector || data?.obs)

  // Fetch observation vector from the new /api/observation/build endpoint
  const fetchObservation = useCallback(async () => {
    if (!symbol) return
    // Skip if we already have the full vector from parent data
    if (hasFullVector) return

    setLoading(true)
    setObsError('')
    try {
      const res = await fetch('/api/observation/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period: period || '1y' }),
      })
      const obsData = await res.json()

      if (!res.ok) {
        // Check for SERVICE_STARTING
        if (obsData.code === 'SERVICE_STARTING') {
          setObsError('Backend is starting up...')
          return
        }
        throw new Error(obsData.error || 'Observation build failed')
      }

      setObservation(obsData)
    } catch (err) {
      setObsError(err.message)
    } finally {
      setLoading(false)
    }
  }, [symbol, period, hasFullVector])

  useEffect(() => {
    fetchObservation()
  }, [fetchObservation])

  // Merge: prefer fetched observation, fall back to parent data
  const obsVector = observation?.observation_vector || data?.observation_vector || data?.obs || null
  const featureLabels = observation?.feature_labels || null
  const isMarkovUniform = observation?.is_markov_uniform ?? false
  const displayFullVector = !!obsVector

  // Build the Markov features (14-19) from observation vector or regime data
  const getFeatureValue = (index) => {
    if (obsVector && obsVector[index] !== undefined) {
      return obsVector[index]
    }
    return null // Will show as 0 with placeholder
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Observation Features
          <span className="badge badge-ghost badge-sm">24-dim</span>
          {displayFullVector && (
            <span className="badge badge-success badge-sm">Live</span>
          )}
        </h2>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 mt-2">
            <span className="loading loading-spinner loading-sm"></span>
            <span className="text-xs text-base-content/60">Building 24-feature observation vector...</span>
          </div>
        )}

        {/* Error state */}
        {obsError && !loading && (
          <div className="alert alert-warning mt-2 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs">{obsError}</span>
            <button className="btn btn-xs btn-ghost" onClick={fetchObservation}>Retry</button>
          </div>
        )}

        {/* Markov uniform warning */}
        {displayFullVector && isMarkovUniform && (
          <div className="alert alert-warning mt-2 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs">Markov features (14-19) appear uniform — HMM may not have converged yet.</span>
          </div>
        )}

        {!displayFullVector && !loading && (
          <div className="alert alert-info text-xs mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Full 24-feature vector requires the observation builder endpoint.
              Showing regime-derived features below.
            </span>
          </div>
        )}

        {/* Render sections from the observation vector */}
        {FEATURE_SECTIONS.map((section) => (
          <Section key={section.title} title={section.title} defaultOpen={section.defaultOpen}>
            {section.labels.map((label, i) => {
              const idx = section.range[0] + i
              const val = getFeatureValue(idx)
              return (
                <FeatureBar
                  key={idx}
                  index={idx}
                  label={featureLabels?.[idx] || label}
                  value={val ?? 0}
                  color={section.color}
                />
              )
            })}
            {!displayFullVector && (
              <p className="text-xs opacity-40 italic mt-1">Requires raw observation vector</p>
            )}
          </Section>
        ))}

        {/* Markov (14-19) — from regime or observation vector */}
        <Section title="Markov Probabilities [14–19]" defaultOpen={true}>
          {displayFullVector ? (
            <>
              <div className="text-xs font-medium opacity-60 mb-1 mt-1">Vol Probabilities</div>
              {[14, 15, 16].map((idx) => (
                <FeatureBar
                  key={idx}
                  index={idx}
                  label={featureLabels?.[idx] || `feature_${idx}`}
                  value={obsVector[idx] ?? 0}
                  color="progress-info"
                />
              ))}
              <div className="text-xs font-medium opacity-60 mb-1 mt-2">Trend Probabilities</div>
              {[17, 18, 19].map((idx) => (
                <FeatureBar
                  key={idx}
                  index={idx}
                  label={featureLabels?.[idx] || `feature_${idx}`}
                  value={obsVector[idx] ?? 0}
                  color="progress-accent"
                />
              ))}
            </>
          ) : (
            <>
              {volProbs.length > 0 ? (
                <>
                  <div className="text-xs font-medium opacity-60 mb-1 mt-1">Vol Probabilities</div>
                  {volProbs.map(([key, val], i) => (
                    <FeatureBar
                      key={`vol-${key}`}
                      index={14 + i}
                      label={`vol_prob_${key}`}
                      value={val}
                      color="progress-info"
                    />
                  ))}
                </>
              ) : (
                <>
                  <FeatureBar index={14} label="vol_prob_low" value={0} color="progress-info" />
                  <FeatureBar index={15} label="vol_prob_med" value={0} color="progress-info" />
                  <FeatureBar index={16} label="vol_prob_high" value={0} color="progress-info" />
                </>
              )}
              {trendProbs.length > 0 ? (
                <>
                  <div className="text-xs font-medium opacity-60 mb-1 mt-2">Trend Probabilities</div>
                  {trendProbs.map(([key, val], i) => (
                    <FeatureBar
                      key={`trend-${key}`}
                      index={17 + i}
                      label={`trend_prob_${key}`}
                      value={val}
                      color="progress-accent"
                    />
                  ))}
                </>
              ) : (
                <>
                  <FeatureBar index={17} label="trend_prob_down" value={0} color="progress-accent" />
                  <FeatureBar index={18} label="trend_prob_neutral" value={0} color="progress-accent" />
                  <FeatureBar index={19} label="trend_prob_up" value={0} color="progress-accent" />
                </>
              )}
            </>
          )}
        </Section>

        {/* Quality (20-21) */}
        <Section title="Quality [20–21]" defaultOpen={true}>
          <FeatureBar
            index={20}
            label={featureLabels?.[20] || "Regime Quality"}
            value={displayFullVector ? (obsVector[20] ?? 0) : confidence}
            color="progress-success"
          />
          <FeatureBar
            index={21}
            label={featureLabels?.[21] || "State Confidence"}
            value={displayFullVector ? (obsVector[21] ?? 0) : confidence}
            color="progress-success"
          />
          <p className="text-xs opacity-40 mt-1">
            {displayFullVector
              ? `From observation builder: quality=${(obsVector[20] * 100).toFixed(1)}%, confidence=${(obsVector[21] * 100).toFixed(1)}%`
              : `Both derived from regime confidence: ${(confidence * 100).toFixed(1)}%`
            }
          </p>
        </Section>

        {/* Position (22-23) */}
        <Section title="Position [22–23]" defaultOpen={true}>
          <FeatureBar
            index={22}
            label={featureLabels?.[22] || "Masaniello Pressure f×(1−f)"}
            value={displayFullVector
              ? (obsVector[22] ?? 0)
              : (data?.sizing ? data.sizing.recommended_f * (1 - (data.sizing.recommended_f || 0)) : 0)
            }
            color="progress-warning"
          />
          <FeatureBar
            index={23}
            label={featureLabels?.[23] || "Drawdown Factor"}
            value={displayFullVector
              ? (obsVector[23] ?? 0)
              : (1 - (data?.risk?.max_drawdown ?? 0))
            }
            color="progress-error"
          />
          {displayFullVector && (
            <p className="text-xs opacity-40 mt-1">
              Pressure: {(obsVector[22] ?? 0).toFixed(4)}
              {' | '}DD Factor: {((obsVector[23] ?? 0) * 100).toFixed(1)}%
            </p>
          )}
          {!displayFullVector && data?.sizing && (
            <p className="text-xs opacity-40 mt-1">
              Pressure: {((data.sizing.recommended_f || 0) * (1 - (data.sizing.recommended_f || 0))).toFixed(4)}
              {' | '}DD Factor: {((1 - (data.risk?.max_drawdown ?? 0)) * 100).toFixed(1)}%
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}
