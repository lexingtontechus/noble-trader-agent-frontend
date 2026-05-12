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

  // Risk multiplier color
  const riskMultColor = riskMult >= 1.0
    ? 'text-success'
    : riskMult >= 0.5
      ? 'text-warning'
      : 'text-error'

  const riskMultLabel = riskMult >= 1.0
    ? 'Elevated exposure'
    : riskMult >= 0.5
      ? 'Moderate exposure'
      : 'Reduced exposure'

  return (
    <div className="space-y-3">
      {/* Header row: Regime label + Risk Multiplier */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`badge ${badgeClass} badge-lg`}>
            {data.regime_label || 'Unknown'}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-base-content/60">Risk Mult</div>
          <div className={`text-xl font-bold font-mono ${riskMultColor}`}>
            {riskMult.toFixed(2)}×
          </div>
          <div className="text-xs text-base-content/50">{riskMultLabel}</div>
        </div>
      </div>

      {/* Confidence + Fitted bars — side by side */}
      <div className="flex items-center gap-4">
        <div
          className="radial-progress text-primary shrink-0"
          style={{ '--value': confidencePct, '--size': '4rem', '--thickness': '5px' }}
          role="progressbar"
        >
          {confidencePct}%
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-base-content/60 mb-1">Confidence</div>
          <div className="text-xs text-base-content/40">
            Fitted on {data.n_bars_fitted ?? '—'} bars
          </div>
        </div>
      </div>

      {/* Volatility State */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium">Volatility State</span>
          <span className="badge badge-outline badge-xs">{data.vol_state || 'N/A'}</span>
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
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium">Trend State</span>
          <span className="badge badge-outline badge-xs">{data.trend_state || 'N/A'}</span>
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
    </div>
  )
}
