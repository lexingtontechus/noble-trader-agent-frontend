'use client'

import { useStream } from '@/context/StreamContext'
import useStreamPrice from '@/hooks/useStreamPrice'

const DEFAULT_SYMBOLS = ['SPY', 'BTC-USD', 'GC=F']
const ALL_SYMBOLS = ['SPY', 'BTC-USD', 'GC=F', 'QQQ', 'EURUSD=X']

/** Per-symbol row that uses the stream hook to show live prices */
function StreamRow({ symbol }) {
  const { price, connected, tickCount, sseMode } = useStreamPrice(symbol)

  return (
    <div className="flex items-center justify-between bg-base-300 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {connected ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
          )}
        </span>
        <span className="font-mono font-bold text-sm">{symbol}</span>
      </div>
      <div className="flex items-center gap-3">
        {price != null && (
          <span className="font-mono text-sm font-semibold">
            {typeof price === 'number' ? price.toFixed(2) : price}
          </span>
        )}
        <span className="text-xs text-base-content/50">{tickCount} ticks</span>
        {sseMode && (
          <span className="badge badge-xs badge-outline">{sseMode.toUpperCase()}</span>
        )}
      </div>
    </div>
  )
}

export default function StreamStatusPanel() {
  const { subscriptions, activeStreamCount, streamAll, stopAll } = useStream()
  const symbols = Object.entries(subscriptions).filter(([, active]) => active).map(([sym]) => sym)

  if (symbols.length === 0) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body items-center text-center py-6">
          <div className="text-2xl mb-2">📡</div>
          <p className="text-base-content/50 text-sm mb-4">No active streams</p>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={() => streamAll(DEFAULT_SYMBOLS)}>
              Stream Defaults
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => streamAll(ALL_SYMBOLS)}>
              Go Live All
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title text-base">
            📡 Live Streams
            <span className="badge badge-primary badge-sm">{activeStreamCount}</span>
          </h3>
          <div className="flex gap-2">
            <button className="btn btn-xs btn-ghost" onClick={() => streamAll(ALL_SYMBOLS)}>Go Live All</button>
            <button className="btn btn-xs btn-error btn-outline" onClick={stopAll}>Stop All</button>
          </div>
        </div>
        <div className="space-y-2">
          {symbols.map((sym) => (
            <StreamRow key={sym} symbol={sym} />
          ))}
        </div>
      </div>
    </div>
  )
}
