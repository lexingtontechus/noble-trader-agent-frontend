'use client'

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

export default function ObservationFeatures({ data }) {
  if (!data) return null

  const regime = data.regime || data
  const volProbs = Object.entries(regime.vol_probs || {})
  const trendProbs = Object.entries(regime.trend_probs || {})
  const confidence = regime.confidence ?? 0
  const riskMult = regime.risk_multiplier ?? 0

  const hasFullVector = !!(data.observation_vector || data.obs)

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Observation Features
          <span className="badge badge-ghost badge-sm">24-dim</span>
        </h2>

        {!hasFullVector && (
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

        {/* Returns (0-2) */}
        <Section title="Returns [0–2]" defaultOpen={true}>
          <FeatureBar index={0} label="Log Return (1-bar)" value={0} color="progress-info" />
          <FeatureBar index={1} label="Log Return (3-bar)" value={0} color="progress-info" />
          <FeatureBar index={2} label="Log Return (10-bar)" value={0} color="progress-info" />
          {!hasFullVector && (
            <p className="text-xs opacity-40 italic mt-1">Requires raw observation vector</p>
          )}
        </Section>

        {/* Volatility (3-5) */}
        <Section title="Volatility [3–5]" defaultOpen={true}>
          <FeatureBar index={3} label="Normalized ATR" value={0} color="progress-warning" />
          <FeatureBar index={4} label="Rolling Volatility" value={0} color="progress-warning" />
          <FeatureBar index={5} label="EMA Distance" value={0} color="progress-warning" />
          {!hasFullVector && (
            <p className="text-xs opacity-40 italic mt-1">Requires raw observation vector</p>
          )}
        </Section>

        {/* Derived (6-9) */}
        <Section title="Derived [6–9]" defaultOpen={false}>
          <FeatureBar index={6} label="HHLL Score" value={0} color="progress-secondary" />
          <FeatureBar index={7} label="Vol Percentile" value={0} color="progress-secondary" />
          <FeatureBar index={8} label="ATR Ratio" value={0} color="progress-secondary" />
          <FeatureBar index={9} label="Vol Slope" value={0} color="progress-secondary" />
          {!hasFullVector && (
            <p className="text-xs opacity-40 italic mt-1">Requires raw observation vector</p>
          )}
        </Section>

        {/* HMM Raw (10-13) */}
        <Section title="HMM Raw Posteriors [10–13]" defaultOpen={false}>
          <FeatureBar index={10} label="Vol Posterior 0" value={0} color="progress-accent" />
          <FeatureBar index={11} label="Vol Posterior 1" value={0} color="progress-accent" />
          <FeatureBar index={12} label="Vol Posterior 2" value={0} color="progress-accent" />
          <FeatureBar index={13} label="Vol Posterior 3" value={0} color="progress-accent" />
          {!hasFullVector && (
            <p className="text-xs opacity-40 italic mt-1">Requires raw observation vector</p>
          )}
        </Section>

        {/* Markov (14-19) — from regime */}
        <Section title="Markov Probabilities [14–19]" defaultOpen={true}>
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
        </Section>

        {/* Quality (20-21) — from regime */}
        <Section title="Quality [20–21]" defaultOpen={true}>
          <FeatureBar
            index={20}
            label="Regime Quality"
            value={confidence}
            color="progress-success"
          />
          <FeatureBar
            index={21}
            label="State Confidence"
            value={confidence}
            color="progress-success"
          />
          <p className="text-xs opacity-40 mt-1">
            Both derived from regime confidence: {(confidence * 100).toFixed(1)}%
          </p>
        </Section>

        {/* Position (22-23) */}
        <Section title="Position [22–23]" defaultOpen={true}>
          <FeatureBar
            index={22}
            label="Masaniello Pressure f×(1−f)"
            value={data.sizing ? data.sizing.recommended_f * (1 - (data.sizing.recommended_f || 0)) : 0}
            color="progress-warning"
          />
          <FeatureBar
            index={23}
            label="Drawdown Factor"
            value={1 - (data.risk?.max_drawdown ?? 0)}
            color="progress-error"
          />
          {data.sizing && (
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
