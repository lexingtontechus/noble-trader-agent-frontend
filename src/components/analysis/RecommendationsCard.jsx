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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">Recommendations</h3>
        <span className={`badge ${actionClass} badge-sm`}>{actionLabel}</span>
      </div>

      {/* Position Size — compact inline */}
      <div className="bg-base-200 rounded-lg px-3 py-2">
        <div className="text-xs text-base-content/60">Recommended Position Size</div>
        <div className="text-primary text-2xl font-bold font-mono">{recommendedF}%</div>
        <div className="text-xs text-base-content/50">Regime-gated fractional Kelly</div>
      </div>

      {/* Stop / TP levels — horizontal row */}
      {(stop != null || tp != null) && (
        <div className="grid grid-cols-2 gap-2">
          {stop != null && (
            <div className="bg-base-200 rounded-lg px-3 py-2">
              <div className="text-xs text-base-content/60">Suggested Stop</div>
              <div className="text-warning text-lg font-bold font-mono">
                {typeof stop === 'number' ? stop.toFixed(4) : stop}
              </div>
            </div>
          )}
          {tp != null && (
            <div className="bg-base-200 rounded-lg px-3 py-2">
              <div className="text-xs text-base-content/60">Take-Profit</div>
              <div className="text-success text-lg font-bold font-mono">
                {typeof tp === 'number' ? tp.toFixed(4) : tp}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kelly Breakdown Steps — horizontal compact */}
      <div>
        <div className="text-xs font-medium mb-2 text-base-content/70">Kelly Sizing Pipeline</div>
        <ul className="steps steps-horizontal text-xs w-full">
          <li className="step" data-content="">
            <span className="font-mono text-xs">{fullKelly}%</span>
            <br />
            <span className="opacity-60">Full</span>
          </li>
          <li className="step" data-content="">
            <span className="font-mono text-xs">{fractional}%</span>
            <br />
            <span className="opacity-60">Frac</span>
          </li>
          <li className="step" data-content="">
            <span className="font-mono text-xs">{volScaled}%</span>
            <br />
            <span className="opacity-60">Vol</span>
          </li>
          <li className="step" data-content="">
            <span className="font-mono text-xs">{regimeGated}%</span>
            <br />
            <span className="opacity-60">Gate</span>
          </li>
          <li className="step step-primary" data-content="">
            <span className="font-mono text-xs">{recommended}%</span>
            <br />
            <span className="opacity-60">Final</span>
          </li>
        </ul>
      </div>

      {/* Sharpe Ratio — inline compact */}
      <div className="bg-base-200 rounded-lg px-3 py-2 flex items-center justify-between">
        <div>
          <div className="text-xs text-base-content/60">Sharpe Ratio</div>
          <div className="text-accent font-bold font-mono">{sharpe}</div>
        </div>
        <div className="text-xs text-base-content/50 text-right">
          {sharpe === 'N/A' ? 'Insufficient data' :
            parseFloat(sharpe) > 1.0 ? 'Strong risk-adjusted' :
            parseFloat(sharpe) > 0.5 ? 'Moderate' :
            'Below target'}
        </div>
      </div>

      {/* Notes — compact */}
      {allNotes.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1 text-base-content/70">Notes</div>
          <ul className="list list-disc text-xs opacity-70">
            {allNotes.map((note, i) => (
              <li key={i} className="list-item ml-4">{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
