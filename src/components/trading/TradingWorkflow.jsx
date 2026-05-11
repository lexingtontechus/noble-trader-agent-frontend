'use client'

import { useState, useCallback, useEffect, useRef, Component } from 'react'

/* ─── Safe String Helpers ─── */

function safeLower(val) {
  if (val == null) return ''
  return String(val).toLowerCase()
}

function safeUpper(val) {
  if (val == null) return ''
  return String(val).toUpperCase()
}

/* ─── Normalize trade data from DB (ensures all fields are proper types) ─── */

function normalizeTrade(t) {
  if (!t) return t
  return {
    ...t,
    side: String(t.side || t.action || 'buy'),
    action: String(t.action || t.side || 'buy'),
    orderType: String(t.orderType || t.order_type || t.type || 'market'),
    order_type: String(t.order_type || t.orderType || t.type || 'market'),
    type: String(t.type || t.orderType || t.order_type || 'market'),
    status: String(t.status || 'pending'),
    priority: t.priority,  // keep as-is (number or string), getPriorityStyle handles both
    symbol: String(t.symbol || t.ticker || '???'),
    ticker: String(t.ticker || t.symbol || '???'),
    reason: t.reason ? String(t.reason) : null,
    qty: t.qty ?? t.quantity ?? 0,
    quantity: t.quantity ?? t.qty ?? 0,
    limitPrice: t.limitPrice ?? t.limit_price ?? null,
    limit_price: t.limit_price ?? t.limitPrice ?? null,
    estimatedValue: t.estimatedValue ?? t.estimated_value ?? null,
    estimated_value: t.estimated_value ?? t.estimatedValue ?? null,
    timeInForce: String(t.timeInForce ?? t.time_in_force ?? 'day'),
    regime: t.regime || null,
    regimeLabel: t.regimeLabel || t.regime_label || null,
    strategySignal: t.strategySignal || t.strategy_signal || null,
    strategyConfidence: t.strategyConfidence ?? t.strategy_confidence ?? null,
    kellyFraction: t.kellyFraction ?? t.kelly_fraction ?? null,
    kellySize: t.kellySize ?? t.kelly_size ?? null,
    riskScore: t.riskScore ?? t.risk_score ?? null,
    varDaily: t.varDaily ?? t.var_daily ?? null,
    cvarDaily: t.cvarDaily ?? t.cvar_daily ?? null,
    // Phase 3: Validation fields
    validationStatus: t.validationStatus || t.validation_status || null,
    validationScore: t.validationScore ?? t.validation_score ?? null,
    validationDetails: t.validationDetails || t.validation_details || null,
    validatedAt: t.validatedAt || t.validated_at || null,
  }
}

/* ─── Error Boundary ─── */

class TradingErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[TradingWorkflow ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-bold">Rendering Error</h3>
            <div className="text-xs mt-1">{this.state.error?.message || 'Unknown error'}</div>
            <button className="btn btn-sm btn-ghost mt-2" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ─── Inline SVG Icon Components ─── */

function IconChart({ size = 20, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
    </svg>
  )
}

function IconZap({ size = 20, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconCheck({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconX({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconSend({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconClock({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconRefresh({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
    </svg>
  )
}

function IconShield({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IconAlertTriangle({ size = 20, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconPlay({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function IconFlask({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 3h6" /><path d="M10 9V3" /><path d="M14 9V3" /><path d="M9 9l-4.5 8.5a2 2 0 0 0 1.7 2.9h10.6a2 2 0 0 0 1.7-2.9L15 9" />
    </svg>
  )
}

function IconCheckCircle({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function IconXCircle({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

/* ─── Analysis Loading Steps ─── */

const ANALYZE_STEPS = [
  { key: 'fetching', label: 'Fetching Positions' },
  { key: 'regimes', label: 'HMM Regime Detection' },
  { key: 'strategy', label: 'Strategy Signals' },
  { key: 'risk', label: 'Risk Analysis' },
  { key: 'tda', label: 'TDA Anomaly Detection' },
  { key: 'correlations', label: 'Analyzing Correlations' },
  { key: 'optimizing', label: 'Optimizing Portfolio' },
  { key: 'generating', label: 'Generating Recommendations' },
]

/* ─── Regime helpers (matching PortfolioOverview) ─── */

const REGIME_COLORS = {
  low_corr: 'badge-success',
  mid_corr: 'badge-warning',
  high_corr: 'badge-error',
  crisis: 'badge-error',
  bullish: 'badge-success',
  bearish: 'badge-error',
  neutral: 'badge-ghost',
  trending: 'badge-info',
  volatile: 'badge-warning',
  sideways: 'badge-warning',
  recovery: 'badge-success',
}

const REGIME_LABELS = {
  low_corr: 'Low Correlation',
  mid_corr: 'Mid Correlation',
  high_corr: 'High Correlation',
  crisis: 'Crisis Mode',
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
  trending: 'Trending',
  volatile: 'Volatile',
  sideways: 'Sideways',
  recovery: 'Recovery',
}

function regimeBadgeClass(regime) {
  return REGIME_COLORS[regime] || 'badge-ghost'
}

function regimeDisplayLabel(regime) {
  return REGIME_LABELS[regime] || regime || 'Unknown'
}

/* ─── Priority helpers ─── */

const PRIORITY_STYLES = {
  critical: { badge: 'badge-error', text: 'Critical' },
  high: { badge: 'badge-warning', text: 'High' },
  medium: { badge: 'badge-info', text: 'Medium' },
  low: { badge: 'badge-ghost', text: 'Low' },
}

function getPriorityStyle(priority) {
  // Priority can be a number (0, 50...) from the backend or a string ('critical', 'high'...)
  if (typeof priority === 'number') {
    if (priority <= 5) return PRIORITY_STYLES.critical
    if (priority <= 20) return PRIORITY_STYLES.high
    if (priority <= 60) return PRIORITY_STYLES.medium
    return PRIORITY_STYLES.low
  }
  // Safe lowercase — handles any non-string value gracefully
  const key = safeLower(priority)
  return PRIORITY_STYLES[key] || PRIORITY_STYLES.low
}

/* ─── Small Sub-Components ─── */

function MetricCard({ label, value, subtext, icon, colorClass = '' }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-base-content/50 uppercase tracking-wide">{label}</span>
          {icon && <span className="text-base-content/30">{icon}</span>}
        </div>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
        {subtext && <div className="text-xs text-base-content/40 mt-1">{subtext}</div>}
      </div>
    </div>
  )
}

function AllocationBar({ symbol, weight, color = 'bg-primary' }) {
  const pct = typeof weight === 'number' ? weight * 100 : parseFloat(weight) * 100
  const isNaN_ = isNaN(pct)
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm w-20 truncate">{symbol}</span>
      <div className="flex-1 bg-base-300 rounded-full h-3 overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-700`}
          style={{ width: isNaN_ ? '0%' : `${Math.min(Math.abs(pct), 100)}%` }}
        />
      </div>
      <span className="font-mono text-sm w-16 text-right">
        {isNaN_ ? '---' : `${pct.toFixed(1)}%`}
      </span>
    </div>
  )
}

/* ─── Phase 1: Analysis Loading Indicator ─── */

function AnalysisLoadingIndicator({ currentStep }) {
  const currentIdx = ANALYZE_STEPS.findIndex(s => s.key === currentStep)
  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center justify-center gap-3 mb-6">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <span className="text-lg font-semibold text-primary">Analyzing Portfolio...</span>
      </div>
      <div className="space-y-2">
        {ANALYZE_STEPS.map((step, idx) => {
          const isComplete = idx < currentIdx
          const isCurrent = idx === currentIdx
          const isPending = idx > currentIdx
          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-500 ${
                isCurrent
                  ? 'bg-primary/10 border border-primary/30'
                  : isComplete
                    ? 'bg-success/5 border border-success/10'
                    : 'bg-base-300/30 border border-transparent'
              }`}
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center">
                {isComplete ? (
                  <span className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                    <IconCheck size={14} className="text-success" />
                  </span>
                ) : isCurrent ? (
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="loading loading-spinner loading-xs text-primary"></span>
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full bg-base-300/50 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-base-content/20"></span>
                  </span>
                )}
              </div>
              <span
                className={`text-sm transition-colors duration-300 ${
                  isCurrent
                    ? 'text-primary font-semibold'
                    : isComplete
                      ? 'text-success line-through opacity-70'
                      : 'text-base-content/30'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      {/* Progress bar */}
      <div className="mt-4 px-4">
        <div className="bg-base-300 rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-700"
            style={{ width: `${((currentIdx + 1) / ANALYZE_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="text-xs text-base-content/40 mt-1 text-right">
          Step {currentIdx + 1} of {ANALYZE_STEPS.length}
        </div>
      </div>
    </div>
  )
}

/* ─── Analysis Summary Display ─── */

function AnalysisSummary({ data }) {
  const allocation = data?.portfolio_allocation || data?.allocation || {}
  const regimeSummary = data?.regime_summary || data?.regimes || []
  const correlationRegime = data?.correlation_regime || data?.corr_regime || null
  const optimizationMetrics = data?.optimization_metrics || data?.metrics || {}
  const strategyExplanation = data?.strategy_explanation || data?.strategy || null
  const strategySignals = data?.strategy_signals || {}
  const kellySizing = data?.kelly_sizing || {}
  const riskAnalysis = data?.risk_analysis || {}

  // Phase 4: TDA anomaly analysis
  const tdaAnalysis = data?.tda_analysis || {}

  // Phase 3: Validation summary from recommendations
  const validationSummary = data?.validation_summary || null

  // If loaded from DB, we might not have all analysis details
  const isFromDb = data?.fromDb === true

  const allocationEntries = Object.entries(allocation)
  const barColors = ['bg-primary', 'bg-success', 'bg-warning', 'bg-info', 'bg-secondary', 'bg-accent', 'bg-error']

  return (
    <div className="space-y-6">
      {/* From DB notice */}
      {isFromDb && (
        <div className="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <div>
            <div className="font-semibold text-sm">Previous Analysis Loaded</div>
            <div className="text-xs opacity-80 mt-1">
              Showing trade recommendations from your last analysis. Click &quot;Analyze Portfolio&quot; to run a fresh analysis.
            </div>
          </div>
        </div>
      )}
      {/* Portfolio Allocation */}
      {allocationEntries.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <IconChart size={16} className="text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Current Portfolio Allocation</h3>
            </div>
            <div className="space-y-2">
              {allocationEntries.map(([symbol, weight], i) => (
                <AllocationBar
                  key={symbol}
                  symbol={symbol}
                  weight={weight}
                  color={barColors[i % barColors.length]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Regime Summary */}
      {regimeSummary.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <IconShield size={16} className="text-warning" />
              </div>
              <h3 className="font-semibold text-sm">Regime Summary</h3>
              {regimeSummary[0]?.n_states && (
                <span className="badge badge-xs badge-ghost ml-auto">{regimeSummary[0].n_states}-state HMM</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {regimeSummary.map((item, i) => {
                const symbol = item.symbol || item.asset || `Asset ${i + 1}`
                const regime = item.regime || item.regime_label || 'neutral'
                const confidence = item.regime_confidence || item.confidence
                return (
                  <div key={i} className="flex items-center gap-1.5 bg-base-300/40 rounded-lg px-3 py-1.5">
                    <span className="font-mono text-xs font-medium">{symbol}</span>
                    <span className={`badge badge-sm ${regimeBadgeClass(regime)}`}>
                      {regimeDisplayLabel(regime)}
                    </span>
                    {typeof confidence === 'number' && (
                      <span className="text-xs text-base-content/40">{(confidence * 100).toFixed(0)}%</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Strategy Signals */}
      {strategySignals && Object.keys(strategySignals).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                <IconZap size={16} className="text-info" />
              </div>
              <h3 className="font-semibold text-sm">Strategy Signals</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(strategySignals).map(([symbol, data]) => {
                const signal = data.signal || 'flat'
                const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5
                const signalColor = signal === 'long' ? 'text-success' : signal === 'short' ? 'text-error' : 'text-base-content/50'
                const signalBadge = signal === 'long' ? 'badge-success' : signal === 'short' ? 'badge-error' : 'badge-ghost'
                const signalLabel = signal.toUpperCase()
                return (
                  <div key={symbol} className="flex items-center gap-3 bg-base-300/30 rounded-lg px-3 py-2">
                    <span className="font-mono text-sm font-medium w-20 truncate">{symbol}</span>
                    <span className={`badge badge-sm ${signalBadge}`}>{signalLabel}</span>
                    <div className="flex-1 bg-base-300 rounded-full h-2 overflow-hidden">
                      <div
                        className={`${signal === 'long' ? 'bg-success' : signal === 'short' ? 'bg-error' : 'bg-base-content/30'} h-full rounded-full transition-all duration-700`}
                        style={{ width: `${confidence * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-12 text-right">{(confidence * 100).toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Kelly Position Sizing */}
      {kellySizing && Object.keys(kellySizing).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
                <IconChart size={16} className="text-secondary" />
              </div>
              <h3 className="font-semibold text-sm">Kelly Position Sizing</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(kellySizing).map(([symbol, data]) => {
                const fraction = typeof data.kelly_fraction === 'number' ? data.kelly_fraction : (typeof data.kellyFraction === 'number' ? data.kellyFraction : 0)
                const size = typeof data.position_size === 'number' ? data.position_size : (typeof data.kellySize === 'number' ? data.kellySize : 0)
                return (
                  <div key={symbol} className="flex items-center gap-3 bg-base-300/30 rounded-lg px-3 py-2">
                    <span className="font-mono text-sm font-medium w-20 truncate">{symbol}</span>
                    <div className="flex-1 bg-base-300 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-secondary h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(fraction * 100 * 4, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-20 text-right">
                      {(fraction * 100).toFixed(1)}% / {typeof size === 'number' ? `$${size.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '---'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Kelly Position Sizing */}
      {kellySizing && Object.keys(kellySizing).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
                <IconChart size={16} className="text-secondary" />
              </div>
              <h3 className="font-semibold text-sm">Kelly Position Sizing</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(kellySizing).map(([symbol, data]) => {
                const fraction = typeof data.kelly_fraction === 'number' ? data.kelly_fraction : (typeof data.kellyFraction === 'number' ? data.kellyFraction : 0)
                const size = typeof data.position_size === 'number' ? data.position_size : (typeof data.kellySize === 'number' ? data.kellySize : 0)
                return (
                  <div key={symbol} className="flex items-center gap-3 bg-base-300/30 rounded-lg px-3 py-2">
                    <span className="font-mono text-sm font-medium w-20 truncate">{symbol}</span>
                    <div className="flex-1 bg-base-300 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-secondary h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(fraction * 100 * 4, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-20 text-right">
                      {(fraction * 100).toFixed(1)}% / {typeof size === 'number' ? `$${size.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '---'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Risk Analysis */}
      {riskAnalysis && Object.keys(riskAnalysis).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-error/15 flex items-center justify-center">
                <IconShield size={16} className="text-error" />
              </div>
              <h3 className="font-semibold text-sm">Risk Analysis</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Symbol</th>
                    <th className="text-xs">Risk Score</th>
                    <th className="text-xs">Daily VaR</th>
                    <th className="text-xs">Daily CVaR</th>
                    <th className="text-xs">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(riskAnalysis).map(([symbol, data]) => {
                    const riskScore = typeof data.risk_score === 'number' ? data.risk_score : 0.5
                    const varDaily = typeof data.var_daily === 'number' ? data.var_daily : 0
                    const cvarDaily = typeof data.cvar_daily === 'number' ? data.cvar_daily : 0
                    const breach = data.risk_limit_breach === true
                    return (
                      <tr key={symbol}>
                        <td className="font-mono text-sm">{symbol}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <progress
                              className={`progress w-16 ${riskScore > 0.7 ? 'progress-error' : riskScore > 0.4 ? 'progress-warning' : 'progress-success'}`}
                              value={riskScore}
                              max="1"
                            />
                            <span className="font-mono text-xs">{(riskScore * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-error">{(varDaily * 100).toFixed(2)}%</td>
                        <td className="font-mono text-xs text-error">{(cvarDaily * 100).toFixed(2)}%</td>
                        <td>
                          {breach ? (
                            <span className="badge badge-xs badge-error gap-1">
                              <IconAlertTriangle size={10} /> Breach
                            </span>
                          ) : (
                            <span className="badge badge-xs badge-success">OK</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Phase 4: TDA Anomaly Detection */}
      {tdaAnalysis && Object.keys(tdaAnalysis).length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <IconFlask size={16} className="text-warning" />
              </div>
              <h3 className="font-semibold text-sm">TDA Anomaly Detection</h3>
              <span className="badge badge-xs badge-ghost ml-auto">Topological Analysis</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="text-xs">Symbol</th>
                    <th className="text-xs">Anomaly</th>
                    <th className="text-xs">Regime Change</th>
                    <th className="text-xs">Betti-0</th>
                    <th className="text-xs">Betti-1</th>
                    <th className="text-xs">Entropy</th>
                    <th className="text-xs">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tdaAnalysis).map(([symbol, data]) => {
                    const anomaly = typeof data.anomaly_score === 'number' ? data.anomaly_score : null
                    const regimeChange = typeof data.regime_change_probability === 'number' ? data.regime_change_probability : null
                    const betti0 = data.betti_0 ?? '-'
                    const betti1 = data.betti_1 ?? '-'
                    const entropy = typeof data.total_entropy === 'number' ? data.total_entropy : null
                    const isAnomalous = anomaly != null && anomaly >= 1.5
                    const isRegimeChange = regimeChange != null && regimeChange >= 0.6
                    const alertLevel = isAnomalous && anomaly >= 2.25 ? 'critical' : isRegimeChange ? 'high' : isAnomalous ? 'medium' : 'none'
                    return (
                      <tr key={symbol}>
                        <td className="font-mono text-sm">{symbol}</td>
                        <td>
                          {anomaly != null ? (
                            <div className="flex items-center gap-2">
                              <progress
                                className={`progress w-12 ${anomaly >= 2.25 ? 'progress-error' : anomaly >= 1.5 ? 'progress-warning' : 'progress-success'}`}
                                value={Math.min(anomaly / 3, 1)}
                                max="1"
                              />
                              <span className={`font-mono text-xs ${anomaly >= 2.25 ? 'text-error' : anomaly >= 1.5 ? 'text-warning' : 'text-success'}`}>
                                {anomaly.toFixed(2)}
                              </span>
                            </div>
                          ) : <span className="text-base-content/30 text-xs">N/A</span>}
                        </td>
                        <td>
                          {regimeChange != null ? (
                            <span className={`font-mono text-xs ${regimeChange >= 0.6 ? 'text-error font-bold' : regimeChange >= 0.3 ? 'text-warning' : 'text-success'}`}>
                              {(regimeChange * 100).toFixed(1)}%
                            </span>
                          ) : <span className="text-base-content/30 text-xs">N/A</span>}
                        </td>
                        <td className="font-mono text-xs">{betti0}</td>
                        <td className="font-mono text-xs">{betti1}</td>
                        <td>
                          {entropy != null ? (
                            <span className={`font-mono text-xs ${entropy >= 0.8 ? 'text-warning' : 'text-base-content/60'}`}>
                              {entropy.toFixed(2)}
                            </span>
                          ) : <span className="text-base-content/30 text-xs">N/A</span>}
                        </td>
                        <td>
                          {alertLevel !== 'none' ? (
                            <span className={`badge badge-xs ${alertLevel === 'critical' ? 'badge-error' : alertLevel === 'high' ? 'badge-warning' : 'badge-info'}`}>
                              {alertLevel.toUpperCase()}
                            </span>
                          ) : (
                            <span className="badge badge-xs badge-success">OK</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3: Validation Summary */}
      {validationSummary && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                <IconFlask size={16} className="text-info" />
              </div>
              <h3 className="font-semibold text-sm">Walk-Forward Validation Summary</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-base-300/30 rounded-lg p-3">
                <div className="text-xs text-base-content/40">Passed</div>
                <div className="font-mono font-bold text-lg text-success">
                  {validationSummary.passed || 0}
                </div>
              </div>
              <div className="bg-base-300/30 rounded-lg p-3">
                <div className="text-xs text-base-content/40">Failed</div>
                <div className="font-mono font-bold text-lg text-error">
                  {validationSummary.failed || 0}
                </div>
              </div>
              <div className="bg-base-300/30 rounded-lg p-3">
                <div className="text-xs text-base-content/40">Pending</div>
                <div className="font-mono font-bold text-lg text-base-content/50">
                  {validationSummary.pending || 0}
                </div>
              </div>
              <div className="bg-base-300/30 rounded-lg p-3">
                <div className="text-xs text-base-content/40">Avg Score</div>
                <div className="font-mono font-bold text-lg">
                  {validationSummary.avgScore != null ? `${(validationSummary.avgScore * 100).toFixed(1)}%` : '---'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Correlation Regime Badge */}
      {correlationRegime && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm">Correlation Regime</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge badge-lg ${regimeBadgeClass(typeof correlationRegime === 'string' ? correlationRegime : correlationRegime.regime || 'neutral')}`}>
                {typeof correlationRegime === 'string'
                  ? regimeDisplayLabel(correlationRegime)
                  : regimeDisplayLabel(correlationRegime.regime || 'neutral')}
              </span>
              {typeof correlationRegime === 'object' && correlationRegime.confidence != null && (
                <span className="text-xs text-base-content/40">
                  ({(correlationRegime.confidence * 100).toFixed(0)}% confidence)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Optimization Metrics */}
      {(optimizationMetrics.expected_return != null ||
        optimizationMetrics.sharpe != null ||
        optimizationMetrics.max_dd_before != null ||
        optimizationMetrics.max_dd_after != null) && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
                <IconZap size={16} className="text-success" />
              </div>
              <h3 className="font-semibold text-sm">Optimization Metrics</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {optimizationMetrics.expected_return != null && (
                <div className="bg-base-300/30 rounded-lg p-3">
                  <div className="text-xs text-base-content/40">Expected Return</div>
                  <div className="font-mono font-bold text-lg text-success">
                    {(typeof optimizationMetrics.expected_return === 'number'
                      ? optimizationMetrics.expected_return * 100
                      : parseFloat(optimizationMetrics.expected_return) * 100
                    ).toFixed(2)}%
                  </div>
                </div>
              )}
              {optimizationMetrics.sharpe != null && (
                <div className="bg-base-300/30 rounded-lg p-3">
                  <div className="text-xs text-base-content/40">Sharpe Ratio</div>
                  <div className="font-mono font-bold text-lg">
                    {typeof optimizationMetrics.sharpe === 'number'
                      ? optimizationMetrics.sharpe.toFixed(3)
                      : optimizationMetrics.sharpe}
                  </div>
                </div>
              )}
              {optimizationMetrics.max_dd_before != null && (
                <div className="bg-base-300/30 rounded-lg p-3">
                  <div className="text-xs text-base-content/40">Max DD Before</div>
                  <div className="font-mono font-bold text-lg text-error">
                    {(typeof optimizationMetrics.max_dd_before === 'number'
                      ? optimizationMetrics.max_dd_before * 100
                      : parseFloat(optimizationMetrics.max_dd_before) * 100
                    ).toFixed(1)}%
                  </div>
                </div>
              )}
              {optimizationMetrics.max_dd_after != null && (
                <div className="bg-base-300/30 rounded-lg p-3">
                  <div className="text-xs text-base-content/40">Max DD After</div>
                  <div className="font-mono font-bold text-lg text-success">
                    {(typeof optimizationMetrics.max_dd_after === 'number'
                      ? optimizationMetrics.max_dd_after * 100
                      : parseFloat(optimizationMetrics.max_dd_after) * 100
                    ).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rebalancing Strategy Explanation */}
      {strategyExplanation && (
        <div className="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <div>
            <div className="font-semibold text-sm">Rebalancing Strategy</div>
            <div className="text-xs opacity-80 mt-1">
              {typeof strategyExplanation === 'string'
                ? strategyExplanation
                : JSON.stringify(strategyExplanation)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Trade Recommendation Card ─── */

function TradeCard({ trade, onApprove, onBlock, onValidate, approved, validating }) {
  const isSell = safeUpper(trade.side || trade.action) === 'SELL'
  const sideColor = isSell ? 'border-error/40' : 'border-success/40'
  const sideBg = isSell ? 'bg-error/5' : 'bg-success/5'
  const sideBadge = isSell ? 'badge-error' : 'badge-success'
  const sideLabel = safeUpper(trade.side || trade.action || 'BUY')
  const priorityStyle = getPriorityStyle(trade.priority)
  // Handle both camelCase (from Prisma/DB) and snake_case (from API)
  const orderType = String(trade.orderType || trade.order_type || trade.type || 'market')
  const limitPrice = trade.limitPrice || trade.limit_price
  const estValue = trade.estimatedValue || trade.estimated_value
  // Phase 3: Validation state
  const validationStatus = trade.validationStatus || trade.validation_status
  const validationScore = trade.validationScore ?? trade.validation_score
  const isValidating = validating || validationStatus === 'validating'
  const validationPassed = validationStatus === 'passed'
  const validationFailed = validationStatus === 'failed'
  const validationError = validationStatus === 'error'
  const validationDetails = trade.validationDetails
    ? (typeof trade.validationDetails === 'string' ? JSON.parse(trade.validationDetails) : trade.validationDetails)
    : null

  return (
    <div className={`card bg-base-200 shadow-md border-l-4 ${sideColor} ${sideBg} transition-all`}>
      <div className="card-body p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">{trade.symbol || trade.ticker || '???'}</span>
            <span className={`badge badge-sm ${sideBadge}`}>{sideLabel}</span>
            <span className={`badge badge-sm ${priorityStyle.badge}`}>{priorityStyle.text}</span>
          </div>
          <div className="flex items-center gap-1">
            {validationPassed && (
              <span className="badge badge-sm badge-success gap-1">
                <IconCheckCircle size={12} /> Validated
              </span>
            )}
            {validationFailed && (
              <span className="badge badge-sm badge-error gap-1">
                <IconXCircle size={12} /> Failed WF
              </span>
            )}
            {validationError && (
              <span className="badge badge-sm badge-warning gap-1">
                <IconAlertTriangle size={12} /> Val Error
              </span>
            )}
            {approved === true && (
              <span className="badge badge-sm badge-success gap-1">
                <IconCheck size={12} /> Approved
              </span>
            )}
            {approved === false && (
              <span className="badge badge-sm badge-error gap-1">
                <IconX size={12} /> Blocked
              </span>
            )}
            {approved === null && (
              <span className="badge badge-sm badge-ghost">Pending</span>
            )}
          </div>
        </div>

        {/* Trade Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div>
            <div className="text-xs text-base-content/40">Quantity</div>
            <div className="font-mono font-medium">{trade.qty || trade.quantity || '---'}</div>
          </div>
          <div>
            <div className="text-xs text-base-content/40">Order Type</div>
            <div className="font-mono font-medium">{orderType}</div>
          </div>
          <div>
            <div className="text-xs text-base-content/40">Limit Price</div>
            <div className="font-mono font-medium">
              {limitPrice ? `$${Number(limitPrice).toFixed(2)}` : 'Market'}
            </div>
          </div>
          <div>
            <div className="text-xs text-base-content/40">Est. Value</div>
            <div className="font-mono font-medium">
              {estValue ? `$${Number(estValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
            </div>
          </div>
        </div>

        {/* Phase 2: Strategy & Risk Info */}
        {(trade.strategySignal || trade.kellyFraction != null || trade.riskScore != null) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {trade.strategySignal && (
              <div className="flex items-center gap-1 text-xs bg-base-300/30 rounded px-2 py-1">
                <span className="text-base-content/40">Signal:</span>
                <span className={`font-mono font-medium ${trade.strategySignal === 'long' ? 'text-success' : trade.strategySignal === 'short' ? 'text-error' : 'text-base-content/50'}`}>
                  {trade.strategySignal.toUpperCase()}
                </span>
                {trade.strategyConfidence != null && (
                  <span className="text-base-content/40">({(trade.strategyConfidence * 100).toFixed(0)}%)</span>
                )}
              </div>
            )}
            {trade.kellyFraction != null && (
              <div className="flex items-center gap-1 text-xs bg-base-300/30 rounded px-2 py-1">
                <span className="text-base-content/40">Kelly:</span>
                <span className="font-mono font-medium">{(trade.kellyFraction * 100).toFixed(1)}%</span>
              </div>
            )}
            {trade.riskScore != null && (
              <div className="flex items-center gap-1 text-xs bg-base-300/30 rounded px-2 py-1">
                <span className="text-base-content/40">Risk:</span>
                <span className={`font-mono font-medium ${trade.riskScore > 0.7 ? 'text-error' : trade.riskScore > 0.4 ? 'text-warning' : 'text-success'}`}>
                  {(trade.riskScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {trade.varDaily != null && (
              <div className="flex items-center gap-1 text-xs bg-base-300/30 rounded px-2 py-1">
                <span className="text-base-content/40">VaR:</span>
                <span className="font-mono font-medium text-error">{(trade.varDaily * 100).toFixed(2)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        {trade.reason && (
          <div className="mt-2 text-xs text-base-content/60 bg-base-300/30 rounded-lg p-2">
            {trade.reason}
          </div>
        )}

        {/* Phase 3: Validation Results */}
        {(validationPassed || validationFailed || validationError) && validationDetails && (
          <div className={`mt-2 rounded-lg p-2 text-xs ${validationPassed ? 'bg-success/10 border border-success/20' : validationFailed ? 'bg-error/10 border border-error/20' : 'bg-warning/10 border border-warning/20'}`}>
            <div className="flex items-center gap-2 mb-1">
              {validationPassed ? (
                <IconCheckCircle size={14} className="text-success" />
              ) : validationFailed ? (
                <IconXCircle size={14} className="text-error" />
              ) : (
                <IconAlertTriangle size={14} className="text-warning" />
              )}
              <span className={`font-semibold ${validationPassed ? 'text-success' : validationFailed ? 'text-error' : 'text-warning'}`}>
                Walk-Forward Validation: {validationPassed ? 'PASSED' : validationFailed ? 'FAILED' : 'ERROR'}
              </span>
              {validationScore != null && (
                <span className="font-mono ml-auto">Score: {(validationScore * 100).toFixed(1)}%</span>
              )}
            </div>
            {validationDetails.raw && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-1">
                <div><span className="text-base-content/40">Sharpe:</span> <span className="font-mono">{(validationDetails.raw.sharpe_ratio || 0).toFixed(2)}</span></div>
                <div><span className="text-base-content/40">Win Rate:</span> <span className="font-mono">{((validationDetails.raw.win_rate || 0) * 100).toFixed(1)}%</span></div>
                <div><span className="text-base-content/40">Max DD:</span> <span className="font-mono">{((validationDetails.raw.max_drawdown || 0) * 100).toFixed(1)}%</span></div>
                <div><span className="text-base-content/40">PF:</span> <span className="font-mono">{(validationDetails.raw.profit_factor || 0).toFixed(2)}</span></div>
              </div>
            )}
            {validationFailed && validationDetails.thresholds && (
              <div className="mt-1 text-base-content/50">
                Thresholds: score &ge; 40%, max DD &lt; 30%, PF &gt; 0.8, min 3 trades
              </div>
            )}
          </div>
        )}

        {/* Validation loading indicator */}
        {isValidating && (
          <div className="mt-2 flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-lg px-3 py-2">
            <span className="loading loading-spinner loading-xs text-primary"></span>
            <span className="font-medium">Running walk-forward validation...</span>
            <span className="text-base-content/40">(backtesting historical data)</span>
          </div>
        )}

        {/* Action Buttons */}
        {approved === null && (
          <div className="flex items-center gap-2 mt-3">
            <button
              className="btn btn-sm btn-success gap-1"
              onClick={() => onApprove(trade.id || trade.symbol)}
            >
              <IconCheck size={14} /> Approve
            </button>
            <button
              className="btn btn-sm btn-error btn-outline gap-1"
              onClick={() => onBlock(trade.id || trade.symbol)}
            >
              <IconX size={14} /> Block
            </button>
            {!validationStatus && !isValidating && (
              <button
                className="btn btn-sm btn-outline btn-info gap-1 ml-auto"
                onClick={() => onValidate(trade.id || trade.symbol)}
              >
                <IconFlask size={14} /> Validate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Execution Progress Card ─── */

function ExecutionProgressCard({ trade, status }) {
  const isSell = safeUpper(trade.side || trade.action) === 'SELL'
  const sideBadge = isSell ? 'badge-error' : 'badge-success'

  const statusConfig = {
    pending: { badge: 'badge-ghost', icon: <span className="w-2 h-2 rounded-full bg-base-content/30"></span>, label: 'Pending' },
    submitting: { badge: 'badge-warning', icon: <span className="loading loading-spinner loading-xs"></span>, label: 'Submitting...' },
    filled: { badge: 'badge-success', icon: <IconCheck size={12} />, label: 'Filled' },
    failed: { badge: 'badge-error', icon: <IconX size={12} />, label: 'Failed' },
  }

  const cfg = statusConfig[status] || statusConfig.pending

  return (
    <div className="flex items-center gap-3 bg-base-300/30 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-mono font-medium text-sm truncate">{trade.symbol || trade.ticker}</span>
        <span className={`badge badge-sm ${sideBadge}`}>{safeUpper(trade.side || trade.action || 'BUY')}</span>
        <span className="text-xs text-base-content/40 font-mono">{trade.qty || trade.quantity}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`badge badge-sm ${cfg.badge} gap-1`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
    </div>
  )
}

/* ─── Scheduled Order Card ─── */

function ScheduledOrderCard({ order, onRemove }) {
  return (
    <div className="flex items-center gap-3 bg-base-300/30 rounded-lg px-4 py-3">
      <IconClock size={16} className="text-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-sm">{order.symbol || order.ticker}</span>
          <span className={`badge badge-sm ${safeUpper(order.side) === 'SELL' ? 'badge-error' : 'badge-success'}`}>
            {safeUpper(order.side || order.action || 'BUY')}
          </span>
          <span className="text-xs text-base-content/40 font-mono">x{order.qty || order.quantity}</span>
        </div>
        {order.scheduledFor && (
          <div className="text-xs text-base-content/40 mt-0.5">
            Scheduled: {new Date(order.scheduledFor).toLocaleString()}
          </div>
        )}
      </div>
      {onRemove && (
        <button className="btn btn-xs btn-ghost" onClick={() => onRemove(order.id)}>
          <IconX size={14} />
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Main Component: TradingWorkflow
   ═══════════════════════════════════════════════════ */

export default function TradingWorkflowWithErrorBoundary() {
  return (
    <TradingErrorBoundary>
      <TradingWorkflowInner />
    </TradingErrorBoundary>
  )
}

function TradingWorkflowInner() {
  // Core phase state
  const [phase, setPhase] = useState('idle') // idle | analyzing | review | executing | done
  const [analysisData, setAnalysisData] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [executionResults, setExecutionResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [analyzeStep, setAnalyzeStep] = useState('')

  // Approval tracking: { [tradeId]: true | false | null }
  const [approvals, setApprovals] = useState({})

  // Phase 3: Validation tracking: { [tradeId]: 'validating' | 'passed' | 'failed' | 'error' }
  const [validatingTrades, setValidatingTrades] = useState({})

  // Telegram
  const [telegramChatId, setTelegramChatId] = useState('')
  const [telegramStatus, setTelegramStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [telegramError, setTelegramError] = useState('')

  // Scheduled orders
  const [scheduledOrders, setScheduledOrders] = useState([])
  const [deferredOrders, setDeferredOrders] = useState([])
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')

  // Execution progress per trade
  const [executionProgress, setExecutionProgress] = useState({}) // { [tradeId]: 'pending' | 'submitting' | 'filled' | 'failed' }

  // Confirmation dialog
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false)

  // Ref for simulating analysis steps
  const stepTimerRef = useRef(null)

  // Load latest analysis from DB on mount
  const [loadingLatest, setLoadingLatest] = useState(true)

  useEffect(() => {
    async function loadLatest() {
      try {
        const res = await fetch('/api/trading/recommendations')
        if (res.ok) {
          const data = await res.json()
          if (data.recommendations && data.recommendations.length > 0) {
            // We have saved recommendations — reconstruct the analysis data
            // Fetch the status endpoint which has more context
            const statusRes = await fetch('/api/trading/status')
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.trades && statusData.trades.length > 0) {
                // Normalize trades to ensure all fields are proper types
                const trades = statusData.trades.map(normalizeTrade)
                // Set the trades as recommendations with their current approval status
                setRecommendations(trades)
                // Set approvals based on existing status
                const initApprovals = {}
                trades.forEach(t => {
                  const id = t.id
                  if (t.status === 'approved') initApprovals[id] = true
                  else if (t.status === 'blocked') initApprovals[id] = false
                  else initApprovals[id] = null
                })
                setApprovals(initApprovals)
                // Mark that we have existing data to review
                setAnalysisData({ fromDb: true, analysisId: statusData.analysisId })
                setPhase('review')
              }
            }
          }
        }
      } catch {
        // Silently fail — user can still run fresh analysis
      } finally {
        setLoadingLatest(false)
      }
    }
    loadLatest()
  }, [])

  /* ─── Computed Values ─── */

  const approvedCount = Object.values(approvals).filter(v => v === true).length
  const blockedCount = Object.values(approvals).filter(v => v === false).length
  const pendingCount = Object.values(approvals).filter(v => v === null || v === undefined).length
  const hasApprovedTrades = approvedCount > 0
  const allDecided = pendingCount === 0 && recommendations.length > 0

  /* ─── Cleanup on unmount ─── */
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    }
  }, [])

  /* ─── Handlers ─── */

  // Simulate step progression during analysis
  const simulateAnalysisSteps = useCallback(() => {

const delays = [600, 1200, 1500, 1200, 2000, 1500, 1800, 1000]
    let currentDelay = 0

    ANALYZE_STEPS.forEach((step, idx) => {
      currentDelay += delays[idx] || 1000
      stepTimerRef.current = setTimeout(() => {
        setAnalyzeStep(step.key)
      }, currentDelay)
    })
  }, [])

  // Phase 1: Analyze
  const handleAnalyze = useCallback(async () => {
    setPhase('analyzing')
    setLoading(true)
    setError(null)
    setAnalysisData(null)
    setRecommendations([])
    setApprovals({})
    setExecutionResults(null)
    setExecutionProgress({})
    setDeferredOrders([])
    setTelegramStatus(null)
    setTelegramError('')
    setAnalyzeStep(ANALYZE_STEPS[0].key)
    setValidatingTrades({})

    simulateAnalysisSteps()

    try {
      const res = await fetch('/api/trading/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || `Analysis failed (${res.status})`)
        setPhase('idle')
        setLoading(false)
        return
      }

      setAnalysisData(result)
      const recs = (result.recommendations || result.trades || []).map(normalizeTrade)
      setRecommendations(recs)
      // Initialize all approvals as null (pending)
      const initApprovals = {}
      recs.forEach(r => {
        const id = r.id || r.symbol
        initApprovals[id] = null
      })
      setApprovals(initApprovals)
      setPhase('review')
    } catch (err) {
      setError(err.message || 'Network error')
      setPhase('idle')
    } finally {
      setLoading(false)
    }
  }, [simulateAnalysisSteps])

  // Phase 3: Validate a single trade
  const handleValidate = useCallback((tradeId) => {
    // Mark as validating in local state
    setValidatingTrades(prev => ({ ...prev, [tradeId]: 'validating' }))

    // Call the validate endpoint
    fetch('/api/trading/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId }),
    })
      .then(res => res.json())
      .then(result => {
        const status = result.passed ? 'passed' : 'failed'
        setValidatingTrades(prev => ({ ...prev, [tradeId]: status }))
        // Update the trade's validation data in recommendations
        setRecommendations(prev => prev.map(t => {
          if ((t.id || t.symbol) === tradeId) {
            return {
              ...t,
              validationStatus: status,
              validationScore: result.score,
              validationDetails: result.details || result,
              validatedAt: new Date().toISOString(),
            }
          }
          return t
        }))
      })
      .catch(err => {
        console.error('Validation failed:', err)
        setValidatingTrades(prev => ({ ...prev, [tradeId]: 'error' }))
      })
  }, [])

  // Approve a single trade (Phase 3: auto-validate first)
  const handleApprove = useCallback((tradeId) => {
    setApprovals(prev => ({ ...prev, [tradeId]: true }))
    // Also persist to backend — the approve route will auto-validate if needed (fire and forget)
    fetch('/api/trading/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId, action: 'approve' }),
    })
      .then(res => res.json())
      .then(result => {
        // If backend returned validation info, update local state
        if (result.validation) {
          const vStatus = result.validation.passed ? 'passed' : result.validation.score != null ? 'failed' : 'error'
          setValidatingTrades(prev => ({ ...prev, [tradeId]: vStatus }))
          setRecommendations(prev => prev.map(t => {
            if ((t.id || t.symbol) === tradeId) {
              return {
                ...t,
                validationStatus: vStatus,
                validationScore: result.validation.score || 0,
                validationDetails: result.validation.details || {},
                validatedAt: new Date().toISOString(),
              }
            }
            return t
          }))
        }
      })
      .catch(() => {})
  }, [])

  // Block a single trade
  const handleBlock = useCallback((tradeId) => {
    setApprovals(prev => ({ ...prev, [tradeId]: false }))
    // Also persist to backend (fire and forget)
    fetch('/api/trading/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId, action: 'block' }),
    }).catch(() => {})
  }, [])

  // Approve all
  const handleApproveAll = useCallback(() => {
    setApprovals(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = true })
      return next
    })
    // Persist to backend (fire and forget)
    if (analysisData?.analysisId) {
      fetch('/api/trading/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: analysisData.analysisId }),
      }).catch(() => {})
    }
  }, [analysisData])

  // Block all
  const handleBlockAll = useCallback(() => {
    setApprovals(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = false })
      return next
    })
  }, [])

  // Phase 3: Execute approved trades
  const handleExecute = useCallback(async () => {
    setShowExecuteConfirm(false)
    setPhase('executing')

    const approvedTrades = recommendations.filter(r => {
      const id = r.id || r.symbol
      return approvals[id] === true
    })

    // Initialize all as pending
    const initProgress = {}
    approvedTrades.forEach(t => {
      initProgress[t.id || t.symbol] = 'pending'
    })
    setExecutionProgress(initProgress)

    try {
      // Simulate individual trade submissions for visual progress
      for (let i = 0; i < approvedTrades.length; i++) {
        const trade = approvedTrades[i]
        const id = trade.id || trade.symbol

        // Mark as submitting
        setExecutionProgress(prev => ({ ...prev, [id]: 'submitting' }))

        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800))
      }

      // Call the execute endpoint
      const res = await fetch('/api/trading/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: approvedTrades }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || `Execution failed (${res.status})`)
        setPhase('review')
        return
      }

      setExecutionResults(result)

      // Update progress based on results
      const resultsList = result.results || result.executions || []
      const newProgress = {}
      const newDeferred = []

      resultsList.forEach(r => {
        const id = r.id || r.symbol || r.trade_id
        newProgress[id] = r.status === 'filled' || r.status === 'success' ? 'filled' : 'failed'
        if (r.status === 'failed' || r.status === 'deferred' || r.insufficient_buying_power) {
          newDeferred.push(r)
        }
      })

      // Fill in any trades not in results
      approvedTrades.forEach(t => {
        const id = t.id || t.symbol
        if (!newProgress[id]) {
          newProgress[id] = 'filled'
        }
      })

      setExecutionProgress(newProgress)
      setDeferredOrders(newDeferred)
      setPhase('done')
    } catch (err) {
      setError(err.message || 'Network error during execution')
      setPhase('review')
    }
  }, [recommendations, approvals])

  // Phase 4: Send Telegram report
  const handleTelegramSend = useCallback(async () => {
    if (!telegramChatId.trim()) return
    setTelegramStatus('sending')
    setTelegramError('')

    try {
      const res = await fetch('/api/telegram/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          analysis: analysisData,
          execution: executionResults,
        }),
      })
      const result = await res.json()

      if (!res.ok) {
        setTelegramStatus('error')
        setTelegramError(result.error || `Telegram send failed (${res.status})`)
        return
      }

      setTelegramStatus('sent')
    } catch (err) {
      setTelegramStatus('error')
      setTelegramError(err.message || 'Network error')
    }
  }, [telegramChatId, analysisData, executionResults])

  // Phase 5: Schedule deferred order
  const handleScheduleOrder = useCallback((order) => {
    if (!scheduleDate || !scheduleTime) return
    const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`)
    const newOrder = {
      ...order,
      id: order.id || order.symbol || `sched-${Date.now()}`,
      scheduledFor: scheduledFor.toISOString(),
    }
    setScheduledOrders(prev => [...prev, newOrder])
    setDeferredOrders(prev => prev.filter(o => (o.id || o.symbol) !== (order.id || order.symbol)))
  }, [scheduleDate, scheduleTime])

  // Remove scheduled order
  const handleRemoveScheduled = useCallback((orderId) => {
    setScheduledOrders(prev => prev.filter(o => o.id !== orderId))
  }, [])

  // Reset workflow
  const handleReset = useCallback(() => {
    setPhase('idle')
    setAnalysisData(null)
    setRecommendations([])
    setExecutionResults(null)
    setLoading(false)
    setError(null)
    setAnalyzeStep('')
    setApprovals({})
    setExecutionProgress({})
    setValidatingTrades({})
    setTelegramStatus(null)
    setTelegramError('')
    setDeferredOrders([])
  }, [])

  /* ═══════════════════════════════════════════
     Render
     ═══════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ── Section Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-primary">Trading Workflow</h2>
          <span className="badge badge-primary badge-sm">Automated</span>
        </div>
        {phase !== 'idle' && (
          <button className="btn btn-sm btn-ghost gap-1" onClick={handleReset}>
            <IconRefresh size={14} /> Reset
          </button>
        )}
      </div>

      {/* ── Phase Indicator ── */}
      {phase !== 'idle' && (
        <div className="flex items-center gap-2 flex-wrap">
          {['analyze', 'review', 'execute', 'report', 'schedule'].map((p, idx) => {
            const phaseMap = { analyze: 'analyzing', review: 'review', execute: 'executing', report: 'done', schedule: 'done' }
            const isActive = phase === phaseMap[p] || (p === 'report' && phase === 'done' && executionResults) || (p === 'schedule' && phase === 'done' && deferredOrders.length > 0)
            const isComplete = (() => {
              if (p === 'analyze') return phase === 'review' || phase === 'executing' || phase === 'done'
              if (p === 'review') return phase === 'executing' || phase === 'done'
              if (p === 'execute') return phase === 'done' && executionResults
              return false
            })()
            return (
              <div key={p} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isComplete ? 'bg-success text-success-content' : isActive ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/40'
                }`}>
                  {isComplete ? <IconCheck size={14} /> : idx + 1}
                </div>
                <span className={`text-xs capitalize ${isActive ? 'text-primary font-semibold' : isComplete ? 'text-success' : 'text-base-content/40'}`}>
                  {p}
                </span>
                {idx < 4 && <span className="text-base-content/20 mx-1">→</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Error Display ── */}
      {error && (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{error}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Phase 1: IDLE — Big Analyze Button
          ═══════════════════════════════════════════ */}
      {phase === 'idle' && loadingLatest && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body items-center text-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="text-sm text-base-content/60 mt-3">Loading latest analysis...</p>
          </div>
        </div>
      )}

      {phase === 'idle' && !loadingLatest && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body items-center text-center py-12">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <IconZap size={40} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">Portfolio Analysis & Trade Generation</h3>
            <p className="text-sm text-base-content/60 max-w-lg mb-6">
              Analyze your current portfolio, detect market regimes, optimize allocations, and generate
              intelligent trade recommendations — all in one click.
            </p>
            <button
              className="btn btn-primary btn-lg gap-2 w-full max-w-md"
              onClick={handleAnalyze}
            >
              <IconChart size={22} />
              Analyze Portfolio & Generate Trades
            </button>
            <p className="text-xs text-base-content/30 mt-3">
              This will fetch positions, detect regimes, analyze correlations, and generate trade recommendations
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Phase 1b: ANALYZING — Loading indicator
          ═══════════════════════════════════════════ */}
      {phase === 'analyzing' && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-6">
            <AnalysisLoadingIndicator currentStep={analyzeStep} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Phase 2: REVIEW — Analysis Results + Recommendations
          ═══════════════════════════════════════════ */}
      {phase === 'review' && analysisData && (
        <>
          {/* Analysis Summary */}
          <AnalysisSummary data={analysisData} />

          {/* Divider */}
          <div className="divider text-base-content/40 uppercase tracking-wider text-sm font-semibold">
            Trade Recommendations
          </div>

          {/* Recommendation Controls */}
          {recommendations.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">
                  {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
                </span>
                <span className="badge badge-sm badge-success">{approvedCount} approved</span>
                <span className="badge badge-sm badge-error">{blockedCount} blocked</span>
                <span className="badge badge-sm badge-ghost">{pendingCount} pending</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm btn-success gap-1"
                  onClick={handleApproveAll}
                  disabled={pendingCount === 0}
                >
                  <IconCheck size={14} /> Approve All
                </button>
                <button
                  className="btn btn-sm btn-outline btn-info gap-1"
                  onClick={() => {
                    recommendations.forEach(t => {
                      const id = t.id || t.symbol
                      if (!t.validationStatus && !validatingTrades[id]) {
                        handleValidate(id)
                      }
                    })
                  }}
                >
                  <IconFlask size={14} /> Validate All
                </button>
                <button
                  className="btn btn-sm btn-error btn-outline gap-1"
                  onClick={handleBlockAll}
                  disabled={pendingCount === 0}
                >
                  <IconX size={14} /> Block All
                </button>
              </div>
            </div>
          )}

          {/* Trade Cards */}
          <div className="space-y-3">
            {recommendations.map((trade, i) => {
              const id = trade.id || trade.symbol
              return (
                <TradeCard
                  key={id || i}
                  trade={trade}
                  onApprove={handleApprove}
                  onBlock={handleBlock}
                  onValidate={handleValidate}
                  approved={approvals[id]}
                  validating={validatingTrades[id] === 'validating'}
                />
              )
            })}
          </div>

          {/* Proceed to Execution */}
          {allDecided && (
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body p-4 items-center text-center">
                {hasApprovedTrades ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <IconCheck size={20} className="text-success" />
                      <span className="font-semibold">All recommendations reviewed</span>
                    </div>
                    <p className="text-sm text-base-content/60 mb-4">
                      {approvedCount} trade{approvedCount !== 1 ? 's' : ''} approved and ready to execute.
                      {blockedCount > 0 && ` ${blockedCount} trade${blockedCount !== 1 ? 's' : ''} blocked.`}
                    </p>
                    <button
                      className="btn btn-primary gap-2"
                      onClick={() => setShowExecuteConfirm(true)}
                    >
                      <IconPlay size={18} /> Execute Approved Trades
                    </button>
                  </>
                ) : (
                  <div className="alert alert-warning max-w-md">
                    <IconAlertTriangle size={18} className="shrink-0" />
                    <span className="text-sm">All trades have been blocked. Nothing to execute.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Execute even if not all decided yet but has approved trades */}
          {!allDecided && hasApprovedTrades && (
            <div className="flex justify-center">
              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={() => setShowExecuteConfirm(true)}
              >
                <IconPlay size={16} /> Execute {approvedCount} Approved Trade{approvedCount !== 1 ? 's' : ''} Now
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════
          Phase 3: EXECUTING — Real-time progress
          ═══════════════════════════════════════════ */}
      {phase === 'executing' && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="loading loading-spinner loading-md text-primary"></span>
              <div>
                <h3 className="font-semibold">Executing Trades</h3>
                <p className="text-xs text-base-content/40">Submitting approved orders to the broker...</p>
              </div>
            </div>

            <div className="space-y-2">
              {recommendations
                .filter(r => approvals[r.id || r.symbol] === true)
                .map((trade, i) => {
                  const id = trade.id || trade.symbol
                  return (
                    <ExecutionProgressCard
                      key={id || i}
                      trade={trade}
                      status={executionProgress[id] || 'pending'}
                    />
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Phase 3b/4: DONE — Execution Results
          ═══════════════════════════════════════════ */}
      {phase === 'done' && (
        <>
          {/* Execution Summary */}
          {executionResults && (
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body p-6">
                <div className="flex items-center gap-2 mb-4">
                  <IconCheck size={20} className="text-success" />
                  <h3 className="font-semibold">Execution Complete</h3>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <MetricCard
                    label="Total Trades"
                    value={recommendations.filter(r => approvals[r.id || r.symbol] === true).length.toString()}
                    icon="📊"
                  />
                  <MetricCard
                    label="Filled"
                    value={Object.values(executionProgress).filter(s => s === 'filled').length.toString()}
                    colorClass="text-success"
                    icon="✅"
                  />
                  <MetricCard
                    label="Failed"
                    value={Object.values(executionProgress).filter(s => s === 'failed').length.toString()}
                    colorClass="text-error"
                    icon="❌"
                  />
                  <MetricCard
                    label="Deferred"
                    value={deferredOrders.length.toString()}
                    colorClass="text-warning"
                    icon="⏳"
                  />
                </div>

                {/* Individual Results */}
                <div className="space-y-2">
                  {recommendations
                    .filter(r => approvals[r.id || r.symbol] === true)
                    .map((trade, i) => {
                      const id = trade.id || trade.symbol
                      return (
                        <ExecutionProgressCard
                          key={id || i}
                          trade={trade}
                          status={executionProgress[id] || 'pending'}
                        />
                      )
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
              Phase 4: Telegram Report
              ═══════════════════════════════════════ */}
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                  <IconSend size={16} className="text-info" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Send Telegram Report</h3>
                  <span className="text-xs text-base-content/40">Share results via Telegram bot</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Telegram Chat ID (e.g. -1001234567890)"
                  className="input input-bordered input-sm flex-1 font-mono"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  disabled={telegramStatus === 'sending'}
                />
                <button
                  className="btn btn-sm btn-info gap-1 shrink-0"
                  onClick={handleTelegramSend}
                  disabled={!telegramChatId.trim() || telegramStatus === 'sending'}
                >
                  {telegramStatus === 'sending' ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <IconSend size={14} />
                  )}
                  Send Report
                </button>
              </div>

              {telegramStatus === 'sent' && (
                <div className="alert alert-success mt-3 py-2">
                  <IconCheck size={16} />
                  <span className="text-sm">Report sent successfully to Telegram!</span>
                </div>
              )}
              {telegramStatus === 'error' && (
                <div className="alert alert-error mt-3 py-2">
                  <IconX size={16} />
                  <span className="text-sm">{telegramError || 'Failed to send report'}</span>
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════
              Phase 5: Schedule Deferred Orders
              ═══════════════════════════════════════ */}
          {deferredOrders.length > 0 && (
            <div className="card bg-base-200 shadow-lg border border-warning/20">
              <div className="card-body p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                    <IconClock size={16} className="text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Deferred Orders</h3>
                    <span className="text-xs text-base-content/40">
                      {deferredOrders.length} order{deferredOrders.length !== 1 ? 's' : ''} couldn&apos;t execute — schedule for later
                    </span>
                  </div>
                </div>

                {/* Date/Time picker */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs">Date</span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered input-sm font-mono"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs">Time</span>
                    </label>
                    <input
                      type="time"
                      className="input input-bordered input-sm font-mono"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Deferred order list */}
                <div className="space-y-2">
                  {deferredOrders.map((order, i) => {
                    const id = order.id || order.symbol || `deferred-${i}`
                    return (
                      <div key={id} className="flex items-center gap-3 bg-base-300/30 rounded-lg px-4 py-3">
                        <IconAlertTriangle size={16} className="text-warning shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{order.symbol || order.ticker}</span>
                            <span className={`badge badge-sm ${safeUpper(order.side) === 'SELL' ? 'badge-error' : 'badge-success'}`}>
                              {safeUpper(order.side || order.action || 'BUY')}
                            </span>
                            <span className="text-xs text-base-content/40 font-mono">x{order.qty || order.quantity}</span>
                          </div>
                          {order.reason && (
                            <div className="text-xs text-base-content/40 mt-0.5">{order.reason}</div>
                          )}
                        </div>
                        <button
                          className="btn btn-xs btn-warning gap-1"
                          onClick={() => handleScheduleOrder(order)}
                          disabled={!scheduleDate || !scheduleTime}
                        >
                          <IconClock size={12} /> Schedule
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Scheduled Orders List */}
          {scheduledOrders.length > 0 && (
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body p-6">
                <div className="flex items-center gap-2 mb-4">
                  <IconClock size={18} className="text-warning" />
                  <h3 className="font-semibold text-sm">
                    Scheduled Orders ({scheduledOrders.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {scheduledOrders.map((order) => (
                    <ScheduledOrderCard
                      key={order.id}
                      order={order}
                      onRemove={handleRemoveScheduled}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Restart Button */}
          <div className="flex justify-center">
            <button className="btn btn-primary gap-2" onClick={handleReset}>
              <IconRefresh size={16} /> New Analysis
            </button>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          Execute Confirmation Dialog
          ═══════════════════════════════════════════ */}
      {showExecuteConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <IconAlertTriangle size={22} className="text-warning" />
              Confirm Execution
            </h3>
            <p className="py-4 text-sm text-base-content/70">
              You are about to execute <strong className="text-success">{approvedCount} trade{approvedCount !== 1 ? 's' : ''}</strong>.
              This will submit real orders to your broker. This action cannot be undone.
            </p>
            <div className="bg-base-300/30 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
              {recommendations
                .filter(r => approvals[r.id || r.symbol] === true)
                .map((trade, i) => {
                  const id = trade.id || trade.symbol
                  const isSell = safeUpper(trade.side || trade.action) === 'SELL'
                  return (
                    <div key={id || i} className="flex items-center gap-2 py-1 text-sm">
                      <span className={`badge badge-xs ${isSell ? 'badge-error' : 'badge-success'}`}>
                        {safeUpper(trade.side || trade.action || 'BUY')}
                      </span>
                      <span className="font-mono">{trade.symbol || trade.ticker}</span>
                      <span className="text-base-content/40">x{trade.qty || trade.quantity}</span>
                      {trade.limit_price && (
                        <span className="text-base-content/40 font-mono text-xs">
                          @ ${Number(trade.limit_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowExecuteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm gap-1"
                onClick={handleExecute}
              >
                <IconPlay size={14} /> Execute {approvedCount} Trade{approvedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowExecuteConfirm(false)}></div>
        </div>
      )}
    </div>
  )
}
