'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function CustomTooltip({ active, payload, label, strokeColor }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg p-2 shadow-lg">
      <p className="text-xs opacity-60">{label}</p>
      <p className="text-sm font-bold" style={{ color: strokeColor }}>
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  )
}

function getRegimeColor(regimeLabel) {
  const label = (regimeLabel || '').toLowerCase()
  if (label.includes('bull')) return { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.15)' }
  if (label.includes('bear')) return { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)' }
  return { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)' }
}

function buildChartData(prices, dates) {
  const maxPoints = 200
  const step = prices.length > maxPoints ? Math.ceil(prices.length / maxPoints) : 1
  const chartData = []
  for (let i = 0; i < prices.length; i += step) {
    chartData.push({
      date: dates[i] || '',
      price: prices[i],
    })
  }
  return chartData
}

export default function PriceChart({ prices = [], dates = [], regimeLabel = '' }) {
  if (!prices || prices.length === 0) return null

  const { stroke: strokeColor, fill: fillColor } = getRegimeColor(regimeLabel)
  const chartData = buildChartData(prices, dates)

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Price Chart
          {regimeLabel && (
            <span className="badge badge-outline badge-sm">{regimeLabel}</span>
          )}
        </h2>

        <div style={{ minHeight: '200px', width: '100%' }}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                width={55}
              />
              <Tooltip content={<CustomTooltip strokeColor={strokeColor} />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                activeDot={{ r: 4, stroke: strokeColor, strokeWidth: 2, fill: '#1a1a2e' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs opacity-40 mt-1">
          {prices.length} data points · sampled to {chartData.length}
        </p>
      </div>
    </div>
  )
}
