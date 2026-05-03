'use client'

export default function RiskCard({ data }) {
  if (!data) return null

  const var95 = ((data.var_95 ?? 0) * 100).toFixed(2)
  const var99 = ((data.var_99 ?? 0) * 100).toFixed(2)
  const cvar95 = ((data.cvar_95 ?? 0) * 100).toFixed(2)
  const cvar99 = ((data.cvar_99 ?? 0) * 100).toFixed(2)
  const maxDD = ((data.max_drawdown ?? 0) * 100).toFixed(2)
  const annVol = ((data.annual_vol ?? 0) * 100).toFixed(2)
  const annRet = ((data.annual_return ?? 0) * 100).toFixed(2)
  const sortino = (data.sortino_ratio ?? 0).toFixed(2)
  const calmar = (data.calmar_ratio ?? 0).toFixed(2)
  const stop = data.suggested_stop
  const tp = data.suggested_tp
  const riskBudget = (data.risk_budget_used ?? 0) * 100
  const notes = data.notes || []

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Risk Analysis</h2>

        {/* Key Metrics Stats */}
        <div className="stats stats-vertical shadow mt-2">
          <div className="stat">
            <div className="stat-title">VaR 95%</div>
            <div className="stat-value text-error">{var95}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">VaR 99%</div>
            <div className="stat-value text-error">{var99}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">CVaR 95%</div>
            <div className="stat-value text-error">{cvar95}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">CVaR 99%</div>
            <div className="stat-value text-error">{cvar99}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">Max Drawdown</div>
            <div className="stat-value text-warning">{maxDD}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">Annual Volatility</div>
            <div className="stat-value">{annVol}%</div>
          </div>
          <div className="stat">
            <div className="stat-title">Annual Return</div>
            <div className="stat-value text-success">{annRet}%</div>
          </div>
        </div>

        {/* Sortino & Calmar */}
        <div className="stats shadow mt-4">
          <div className="stat">
            <div className="stat-title">Sortino Ratio</div>
            <div className="stat-value text-accent">{sortino}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Calmar Ratio</div>
            <div className="stat-value text-accent">{calmar}</div>
          </div>
        </div>

        {/* Stop-loss Alert */}
        {stop != null && (
          <div className="alert alert-warning mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-bold">Stop-Loss</h3>
              <div className="text-xs">{typeof stop === 'number' ? stop.toFixed(4) : stop}</div>
            </div>
          </div>
        )}

        {/* Take-profit Alert */}
        {tp != null && (
          <div className="alert alert-success mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-bold">Take-Profit</h3>
              <div className="text-xs">{typeof tp === 'number' ? tp.toFixed(4) : tp}</div>
            </div>
          </div>
        )}

        {/* Risk Budget Used */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">Risk Budget Used</span>
            <span className="opacity-70">{riskBudget.toFixed(1)}%</span>
          </div>
          <progress
            className={`progress ${riskBudget > 80 ? 'progress-error' : riskBudget > 50 ? 'progress-warning' : 'progress-success'} w-full`}
            value={riskBudget}
            max="100"
          />
        </div>

        {/* Notes */}
        {notes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Notes</h3>
            <ul className="list list-disc text-xs opacity-70">
              {notes.map((note, i) => (
                <li key={i} className="list-item ml-4">{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
