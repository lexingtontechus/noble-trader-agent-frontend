'use client'

export default function RecommendationsCard({ data }) {
  if (!data) return null

  const regime = data.regime || {}
  const sizing = data.sizing || {}
  const risk = data.risk || {}

  const recommendedF = ((sizing.recommended_f ?? 0) * 100).toFixed(2)
  const riskMult = regime.risk_multiplier ?? 0

  // Regime action badge
  let actionLabel = 'DEFENSIVE'
  let actionClass = 'badge-error'
  if (riskMult > 1.0) {
    actionLabel = 'AGGRESSIVE'
    actionClass = 'badge-success'
  } else if (riskMult >= 0.5) {
    actionLabel = 'MODERATE'
    actionClass = 'badge-warning'
  }

  // Kelly sizing breakdown steps
  const fullKelly = ((sizing.full_kelly_f ?? 0) * 100).toFixed(2)
  const fractional = ((sizing.fractional_f ?? 0) * 100).toFixed(2)
  const volScaled = ((sizing.vol_scaled_f ?? 0) * 100).toFixed(2)
  const regimeGated = ((sizing.regime_gated_f ?? 0) * 100).toFixed(2)
  const recommended = ((sizing.recommended_f ?? 0) * 100).toFixed(2)

  const sharpe = sizing.sharpe_ratio != null ? sizing.sharpe_ratio.toFixed(2) : 'N/A'

  const stop = risk.suggested_stop
  const tp = risk.suggested_tp

  // Combine notes
  const sizingNotes = sizing.notes || []
  const riskNotes = risk.notes || []
  const allNotes = [...sizingNotes, ...riskNotes]

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Recommendations
          <span className={`badge ${actionClass} badge-lg`}>{actionLabel}</span>
        </h2>

        {/* Position Size */}
        <div className="stats shadow mt-2">
          <div className="stat">
            <div className="stat-title">Recommended Position Size</div>
            <div className="stat-value text-primary text-3xl">{recommendedF}%</div>
            <div className="stat-desc">Regime-gated fractional Kelly</div>
          </div>
        </div>

        {/* Stop / TP levels */}
        {(stop != null || tp != null) && (
          <div className="stats stats-vertical shadow mt-4">
            {stop != null && (
              <div className="stat">
                <div className="stat-title">Suggested Stop</div>
                <div className="stat-value text-warning text-xl">
                  {typeof stop === 'number' ? stop.toFixed(4) : stop}
                </div>
              </div>
            )}
            {tp != null && (
              <div className="stat">
                <div className="stat-title">Suggested Take-Profit</div>
                <div className="stat-value text-success text-xl">
                  {typeof tp === 'number' ? tp.toFixed(4) : tp}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Kelly Breakdown Steps */}
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-3">Kelly Sizing Pipeline</h3>
          <ul className="steps steps-vertical text-xs w-full">
            <li className="step" data-content="">
              <span className="font-mono">{fullKelly}%</span>
              <br />
              <span className="opacity-60">Full Kelly</span>
            </li>
            <li className="step" data-content="">
              <span className="font-mono">{fractional}%</span>
              <br />
              <span className="opacity-60">Fractional</span>
            </li>
            <li className="step" data-content="">
              <span className="font-mono">{volScaled}%</span>
              <br />
              <span className="opacity-60">Vol-Scaled</span>
            </li>
            <li className="step" data-content="">
              <span className="font-mono">{regimeGated}%</span>
              <br />
              <span className="opacity-60">Regime-Gated</span>
            </li>
            <li className="step step-primary" data-content="">
              <span className="font-mono">{recommended}%</span>
              <br />
              <span className="opacity-60">Recommended</span>
            </li>
          </ul>
        </div>

        {/* Sharpe Ratio */}
        <div className="stats shadow mt-4">
          <div className="stat">
            <div className="stat-title">Sharpe Ratio</div>
            <div className="stat-value text-accent">{sharpe}</div>
            <div className="stat-desc">
              {sharpe === 'N/A' ? 'Insufficient data' :
                parseFloat(sharpe) > 1.0 ? 'Strong risk-adjusted return' :
                parseFloat(sharpe) > 0.5 ? 'Moderate risk-adjusted return' :
                'Below target risk-adjusted return'}
            </div>
          </div>
        </div>

        {/* Notes */}
        {allNotes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Notes</h3>
            <ul className="list list-disc text-xs opacity-70">
              {allNotes.map((note, i) => (
                <li key={i} className="list-item ml-4">{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
