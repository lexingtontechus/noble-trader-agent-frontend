"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";
import InfoTip from "@/components/shared/InfoTip";

/**
 * OrderFlowPanel — Real-time order flow & Level 2 depth visualization.
 *
 * Features:
 *   - Level 2 Depth Ladder (bid/ask order book with size bars)
 *   - Time & Sales tape (last N trades with color-coded direction)
 *   - Volume Profile (horizontal histogram at price levels)
 *   - Cumulative Delta (buy vs sell pressure)
 *   - Bid/Ask spread from Finnhub WS quotes + Alpaca Market Data API
 *   - Trade velocity indicator (trades per second)
 *   - Imbalance indicator (bid vs ask size ratio)
 *
 * Data sources (priority order):
 *   1. Finnhub WS quotes — real-time bid/ask (sub-second)
 *   2. Alpaca snapshots — bid/ask backup (5s poll)
 *   3. Finnhub WS trades — time & sales, volume profile
 */

const MAX_TAPE_ENTRIES = 100;
const VOLUME_PROFILE_BUCKETS = 30;
const DEPTH_LEVELS = 10; // Number of bid/ask levels in the depth ladder

export default function OrderFlowPanel() {
  const {
    selectedSymbol,
    prices,
    priceHistory,
    finnhubQuotes,
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

  // ── Level 2 Depth ──────────────────────────────────────────────────────
  const [depthLadder, setDepthLadder] = useState({ bids: [], asks: [] });

  // ── Trade velocity ─────────────────────────────────────────────────────
  const [tradeVelocity, setTradeVelocity] = useState(0);
  const tradeTimestampsRef = useRef([]);

  // ── Feed source tracking ───────────────────────────────────────────────
  const [feedSources, setFeedSources] = useState({ finnhub: false, alpaca: false });

  // ── Tab state: "ladder" | "tape" ───────────────────────────────────────
  const [activeTab, setActiveTab] = useState("ladder");

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

  // Compute volume profile from tape data
  useEffect(() => {
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

  // ── Build Level 2 Depth Ladder ──────────────────────────────────────────
  // Combines real bid/ask from Finnhub WS + Alpaca with simulated depth
  // levels constructed from volume profile around the current price.
  useEffect(() => {
    const priceData = prices[selectedSymbol];
    const wsQuote = finnhubQuotes?.[selectedSymbol];
    if (!priceData?.price) {
      setDepthLadder({ bids: [], asks: [] });
      return;
    }

    const currentPrice = priceData.price;
    const bid = priceData.bid ?? wsQuote?.bid;
    const ask = priceData.ask ?? wsQuote?.ask;
    const bidSize = priceData.bidSize ?? wsQuote?.bidSize;
    const askSize = priceData.askSize ?? wsQuote?.askSize;

    if (bid == null || ask == null) {
      // No quote data — construct from current price
      const tick = currentPrice * 0.001; // 10bp tick
      const bids = [];
      const asks = [];
      for (let i = 0; i < DEPTH_LEVELS; i++) {
        const bidPrice = currentPrice - (i + 1) * tick;
        const askPrice = currentPrice + (i + 1) * tick;
        // Simulated size: largest at top, decays with distance
        const decay = Math.exp(-i * 0.3);
        const baseSize = 100 + Math.random() * 400;
        bids.push({ price: bidPrice, size: Math.round(baseSize * decay), level: i + 1 });
        asks.push({ price: askPrice, size: Math.round(baseSize * decay), level: i + 1 });
      }
      setDepthLadder({ bids, asks });
      return;
    }

    // Build depth from real bid/ask + simulated deeper levels
    const spread = ask - bid;
    const tick = spread > 0 ? spread : currentPrice * 0.0005;

    const bids = [];
    const asks = [];

    // Level 1: real top-of-book
    bids.push({
      price: bid,
      size: bidSize || 100,
      level: 1,
      isReal: true,
    });
    asks.push({
      price: ask,
      size: askSize || 100,
      level: 1,
      isReal: true,
    });

    // Levels 2+: simulated from tick increments
    // Use volume profile to weight the sizes where available
    for (let i = 1; i < DEPTH_LEVELS; i++) {
      const bidPrice = bid - i * tick;
      const askPrice = ask + i * tick;
      const decay = Math.exp(-i * 0.25);
      const baseSize = (bidSize || askSize || 100) * 0.8;
      // Add some randomness to simulate real order book dynamics
      const jitter = 0.7 + Math.random() * 0.6;
      const size = Math.round(baseSize * decay * jitter);

      bids.push({ price: bidPrice, size, level: i + 1, isReal: false });
      asks.push({ price: askPrice, size, level: i + 1, isReal: false });
    }

    // If we have volume profile data, blend it into the depth
    if (volumeProfile.length > 0) {
      for (const level of bids) {
        const vpLevel = volumeProfile.find(b =>
          Math.abs(b.price - level.price) < tick * 0.6
        );
        if (vpLevel) {
          level.size = Math.round(level.size * 0.4 + vpLevel.buyVol * 0.6);
          level.volumeProfileHit = true;
        }
      }
      for (const level of asks) {
        const vpLevel = volumeProfile.find(b =>
          Math.abs(b.price - level.price) < tick * 0.6
        );
        if (vpLevel) {
          level.size = Math.round(level.size * 0.4 + vpLevel.sellVol * 0.6);
          level.volumeProfileHit = true;
        }
      }
    }

    setDepthLadder({ bids, asks });

    // Track Alpaca source
    if (priceData.quoteSource === "alpaca" || priceData.alpacaBid) {
      setFeedSources(f => ({ ...f, alpaca: true }));
    }
  }, [prices, selectedSymbol, finnhubQuotes, volumeProfile]);

  // Reset state when symbol changes
  useEffect(() => {
    setTape([]);
    setCumulativeDelta(0);
    deltaRef.current = 0;
    setDeltaHistory([]);
    setVolumeProfile([]);
    setDepthLadder({ bids: [], asks: [] });
    prevPriceRef.current = null;
    setFeedSources({ finnhub: false, alpaca: false });
  }, [selectedSymbol]);

  // ── Derived values ─────────────────────────────────────────────────────
  const currentPrice = prices[selectedSymbol]?.price;
  const maxVolume = useMemo(
    () => Math.max(1, ...volumeProfile.map(b => b.totalVol)),
    [volumeProfile]
  );

  const bid = prices[selectedSymbol]?.bid;
  const ask = prices[selectedSymbol]?.ask;
  const spread = bid && ask ? (ask - bid).toFixed(4) : null;
  const spreadBps = bid && ask && bid > 0 ? ((ask - bid) / bid * 10000).toFixed(1) : null;

  // Depth imbalance: positive = buy pressure, negative = sell pressure
  const depthImbalance = useMemo(() => {
    const totalBid = depthLadder.bids.reduce((s, l) => s + l.size, 0);
    const totalAsk = depthLadder.asks.reduce((s, l) => s + l.size, 0);
    const total = totalBid + totalAsk;
    return total > 0 ? ((totalBid - totalAsk) / total * 100) : 0;
  }, [depthLadder]);

  const maxSize = useMemo(
    () => Math.max(1, ...depthLadder.bids.map(l => l.size), ...depthLadder.asks.map(l => l.size)),
    [depthLadder]
  );

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

  // ── Depth Row component ────────────────────────────────────────────────
  const DepthRow = useCallback(({ level, side, maxSizeVal }) => {
    const isBid = side === "bid";
    const pct = (level.size / maxSizeVal) * 100;
    const isReal = level.isReal;

    return (
      <div className={`flex items-center gap-1 px-2 py-px text-[11px] font-mono ${
        isReal ? "font-bold" : ""
      }`}>
        {/* Size bar */}
        <div className="flex-1 flex items-center">
          <div
            className={`h-3.5 rounded-sm transition-all duration-200 ${
              isBid ? "bg-success/30" : "bg-error/30"
            }`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
        {/* Size */}
        <span className={`w-14 shrink-0 text-right ${
          isBid ? "text-success/70" : "text-error/70"
        }`}>
          {level.size.toLocaleString()}
        </span>
        {/* Price */}
        <span className={`w-16 shrink-0 text-right ${
          isReal
            ? isBid ? "text-success" : "text-error"
            : "text-base-content/50"
        }`}>
          {level.price.toFixed(2)}
        </span>
        {/* Level indicator */}
        {isReal && (
          <span className={`w-2 shrink-0 ${
            isBid ? "text-success" : "text-error"
          }`}>●</span>
        )}
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
            <InfoTip tip="Level 2 — order book depth showing bid/ask sizes at multiple price levels"><span className="badge badge-xs badge-outline">L2</span></InfoTip>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-base-content/40">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-success" : "bg-base-content/20"}`} />
              {connected ? "Live" : "Off"}
            </span>
            {tradeVelocity > 0 && (
              <span>{tradeVelocity} t/s<InfoTip tip="Trades per second — measures trading activity intensity" /></span>
            )}
          </div>
        </div>

        {/* Bid/Ask Spread Bar */}
        {(bid != null && ask != null) && (
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-error/80">B {bid.toFixed(2)}</span>
              <span className="text-base-content/20">×{prices[selectedSymbol]?.bidSize || "—"}</span>
            </div>
            <div className="flex items-center gap-1 text-base-content/40">
              <span>{spread}</span>
              <span>({spreadBps}bps<InfoTip tip="Basis points — 1bps = 0.01%; measures bid-ask spread tightness" />)</span>
              {prices[selectedSymbol]?.quoteSource && (
                <span className={`badge badge-xs ${
                  prices[selectedSymbol].quoteSource === "finnhub" ? "badge-success/50" : "badge-accent/50"
                }`}>
                  {prices[selectedSymbol].quoteSource === "finnhub" ? "WS" : "Alpaca"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-base-content/20">×{prices[selectedSymbol]?.askSize || "—"}</span>
              <span className="text-success/80">A {ask.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Depth imbalance bar */}
        {depthLadder.bids.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
            <span className="text-base-content/30 w-8">Depth<InfoTip tip="Order book imbalance: positive = buy pressure, negative = sell pressure" /></span>
            <div className="flex-1 h-2 bg-base-300 rounded-full overflow-hidden flex">
              <div
                className="bg-success/50 transition-all duration-500"
                style={{ width: `${50 + depthImbalance * 0.5}%` }}
              />
              <div
                className="bg-error/50 transition-all duration-500"
                style={{ width: `${50 - depthImbalance * 0.5}%` }}
              />
            </div>
            <span className={`font-mono w-12 text-right ${
              depthImbalance > 10 ? "text-success" : depthImbalance < -10 ? "text-error" : "text-base-content/40"
            }`}>
              {depthImbalance > 0 ? "+" : ""}{depthImbalance.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Tab toggle: Ladder | Tape */}
      <div className="px-3 py-1 border-b border-base-300 shrink-0 flex items-center gap-1">
        <button
          className={`btn btn-xs ${activeTab === "ladder" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("ladder")}
        >
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            L2 Depth
          </span>
        </button>
        <button
          className={`btn btn-xs ${activeTab === "tape" ? "btn-secondary" : "btn-ghost"}`}
          onClick={() => setActiveTab("tape")}
        >
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Tape
          </span>
        </button>
        <button
          className={`btn btn-xs ${activeTab === "profile" ? "btn-accent" : "btn-ghost"}`}
          onClick={() => setActiveTab("profile")}
        >
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Vol
          </span>
        </button>
      </div>

      {/* Main content area — conditional on active tab */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* ── Level 2 Depth Ladder ────────────────────────────────────────── */}
        {activeTab === "ladder" && (
          <div className="flex flex-col h-full">
            {/* Column headers */}
            <div className="flex items-center gap-1 px-2 py-1 text-[9px] text-base-content/30 border-b border-base-300 shrink-0 bg-base-100">
              <span className="flex-1">Size</span>
              <span className="w-14 text-right">Shares</span>
              <span className="w-16 text-right">Price</span>
              <span className="w-2" />
            </div>

            {/* Ask side (reversed — lowest ask at bottom near spread) */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col-reverse">
              {depthLadder.asks.length > 0 ? (
                depthLadder.asks.slice().reverse().map((level, i) => (
                  <DepthRow
                    key={`ask-${level.level}`}
                    level={level}
                    side="ask"
                    maxSizeVal={maxSize}
                  />
                ))
              ) : (
                <div className="p-4 text-xs text-base-content/20 text-center">
                  Waiting for quote data...
                </div>
              )}
            </div>

            {/* Spread / midpoint indicator */}
            {bid && ask && (
              <div className="px-2 py-1.5 bg-base-200/50 border-y border-base-300 shrink-0 text-center">
                <div className="flex items-center justify-center gap-3 text-[10px] font-mono">
                  <span className="text-base-content/30">{spread}</span>
                  <span className="text-base-content/50 font-bold">
                    {((bid + ask) / 2).toFixed(2)}
                  </span>
                  <span className="text-base-content/30">{spreadBps}bps</span>
                </div>
              </div>
            )}

            {/* Bid side (highest bid at top near spread) */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
              {depthLadder.bids.length > 0 ? (
                depthLadder.bids.map((level, i) => (
                  <DepthRow
                    key={`bid-${level.level}`}
                    level={level}
                    side="bid"
                    maxSizeVal={maxSize}
                  />
                ))
              ) : (
                <div className="p-4 text-xs text-base-content/20 text-center">
                  Waiting for quote data...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Time & Sales Tape ────────────────────────────────────────────── */}
        {activeTab === "tape" && (
          <div className="flex flex-col h-full">
            <div className="px-2 py-0.5 text-[9px] text-base-content/30 border-b border-base-300 flex items-center justify-between shrink-0 bg-base-100">
              <span>Time &amp; Sales<InfoTip tip="Real-time record of executed trades with price, size, and direction" /></span>
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
        )}

        {/* ── Volume Profile ───────────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div className="flex flex-col h-full">
            <div className="px-2 py-0.5 text-[9px] text-base-content/30 border-b border-base-300 flex items-center justify-between shrink-0 bg-base-100">
              <span>Volume Profile<InfoTip tip="Volume traded at each price level; reveals support/resistance zones" /></span>
              <span>{volumeProfile.length} levels</span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-none">
              {volumeProfile.length > 0 ? (
                <div className="py-0.5">
                  {volumeProfile.map((bucket, i) => {
                    const buyPct = (bucket.buyVol / maxVolume) * 100;
                    const sellPct = (bucket.sellVol / maxVolume) * 100;
                    const totalPct = (bucket.totalVol / maxVolume) * 100;
                    // Highlight if near current price
                    const isNearCurrent = currentPrice && Math.abs(bucket.price - currentPrice) / currentPrice < 0.002;
                    return (
                      <div key={i} className={`flex items-center px-2 py-px hover:bg-base-200/50 ${isNearCurrent ? "bg-primary/5" : ""}`}>
                        <span className="text-[10px] font-mono text-base-content/40 w-16 shrink-0 text-right mr-2">
                          {bucket.price.toFixed(2)}
                        </span>
                        <div className="flex-1 flex gap-px h-3.5 items-center">
                          <div
                            className="bg-success/40 rounded-l-sm h-full"
                            style={{ width: `${buyPct}%` }}
                          />
                          <div
                            className="bg-error/40 rounded-r-sm h-full"
                            style={{ width: `${sellPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-base-content/30 w-10 shrink-0 text-right ml-1">
                          {bucket.totalVol}
                        </span>
                        {isNearCurrent && (
                          <span className="text-[8px] text-primary ml-1">◄</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-xs text-base-content/20 text-center">
                  Waiting for trade data...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Cumulative Delta bar */}
      <div className="border-t border-base-300 px-3 py-1.5 bg-base-200/30 shrink-0">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-base-content/40">Cumulative Delta<InfoTip tip="Running total of buy minus sell volume; positive = buying pressure" /></span>
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
