"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * OrderFlowPanel — Real-time order flow visualization.
 *
 * Features:
 *   - Time & Sales tape (last N trades with color-coded direction)
 *   - Volume Profile (horizontal histogram at price levels)
 *   - Cumulative Delta (buy vs sell pressure)
 *   - Bid/Ask spread from Alpaca Market Data API
 *   - Trade velocity indicator (trades per second)
 *
 * All trade data comes from the Finnhub WebSocket via PriceFeedContext.
 * Bid/Ask comes from Alpaca Market Data API (polled every 5s).
 */

const MAX_TAPE_ENTRIES = 100;
const VOLUME_PROFILE_BUCKETS = 30;

export default function OrderFlowPanel() {
  const {
    selectedSymbol,
    prices,
    priceHistory,
    connected,
  } = usePriceFeed();

  // ── Time & Sales tape ──────────────────────────────────────────────────
  const [tape, setTape] = useState([]);
  const prevPriceRef = useRef(null);

  // ── Volume Profile ─────────────────────────────────────────────────────
  const [volumeProfile, setVolumeProfile] = useState([]);

  // ── Cumulative Delta ───────────────────────────────────────────────────
  const [cumulativeDelta, setCumulativeDelta] = useState(0);
  const [deltaHistory, setDeltaHistory] = useState([]);
  const deltaRef = useRef(0);

  // ── Bid/Ask from Alpaca ────────────────────────────────────────────────
  const [bidAsk, setBidAsk] = useState(null);
  const [bidAskLoading, setBidAskLoading] = useState(false);

  // ── Trade velocity ─────────────────────────────────────────────────────
  const [tradeVelocity, setTradeVelocity] = useState(0);
  const tradeTimestampsRef = useRef([]);

  // ── Feed source tracking ───────────────────────────────────────────────
  const [feedSources, setFeedSources] = useState({ finnhub: false, alpaca: false });

  // Process trade ticks for the selected symbol
  useEffect(() => {
    const priceData = prices[selectedSymbol];
    if (!priceData) return;

    const { price, volume, direction, change } = priceData;
    const prev = prevPriceRef.current;

    // Determine trade side: uptick = buyer-initiated, downtick = seller-initiated
    const side = direction === "up" ? "buy" : direction === "down" ? "sell" : "neutral";
    const delta = side === "buy" ? (volume || 1) : side === "sell" ? -(volume || 1) : 0;

    // Update tape
    setTape((prev) => [
      {
        price,
        volume: volume || 1,
        side,
        change,
        timestamp: new Date(),
      },
      ...prev,
    ].slice(0, MAX_TAPE_ENTRIES));

    // Update cumulative delta
    deltaRef.current += delta;
    setCumulativeDelta(deltaRef.current);
    setDeltaHistory((prev) => [
      ...prev.slice(-99),
      { delta: deltaRef.current, timestamp: new Date() },
    ]);

    // Track velocity
    const now = Date.now();
    tradeTimestampsRef.current.push(now);
    tradeTimestampsRef.current = tradeTimestampsRef.current.filter(t => now - t < 5000);

    prevPriceRef.current = priceData;
    setFeedSources(f => ({ ...f, finnhub: true }));
  }, [prices, selectedSymbol]);

  // Trade velocity calculator
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const recent = tradeTimestampsRef.current.filter(t => now - t < 5000);
      tradeTimestampsRef.current = recent;
      setTradeVelocity(Math.round((recent.length / 5) * 10) / 10);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute volume profile from price history
  useEffect(() => {
    const history = priceHistory[selectedSymbol];
    if (!history || history.length < 2) {
      setVolumeProfile([]);
      return;
    }

    // Build from tape data instead for better accuracy
    if (tape.length < 2) {
      setVolumeProfile([]);
      return;
    }

    const prices_arr = tape.map(t => t.price);
    const minPrice = Math.min(...prices_arr);
    const maxPrice = Math.max(...prices_arr);
    const range = maxPrice - minPrice;

    if (range === 0) {
      setVolumeProfile([{ price: minPrice, buyVol: tape.filter(t => t.side === "buy").reduce((s, t) => s + t.volume, 0), sellVol: tape.filter(t => t.side === "sell").reduce((s, t) => s + t.volume, 0), priceLevel: minPrice }]);
      return;
    }

    const bucketSize = range / VOLUME_PROFILE_BUCKETS;
    const buckets = [];

    for (let i = 0; i < VOLUME_PROFILE_BUCKETS; i++) {
      const low = minPrice + i * bucketSize;
      const high = low + bucketSize;
      const mid = (low + high) / 2;

      const tradesInBucket = tape.filter(t => t.price >= low && t.price < high);
      const buyVol = tradesInBucket.filter(t => t.side === "buy").reduce((s, t) => s + t.volume, 0);
      const sellVol = tradesInBucket.filter(t => t.side === "sell").reduce((s, t) => s + t.volume, 0);

      if (buyVol > 0 || sellVol > 0) {
        buckets.push({ price: mid, buyVol, sellVol, totalVol: buyVol + sellVol });
      }
    }

    setVolumeProfile(buckets);
  }, [tape, selectedSymbol, priceHistory]);

  // Fetch bid/ask from Alpaca Market Data API
  useEffect(() => {
    if (!selectedSymbol) return;

    let cancelled = false;

    async function fetchBidAsk() {
      setBidAskLoading(true);
      try {
        const res = await fetch(`/api/alpaca/market-data/quote?symbol=${encodeURIComponent(selectedSymbol)}`);
        if (!res.ok) {
          if (!cancelled) setBidAsk(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setBidAsk(data);
          setFeedSources(f => ({ ...f, alpaca: true }));
        }
      } catch {
        if (!cancelled) setBidAsk(null);
      } finally {
        if (!cancelled) setBidAskLoading(false);
      }
    }

    fetchBidAsk();
    const interval = setInterval(fetchBidAsk, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedSymbol]);

  // Reset state when symbol changes
  useEffect(() => {
    setTape([]);
    setCumulativeDelta(0);
    deltaRef.current = 0;
    setDeltaHistory([]);
    setVolumeProfile([]);
    prevPriceRef.current = null;
    setBidAsk(null);
  }, [selectedSymbol]);

  // ── Derived values ─────────────────────────────────────────────────────
  const currentPrice = prices[selectedSymbol]?.price;
  const maxVolume = useMemo(
    () => Math.max(1, ...volumeProfile.map(b => b.totalVol)),
    [volumeProfile]
  );

  const spread = bidAsk?.bid && bidAsk?.ask
    ? (bidAsk.ask - bidAsk.bid).toFixed(4)
    : null;

  const spreadBps = bidAsk?.bid && bidAsk?.ask && bidAsk.bid > 0
    ? ((bidAsk.ask - bidAsk.bid) / bidAsk.bid * 10000).toFixed(1)
    : null;

  // ── Tape entry component ───────────────────────────────────────────────
  const TapeEntry = useCallback(({ entry }) => {
    const isBuy = entry.side === "buy";
    const isSell = entry.side === "sell";
    const timeStr = entry.timestamp.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return (
      <div className={`flex items-center gap-2 px-2 py-0.5 text-[11px] font-mono ${
        isBuy ? "bg-success/5" : isSell ? "bg-error/5" : ""
      }`}>
        <span className="text-base-content/30 w-16 shrink-0">{timeStr}</span>
        <span className={`w-12 shrink-0 text-right font-semibold ${
          isBuy ? "text-success" : isSell ? "text-error" : "text-base-content/60"
        }`}>
          {entry.price?.toFixed(2)}
        </span>
        <span className="text-base-content/40 w-10 shrink-0 text-right">
          {entry.volume || "—"}
        </span>
        <span className={`w-6 shrink-0 text-center ${
          isBuy ? "text-success" : isSell ? "text-error" : "text-base-content/30"
        }`}>
          {isBuy ? "▲" : isSell ? "▼" : "—"}
        </span>
      </div>
    );
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-300 bg-base-200/30 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold">Order Flow</span>
            <span className="badge badge-xs badge-ghost">{selectedSymbol}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-base-content/40">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-success" : "bg-base-content/20"}`} />
              {connected ? "Live" : "Off"}
            </span>
            {tradeVelocity > 0 && (
              <span>{tradeVelocity} t/s</span>
            )}
          </div>
        </div>

        {/* Bid/Ask Spread Bar */}
        {bidAsk?.bid && bidAsk?.ask && (
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-error/80">B {bidAsk.bid.toFixed(2)}</span>
              <span className="text-base-content/20">×{bidAsk.bidSize || "—"}</span>
            </div>
            <div className="flex items-center gap-1 text-base-content/40">
              <span>{spread}</span>
              <span>({spreadBps}bps)</span>
              {feedSources.alpaca && (
                <span className="badge badge-xs badge-accent/50">Alpaca</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-base-content/20">×{bidAsk.askSize || "—"}</span>
              <span className="text-success/80">A {bidAsk.ask.toFixed(2)}</span>
            </div>
          </div>
        )}
        {bidAskLoading && !bidAsk && (
          <div className="mt-1.5 text-[10px] text-base-content/30 animate-pulse">Loading bid/ask...</div>
        )}
      </div>

      {/* Main content: Volume Profile + Tape + Delta */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Volume Profile — left side */}
        <div className="w-28 shrink-0 border-r border-base-300 overflow-y-auto scrollbar-none hidden md:block">
          <div className="px-1 py-1 text-[9px] text-center text-base-content/30 border-b border-base-300 sticky top-0 bg-base-100">
            Vol Profile
          </div>
          {volumeProfile.length > 0 ? (
            <div className="py-0.5">
              {volumeProfile.map((bucket, i) => {
                const buyPct = (bucket.buyVol / maxVolume) * 100;
                const sellPct = (bucket.sellVol / maxVolume) * 100;
                return (
                  <div key={i} className="flex items-center px-1 py-px hover:bg-base-200/50">
                    <span className="text-[9px] font-mono text-base-content/40 w-16 shrink-0 text-right mr-1">
                      {bucket.price.toFixed(2)}
                    </span>
                    <div className="flex-1 flex gap-px h-2.5">
                      <div
                        className="bg-success/40 rounded-l-sm"
                        style={{ width: `${buyPct}%` }}
                      />
                      <div
                        className="bg-error/40 rounded-r-sm"
                        style={{ width: `${sellPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-2 text-[10px] text-base-content/20 text-center">
              Waiting for data...
            </div>
          )}
        </div>

        {/* Time & Sales Tape — center */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-2 py-0.5 text-[9px] text-base-content/30 border-b border-base-300 flex items-center justify-between shrink-0 bg-base-100">
            <span>Time & Sales</span>
            <span>{tape.length} trades</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {tape.length > 0 ? (
              tape.map((entry, i) => <TapeEntry key={i} entry={entry} />)
            ) : (
              <div className="p-4 text-xs text-base-content/20 text-center">
                Waiting for trades...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Cumulative Delta bar */}
      <div className="border-t border-base-300 px-3 py-1.5 bg-base-200/30 shrink-0">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-base-content/40">Cumulative Delta</span>
          <span className={`font-mono font-bold ${
            cumulativeDelta > 0 ? "text-success" : cumulativeDelta < 0 ? "text-error" : "text-base-content/40"
          }`}>
            {cumulativeDelta > 0 ? "+" : ""}{cumulativeDelta.toLocaleString()}
          </span>
        </div>
        {/* Delta bar visualization */}
        <div className="mt-1 h-1.5 bg-base-300 rounded-full overflow-hidden">
          {deltaHistory.length > 1 && (
            <svg viewBox="0 0 100 6" className="w-full h-full" preserveAspectRatio="none">
              {(() => {
                const deltas = deltaHistory.map(d => d.delta);
                const minD = Math.min(...deltas, 0);
                const maxD = Math.max(...deltas, 0);
                const range = maxD - minD || 1;
                const midY = (-minD / range) * 6;

                const points = deltas.map((d, i) => {
                  const x = (i / (deltas.length - 1)) * 100;
                  const y = ((maxD - d) / range) * 6;
                  return `${x},${y}`;
                }).join(" ");

                return (
                  <>
                    {/* Zero line */}
                    <line x1="0" y1={midY} x2="100" y2={midY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
                    {/* Delta line */}
                    <polyline
                      points={points}
                      fill="none"
                      stroke={cumulativeDelta >= 0 ? "var(--su)" : "var(--er)"}
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </>
                );
              })()}
            </svg>
          )}
        </div>
        {/* Delta legend */}
        <div className="flex items-center justify-between mt-1 text-[9px] text-base-content/30">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Buy pressure
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-error" /> Sell pressure
          </span>
        </div>
      </div>

      {/* Feed sources indicator */}
      <div className="px-3 py-1 border-t border-base-300 flex items-center justify-between text-[9px] text-base-content/30 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${feedSources.finnhub ? "bg-success" : "bg-base-content/20"}`} />
            Finnhub WS
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${feedSources.alpaca ? "bg-accent" : "bg-base-content/20"}`} />
            Alpaca Data
          </span>
        </div>
        <span>{currentPrice?.toFixed(2) || "—"}</span>
      </div>
    </div>
  );
}
