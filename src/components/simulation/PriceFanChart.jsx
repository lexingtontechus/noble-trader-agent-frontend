'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

function FanTooltip({ active, payload, medianStroke }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg p-2 shadow-lg text-xs">
      <p className="font-bold mb-1">Step {d.step}</p>
      {d.p95 != null && <p className="text-error">P95: ${d.p95.toFixed(2)}</p>}
      {d.p75 != null && <p className="text-warning">P75: ${d.p75.toFixed(2)}</p>}
      <p className="font-bold" style={{ color: medianStroke }}>Median: ${d.median.toFixed(2)}</p>
      {d.p25 != null && <p className="text-info">P25: ${d.p25.toFixed(2)}</p>}
      {d.p5 != null && <p className="text-success">P5: ${d.p5.toFixed(2)}</p>}
    </div>
  )
}

export default function PriceFanChart({ simulation, currentPrice = null }) {
  if (!simulation?.price_median?.length) return null

  const { price_p5, price_p25, price_median, price_p75, price_p95 } = simulation

  const chartData = price_median.map((med, i) => ({
    step: i + 1,
    p5: price_p5?.[i],
    p25: price_p25?.[i],
    median: med,
    p75: price_p75?.[i],
    p95: price_p95?.[i],
  }))

  const pctPositive = simulation.pct_paths_positive ?? 0.5
  const isBullish = pctPositive > 0.5
  const bandColor = isBullish ? '#22c55e' : '#ef4444'
  const medianStroke = isBullish ? '#22c55e' : '#ef4444'

  return (
    <div style={{ minHeight: '200px', width: '100%' }}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="fanOuterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={bandColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={bandColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="step" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickFormatter={(v) => `$${v.toFixed(0)}`} width={60} />
          <Tooltip content={<FanTooltip medianStroke={medianStroke} />} />
          {currentPrice != null && (
            <ReferenceLine y={currentPrice} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" strokeWidth={1} label={{ value: `$${currentPrice.toFixed(0)}`, position: 'right', fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
          )}
          <Area type="monotone" dataKey="p95" stroke="none" fill={`rgba(${isBullish ? '34,197,94' : '239,68,68'},0.06)`} dot={false} strokeWidth={0} />
          <Area type="monotone" dataKey="p75" stroke={`rgba(${isBullish ? '34,197,94' : '239,68,68'},0.3)`} strokeWidth={1} fill={`rgba(${isBullish ? '34,197,94' : '239,68,68'},0.12)`} dot={false} />
          <Area type="monotone" dataKey="median" stroke={medianStroke} strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4, stroke: medianStroke, strokeWidth: 2, fill: '#1a1a2e' }} />
          <Area type="monotone" dataKey="p25" stroke={`rgba(${isBullish ? '34,197,94' : '239,68,68'},0.3)`} strokeWidth={1} fill="transparent" dot={false} />
          <Area type="monotone" dataKey="p5" stroke="none" fill="transparent" dot={false} strokeWidth={0} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 text-xs text-base-content/50 mt-1 justify-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: medianStroke }} />
          Median
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm opacity-40" style={{ background: bandColor }} />
          P25–P75
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm opacity-20" style={{ background: bandColor }} />
          P5–P95
        </span>
      </div>
    </div>
  )
}
