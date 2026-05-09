'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useStream } from '@/context/StreamContext'

export default function useStreamPrice(symbol) {
  const { subscriptions, incrementTick, setStreamActive } = useStream()
  const isActive = !!subscriptions[symbol]

  const [price, setPrice] = useState(null)
  const [regime, setRegime] = useState(null)
  const [connected, setConnected] = useState(false)
  const [tickCount, setTickCount] = useState(0)
  const [connectedAt, setConnectedAt] = useState(null)
  const [sseMode, setSseMode] = useState(null) // 'sse' | 'poll'

  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    if (!isActive || !symbol) {
      setConnected(false)
      setSseMode(null)
      return
    }

    let cancelled = false
    let pollInterval = null

    async function startStreaming() {
      // Try seeding the FastAPI session (non-blocking — don't wait for it)
      // This is best-effort; if it fails, we still poll Yahoo Finance directly
      seedWithRetry(symbol).catch(() => {})

      if (cancelled) return

      // Skip SSE — FastAPI SSE requires auth/CORS that's not available from the client.
      // Go straight to polling via our BFF route which queries Yahoo Finance directly.
      startPolling()
    }

    function startPolling() {
      if (cancelled) return
      setSseMode('poll')
      setConnected(true)
      setConnectedAt(new Date())

      // Fetch immediately
      fetchLatestPrice()

      // Then poll every 5 seconds
      pollInterval = setInterval(() => {
        if (!cancelled) fetchLatestPrice()
      }, 5000)
    }

    async function fetchLatestPrice() {
      try {
        const res = await fetch(`/api/stream/latest-price?symbol=${encodeURIComponent(symbol)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.price != null) setPrice(data.price)
          if (data.regime_label) setRegime(data.regime_label)
          incrementTick(symbol)
          setTickCount((prev) => prev + 1)
        }
      } catch {
        // ignore polling errors
      }
    }

    async function seedWithRetry(sym, retries = 2) {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch('/api/stream/seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym }),
          })
          if (res.ok) return true
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, (i + 1) * 500))
      }
      return false
    }

    startStreaming()

    return () => {
      cancelled = true
      if (pollInterval) clearInterval(pollInterval)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      setConnected(false)
    }
  }, [isActive, symbol, incrementTick])

  return { price, regime, connected, tickCount, connectedAt, sseMode, isActive }
}
