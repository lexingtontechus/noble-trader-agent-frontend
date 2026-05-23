"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";
import useMultiFeedPrice from "@/hooks/useMultiFeedPrice";

/**
 * MultiFeedDashboard — Multi-source price aggregation status dashboard.
 *
 * Visualizes the health, latency, and failover status of all price
 * data sources:
 *   1. Finnhub WebSocket — real-time trades + quotes (sub-second)
 *   2. Alpaca Market Data — bid/ask snapshots (5s poll)
 *   3. Yahoo Finance REST — historical OHLC, fallback (30s poll)
 *
 * Features:
 *   - Per-source health indicators (connected, latency, last update)
 *   - Source priority ladder visualization
 *   - Failover chain status
 *   - Per-symbol source mapping (which source is active for each symbol)
 *   - Aggregate health score
 *   - Connection stats (ticks/sec, uptime, reconnects)
 *   - Latency sparklines
 */
export default function MultiFeedDashboard() {
  const {
    selectedSymbol,
    prices,
    finnhubQuotes,
    connected,
    connectionMode,
    tickCount,
    ticksPerSecond,
    connectedSince,
    reconnectAttempt,
    marketStatus,
    watchlist,
    lastUpdate,
  } = usePriceFeed();

  // ── Multi-feed hook (independent, for Alpaca/Yahoo source tracking) ────
  const multiFeed = useMultiFeedPrice(
    [selectedSymbol],
    { enabled: true, alpacaPollMs: 5000, yahooPollMs: 30000 }
  );

  // ── Per-source health state ────────────────────────────────────────────
  const [sourceHealth, setSourceHealth] = useState({
    finnhub: { status: "unknown", latency: null, lastTick: null, tickCount: 0 },
    alpaca: { status: "unknown", latency: null, lastTick: null, tickCount: 0 },
    yahoo: { status: "unknown", latency: null, lastTick: null, tickCount: 0 },
  });

  // ── Latency history for sparklines ─────────────────────────────────────
  const [latencyHistory, setLatencyHistory] = useState({
    finnhub: [],
    alpaca: [],
    yahoo: [],
  });

  const latencyHistoryRef = useRef({ finnhub: [], alpaca: [], yahoo: [] });
  const prevPriceTimeRef = useRef({});

  // Track Finnhub WS health from the main feed
  useEffect(() => {
    setSourceHealth(prev => ({
      ...prev,
      finnhub: {
        status: connected ? "healthy" : connectionMode === "polling" ? "degraded" : "down",
        latency: connected ? "<1ms" : null,
        lastTick: lastUpdate,
        tickCount,
        connectionMode,
      },
    }));
  }, [connected, connectionMode, tickCount, lastUpdate]);

  // Track Alpaca source health from multi-feed
  useEffect(() => {
    const src = multiFeed.sources?.[selectedSymbol];
    const alpacaActive = src?.alpaca || prices[selectedSymbol]?.alpacaBid != null;
    const priceData = multiFeed.prices?.[selectedSymbol];

    if (alpacaActive) {
      const latency = priceData?.alpacaTime
        ? Date.now() - new Date(priceData.alpacaTime).getTime()
        : null;

      setSourceHealth(prev => ({
        ...prev,
        alpaca: {
          status: "healthy",
          latency: latency != null ? `${latency}ms` : "~5s",
          lastTick: priceData?.alpacaTime ? new Date(priceData.alpacaTime) : null,
          tickCount: (prev.alpaca.tickCount || 0) + 1,
        },
      }));

      if (latency != null) {
        latencyHistoryRef.current.alpaca.push(latency);
        if (latencyHistoryRef.current.alpaca.length > 20) {
          latencyHistoryRef.current.alpaca = latencyHistoryRef.current.alpaca.slice(-20);
        }
      }
    } else {
      setSourceHealth(prev => ({
        ...prev,
        alpaca: { ...prev.alpaca, status: "down" },
      }));
    }
  }, [multiFeed.sources, multiFeed.prices, selectedSymbol, prices]);

  // Track Yahoo source health
  useEffect(() => {
    const src = multiFeed.sources?.[selectedSymbol];
    const yahooActive = src?.yahoo;
    const priceData = multiFeed.prices?.[selectedSymbol];

    if (yahooActive) {
      setSourceHealth(prev => ({
        ...prev,
        yahoo: {
          status: "healthy",
          latency: "~30s",
          lastTick: priceData?.yahooTime ? new Date(priceData.yahooTime) : null,
          tickCount: (prev.yahoo.tickCount || 0) + 1,
        },
      }));
    } else {
      setSourceHealth(prev => ({
        ...prev,
        yahoo: { ...prev.yahoo, status: "down" },
      }));
    }
  }, [multiFeed.sources, multiFeed.prices, selectedSymbol]);

  // Update latency history state periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setLatencyHistory({
        finnhub: [...latencyHistoryRef.current.finnhub],
        alpaca: [...latencyHistoryRef.current.alpaca],
        yahoo: [...latencyHistoryRef.current.yahoo],
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // ── Compute aggregate health score ─────────────────────────────────────
  const healthScore = useMemo(() => {
    let score = 0;
    const weights = { finnhub: 50, alpaca: 30, yahoo: 20 };

    for (const [source, weight] of Object.entries(weights)) {
      const health = sourceHealth[source];
      if (health.status === "healthy") score += weight;
      else if (health.status === "degraded") score += weight * 0.5;
    }

    return Math.round(score);
  }, [sourceHealth]);

  // ── Per-symbol active source tracking ──────────────────────────────────
  const symbolSources = useMemo(() => {
    return watchlist.slice(0, 15).map(w => {
      const p = prices[w.symbol];
      const finnhub = !!p?.price;
      const alpaca = !!p?.alpacaBid || !!p?.bid;
      const yahoo = p?.source === "yahoo";
      const active = p?.quoteSource || p?.source || "none";

      return {
        symbol: w.symbol,
        finnhub,
        alpaca,
        yahoo,
        active,
        price: p?.price,
      };
    });
  }, [watchlist, prices]);

  // ── Uptime formatter ───────────────────────────────────────────────────
  const [uptime, setUptime] = useState("");
  useEffect(() => {
    if (!connectedSince) { setUptime(""); return; }
    const update = () => {
      const diff = Date.now() - connectedSince.getTime();
      const secs = Math.floor(diff / 1000);
      const mins = Math.floor(secs / 60);
      const hrs = Math.floor(mins / 60);
      if (hrs > 0) setUptime(`${hrs}h ${mins % 60}m`);
      else if (mins > 0) setUptime(`${mins}m ${secs % 60}s`);
      else setUptime(`${secs}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [connectedSince]);

  // ── Render helpers ─────────────────────────────────────────────────────
  const statusColor = (status) => {
    switch (status) {
      case "healthy": return "text-success";
      case "degraded": return "text-warning";
      case "down": return "text-error";
      default: return "text-base-content/30";
    }
  };

  const statusBg = (status) => {
    switch (status) {
      case "healthy": return "bg-success/10 border-success/20";
      case "degraded": return "bg-warning/10 border-warning/20";
      case "down": return "bg-error/10 border-error/20";
      default: return "bg-base-200/50 border-base-300";
    }
  };

  const statusDot = (status) => {
    switch (status) {
      case "healthy": return "bg-success";
      case "degraded": return "bg-warning animate-pulse";
      case "down": return "bg-error";
      default: return "bg-base-content/20";
    }
  };

  const healthColor = (score) => {
    if (score >= 80) return "text-success";
    if (score >= 50) return "text-warning";
    return "text-error";
  };

  // Mini sparkline SVG from array of numbers
  const Sparkline = useCallback(({ data, color = "var(--su)", height = 16 }) => {
    if (data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 60;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg viewBox={`0 0 60 ${height}`} className="w-12 h-3" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-300 bg-base-200/30 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold">Multi-Feed Aggregation</span>
            <span className="badge badge-xs badge-ghost">{selectedSymbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${healthColor(healthScore)}`}>
              {healthScore}%
            </span>
            <span className="text-[9px] text-base-content/30">health</span>
          </div>
        </div>

        {/* Health score bar */}
        <div className="mt-1.5 h-1.5 bg-base-300 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              healthScore >= 80 ? "bg-success" : healthScore >= 50 ? "bg-warning" : "bg-error"
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Source priority ladder */}
      <div className="px-3 py-2 space-y-2 shrink-0">
        <div className="text-[9px] text-base-content/30 uppercase tracking-wider font-bold">
          Source Priority Chain
        </div>

        {/* Finnhub WS */}
        <div className={`border rounded-lg p-2 ${statusBg(sourceHealth.finnhub.status)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot(sourceHealth.finnhub.status)}`} />
              <span className="text-[11px] font-bold">Finnhub WebSocket</span>
              <span className="badge badge-xs badge-primary/30">Primary</span>
            </div>
            <span className={`text-[10px] font-mono ${statusColor(sourceHealth.finnhub.status)}`}>
              {sourceHealth.finnhub.status === "healthy" ? "LIVE" :
               sourceHealth.finnhub.status === "degraded" ? "POLLING" : "DOWN"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9px] text-base-content/40">
            <span>Latency: <span className="text-base-content/60">{sourceHealth.finnhub.latency || "—"}</span></span>
            <span>Mode: <span className="text-base-content/60">{connectionMode}</span></span>
            <span>TPS: <span className="text-base-content/60">{ticksPerSecond}</span></span>
          </div>
          {sourceHealth.finnhub.lastTick && (
            <div className="mt-0.5 text-[9px] text-base-content/30">
              Last: {sourceHealth.finnhub.lastTick.toLocaleTimeString()}
            </div>
          )}
          {reconnectAttempt > 0 && !connected && (
            <div className="mt-1 text-[9px] text-warning">
              Reconnect attempt #{reconnectAttempt}
            </div>
          )}
        </div>

        {/* Alpaca Market Data */}
        <div className={`border rounded-lg p-2 ${statusBg(sourceHealth.alpaca.status)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot(sourceHealth.alpaca.status)}`} />
              <span className="text-[11px] font-bold">Alpaca Market Data</span>
              <span className="badge badge-xs badge-accent/30">Bid/Ask</span>
            </div>
            <span className={`text-[10px] font-mono ${statusColor(sourceHealth.alpaca.status)}`}>
              {sourceHealth.alpaca.status === "healthy" ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9px] text-base-content/40">
            <span>Poll: <span className="text-base-content/60">5s</span></span>
            <span>Latency: <span className="text-base-content/60">{sourceHealth.alpaca.latency || "—"}</span></span>
            <span>Snapshots: <span className="text-base-content/60">{sourceHealth.alpaca.tickCount}</span></span>
          </div>
          {sourceHealth.alpaca.lastTick && (
            <div className="mt-0.5 text-[9px] text-base-content/30">
              Last: {sourceHealth.alpaca.lastTick.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Yahoo Finance */}
        <div className={`border rounded-lg p-2 ${statusBg(sourceHealth.yahoo.status)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot(sourceHealth.yahoo.status)}`} />
              <span className="text-[11px] font-bold">Yahoo Finance</span>
              <span className="badge badge-xs badge-secondary/30">Fallback</span>
            </div>
            <span className={`text-[10px] font-mono ${statusColor(sourceHealth.yahoo.status)}`}>
              {sourceHealth.yahoo.status === "healthy" ? "STANDBY" : "INACTIVE"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9px] text-base-content/40">
            <span>Poll: <span className="text-base-content/60">30s</span></span>
            <span>Latency: <span className="text-base-content/60">{sourceHealth.yahoo.latency || "—"}</span></span>
          </div>
        </div>
      </div>

      {/* Failover chain visualization */}
      <div className="px-3 py-2 border-t border-base-300 shrink-0">
        <div className="text-[9px] text-base-content/30 uppercase tracking-wider font-bold mb-1.5">
          Failover Chain
        </div>
        <div className="flex items-center gap-1">
          {["Finnhub WS", "Alpaca", "Yahoo"].map((source, i) => {
            const isActive = i === 0 ? connected : i === 1 ? sourceHealth.alpaca.status === "healthy" : sourceHealth.yahoo.status === "healthy";
            return (
              <div key={source} className="flex items-center">
                <div className={`px-2 py-0.5 rounded text-[9px] font-mono ${
                  isActive ? "bg-success/20 text-success" : "bg-base-200 text-base-content/30"
                }`}>
                  {source}
                </div>
                {i < 2 && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-symbol source mapping */}
      <div className="px-3 py-2 border-t border-base-300 flex-1 min-h-0 overflow-y-auto scrollbar-none">
        <div className="text-[9px] text-base-content/30 uppercase tracking-wider font-bold mb-1.5">
          Symbol Sources
        </div>
        <div className="space-y-px">
          {symbolSources.map(s => (
            <div key={s.symbol} className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-10 shrink-0 text-base-content/50 font-semibold">{s.symbol}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${s.finnhub ? "bg-success" : "bg-base-content/10"}`} title="Finnhub" />
              <span className={`w-1.5 h-1.5 rounded-full ${s.alpaca ? "bg-accent" : "bg-base-content/10"}`} title="Alpaca" />
              <span className={`w-1.5 h-1.5 rounded-full ${s.yahoo ? "bg-secondary" : "bg-base-content/10"}`} title="Yahoo" />
              <span className="text-base-content/30 flex-1">
                {s.price?.toFixed(2) || "—"}
              </span>
              <span className={`badge badge-xs ${
                s.active === "finnhub" ? "badge-success/30" :
                s.active === "alpaca" ? "badge-accent/30" :
                s.active === "yahoo" ? "badge-secondary/30" : "badge-ghost"
              }`}>
                {s.active === "finnhub" ? "WS" : s.active === "alpaca" ? "ALP" : s.active === "yahoo" ? "YH" : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Connection stats footer */}
      <div className="px-3 py-1.5 border-t border-base-300 flex items-center justify-between text-[9px] text-base-content/30 shrink-0 bg-base-200/30">
        <div className="flex items-center gap-3">
          {uptime && <span>up {uptime}</span>}
          <span>{tickCount.toLocaleString()} ticks</span>
          <span>{marketStatus}</span>
        </div>
        <span>{ticksPerSecond} t/s</span>
      </div>
    </div>
  );
}
