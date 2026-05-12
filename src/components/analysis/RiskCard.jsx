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
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Risk Analysis</h3>

      {/* Key Metrics — compact grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">VaR 95%</div>
          <div className="text-error font-bold font-mono">{var95}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">VaR 99%</div>
          <div className="text-error font-bold font-mono">{var99}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">CVaR 95%</div>
          <div className="text-error font-bold font-mono">{cvar95}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">CVaR 99%</div>
          <div className="text-error font-bold font-mono">{cvar99}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">Max Drawdown</div>
          <div className="text-warning font-bold font-mono">{maxDD}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">Annual Vol</div>
          <div className="font-bold font-mono">{annVol}%</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">Annual Return</div>
          <div className="text-success font-bold font-mono">{annRet}%</div>
        </div>
      </div>

      {/* Sortino & Calmar — inline */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">Sortino Ratio</div>
          <div className="text-accent font-bold font-mono">{sortino}</div>
        </div>
        <div className="bg-base-200 rounded-lg px-3 py-2">
          <div className="text-xs text-base-content/60">Calmar Ratio</div>
          <div className="text-accent font-bold font-mono">{calmar}</div>
        </div>
      </div>

      {/* Stop-loss / Take-profit — compact alerts */}
      <div className="grid grid-cols-2 gap-2">
        {stop != null && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
            <div className="text-xs text-warning font-medium">Stop-Loss</div>
            <div className="font-mono text-sm">
              {typeof stop === 'number' ? stop.toFixed(4) : stop}
            </div>
          </div>
        )}
        {tp != null && (
          <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2">
            <div className="text-xs text-success font-medium">Take-Profit</div>
            <div className="font-mono text-sm">
              {typeof tp === 'number' ? tp.toFixed(4) : tp}
            </div>
          </div>
        )}
      </div>

      {/* Risk Budget Used */}
      <div>
        <div className="flex justify-between text-xs mb-1">
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
        <div>
          <div className="text-xs font-medium mb-1 text-base-content/70">Notes</div>
          <ul className="list list-disc text-xs opacity-70">
            {notes.map((note, i) => (
              <li key={i} className="list-item ml-4">{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
