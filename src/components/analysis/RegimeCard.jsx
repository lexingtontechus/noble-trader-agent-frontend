'use client'

export default function RegimeCard({ data }) {
  if (!data) return null

  const label = String(typeof data.regime_label === 'string' ? data.regime_label : 'unknown').toLowerCase()
  const badgeClass = label.includes('bull')
    ? 'badge-success'
    : label.includes('bear')
      ? 'badge-error'
      : 'badge-warning'

  const confidencePct = Math.round((data.confidence ?? 0) * 100)
  const riskMult = data.risk_multiplier ?? 0

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Regime Detection
          <span className={`badge ${badgeClass} badge-lg`}>
            {data.regime_label || 'Unknown'}
          </span>
        </h2>

        {/* Volatility State */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium">Volatility State</span>
            <span className="badge badge-outline badge-sm">{data.vol_state || 'N/A'}</span>
          </div>
          {Object.entries(data.vol_probs || {}).map(([key, prob]) => (
            <div key={key} className="mb-1">
              <div className="flex justify-between text-xs opacity-70 mb-0.5">
                <span>{key}</span>
                <span>{(prob * 100).toFixed(1)}%</span>
              </div>
              <progress
                className="progress progress-info w-full"
                value={prob * 100}
                max="100"
              />
            </div>
          ))}
        </div>

        {/* Trend State */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium">Trend State</span>
            <span className="badge badge-outline badge-sm">{data.trend_state || 'N/A'}</span>
          </div>
          {Object.entries(data.trend_probs || {}).map(([key, prob]) => (
            <div key={key} className="mb-1">
              <div className="flex justify-between text-xs opacity-70 mb-0.5">
                <span>{key}</span>
                <span>{(prob * 100).toFixed(1)}%</span>
              </div>
              <progress
                className="progress progress-accent w-full"
                value={prob * 100}
                max="100"
              />
            </div>
          ))}
        </div>

        {/* Confidence Radial */}
        <div className="flex justify-center mt-4">
          <div
            className="radial-progress text-primary"
            style={{ '--value': confidencePct, '--size': '5rem', '--thickness': '6px' }}
            role="progressbar"
          >
            {confidencePct}%
          </div>
        </div>
        <p className="text-center text-xs opacity-60 mt-1">Confidence</p>

        {/* Risk Multiplier Stat */}
        <div className="stats stats-vertical shadow mt-4">
          <div className="stat">
            <div className="stat-title">Risk Multiplier</div>
            <div className="stat-value text-primary">{riskMult.toFixed(2)}×</div>
            <div className="stat-desc">
              {riskMult >= 1.0 ? 'Elevated exposure' : riskMult >= 0.5 ? 'Moderate exposure' : 'Reduced exposure'}
            </div>
          </div>
        </div>

        {/* n_bars_fitted */}
        <p className="text-xs opacity-40 mt-2">
          Fitted on {data.n_bars_fitted ?? '—'} bars
        </p>
      </div>
    </div>
  )
}
