'use client'

import InfoTip from '@/components/shared/InfoTip'

function formatPct(value) {
  if (value == null) return 'N/A'
  return `${(value * 100).toFixed(2)}%`
}

function formatNum(value, decimals = 2) {
  if (value == null) return 'N/A'
  return value.toFixed(decimals)
}

function getDisplayName(symbol) {
  const names = {
    'GC=F': 'Gold',
    'BTC-USD': 'Bitcoin',
    'EURUSD=X': 'USD/EUR',
  }
  return names[symbol] || symbol
}

function colorCodeBestWorst(values, key, higherIsBetter = true) {
  const validValues = values.filter((v) => v.value != null)
  if (validValues.length === 0) return values.map((v) => ({ ...v, className: '' }))

  const numericVals = validValues.map((v) => v.value)
  const best = higherIsBetter ? Math.max(...numericVals) : Math.min(...numericVals)
  const worst = higherIsBetter ? Math.min(...numericVals) : Math.max(...numericVals)

  return values.map((v) => {
    if (v.value == null) return { ...v, className: '' }
    if (v.value === best && best !== worst) return { ...v, className: 'text-success font-bold' }
    if (v.value === worst && best !== worst) return { ...v, className: 'text-error font-bold' }
    return { ...v, className: '' }
  })
}

export default function ComparisonTable({ tickers }) {
  if (!tickers || tickers.length === 0) return null

  const withData = tickers.filter((t) => t.data?.analysis)
  if (withData.length === 0) return null

  const tickerMetrics = tickers.map((t) => {
    const a = t.data?.analysis
    const regime = a?.regime
    const sizing = a?.sizing
    const risk = a?.risk

    return {
      symbol: t.symbol,
      displayName: t.displayName || getDisplayName(t.symbol),
      regime: regime?.regime_label,
      riskMultiplier: regime?.risk_multiplier,
      var95: risk?.var_95,
      cvar95: risk?.cvar_95,
      maxDrawdown: risk?.max_drawdown,
      annualReturn: sizing?.annual_return ?? risk?.annual_return,
      annualVol: sizing?.annual_vol ?? risk?.annual_vol,
      sharpe: sizing?.sharpe_ratio,
      sortino: sizing?.sortino_ratio,
      calmar: sizing?.calmar_ratio,
      recommendedPosition: sizing?.recommended_f,
    }
  })

  const rows = [
    {
      label: 'Regime',
      tip: 'HMM-detected market regime for each asset',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.regime, isText: true })),
      higherIsBetter: true,
    },
    {
      label: 'Risk Mult',
      tip: 'Risk multiplier — scales position size based on regime confidence',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.riskMultiplier })),
      higherIsBetter: true,
      format: (v) => formatNum(v),
    },
    {
      label: 'VaR 95%',
      tip: 'Value at Risk at 95% confidence — max expected daily loss',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.var95 })),
      higherIsBetter: false,
      format: (v) => formatPct(v),
    },
    {
      label: 'CVaR 95%',
      tip: 'Conditional VaR — average loss in worst 5% of scenarios',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.cvar95 })),
      higherIsBetter: false,
      format: (v) => formatPct(v),
    },
    {
      label: 'Max DD',
      tip: 'Maximum drawdown — worst peak-to-trough decline',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.maxDrawdown })),
      higherIsBetter: false,
      format: (v) => formatPct(v),
    },
    {
      label: 'Ann Return',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.annualReturn })),
      higherIsBetter: true,
      format: (v) => formatPct(v),
    },
    {
      label: 'Ann Vol',
      tip: 'Annualized volatility — yearly standard deviation of returns',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.annualVol })),
      higherIsBetter: false,
      format: (v) => formatPct(v),
    },
    {
      label: 'Sharpe',
      tip: 'Sharpe ratio — risk-adjusted return (>1.0=strong)',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.sharpe })),
      higherIsBetter: true,
      format: (v) => formatNum(v),
    },
    {
      label: 'Sortino',
      tip: 'Sortino ratio — downside risk-adjusted return',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.sortino })),
      higherIsBetter: true,
      format: (v) => formatNum(v),
    },
    {
      label: 'Calmar',
      tip: 'Calmar ratio — return per unit of max drawdown',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.calmar })),
      higherIsBetter: true,
      format: (v) => formatNum(v),
    },
    {
      label: 'Rec. Position',
      tip: 'Recommended position size as a fraction of portfolio',
      values: tickerMetrics.map((t) => ({ symbol: t.symbol, value: t.recommendedPosition })),
      higherIsBetter: true,
      format: (v) => formatPct(v),
    },
  ]

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Metric</th>
              {tickerMetrics.map((t) => (
                <th key={t.symbol}>{t.displayName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isText = row.values.some((v) => v.isText)
              const colored = isText
                ? row.values.map((v) => ({ ...v, className: '' }))
                : colorCodeBestWorst(row.values, row.label, row.higherIsBetter)

              return (
                <tr key={row.label}>
                  <td className="text-sm font-semibold text-base-content/70">{row.label}{row.tip && <InfoTip tip={row.tip} />}</td>
                  {colored.map((v) => (
                    <td key={v.symbol} className={`text-sm ${v.className}`}>
                      {v.isText
                        ? v.value || 'N/A'
                        : row.format
                          ? row.format(v.value)
                          : String(v.value ?? 'N/A')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View — one card per ticker */}
      <div className="sm:hidden space-y-3">
        {tickerMetrics.map((t) => (
          <div key={t.symbol} className="card bg-base-200 shadow-sm">
            <div className="card-body p-3">
              <h3 className="font-bold text-base">{t.displayName}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
                {rows.map((row) => {
                  const val = row.values.find((v) => v.symbol === t.symbol)
                  const isText = val?.isText
                  const colored = isText
                    ? { className: '' }
                    : colorCodeBestWorst(row.values, row.label, row.higherIsBetter)
                        .find((v) => v.symbol === t.symbol) || { className: '' }

                  return (
                    <div key={row.label} className="flex justify-between items-baseline">
                      <span className="text-xs text-base-content/50">{row.label}{row.tip && <InfoTip tip={row.tip} />}</span>
                      <span className={`text-sm font-mono ${colored.className}`}>
                        {val == null || val.value == null
                          ? 'N/A'
                          : isText
                            ? val.value || 'N/A'
                            : row.format
                              ? row.format(val.value)
                              : String(val.value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
