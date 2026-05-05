"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PriceChart from "@/components/analysis/PriceChart";
import RegimeCard from "@/components/analysis/RegimeCard";
import ObservationFeatures from "@/components/analysis/ObservationFeatures";
import RiskCard from "@/components/analysis/RiskCard";
import RecommendationsCard from "@/components/analysis/RecommendationsCard";
import CommentaryCard from "@/components/analysis/CommentaryCard";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import ErrorState from "@/components/shared/ErrorState";
import LiveBadge from "@/components/streaming/LiveBadge";
import SimulationPanel from "@/components/simulation/SimulationPanel";
import { useStream } from "@/context/StreamContext";

function CommentaryCardWrapper({ symbol, regime, sizing, risk }) {
  const [commentary, setCommentary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCommentary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, regime, sizing, risk }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setCommentary("");
      } else {
        setCommentary(data.commentary || "No commentary available.");
      }
    } catch (err) {
      setError(err.message || "Network error");
      setCommentary("");
    } finally {
      setLoading(false);
    }
  }, [symbol, regime, sizing, risk]);

  useEffect(() => {
    if (regime?.regime_label) {
      fetchCommentary();
    }
  }, [regime?.regime_label, fetchCommentary]);

  if (loading) {
    return <CommentaryCard commentary="" loading={true} />;
  }

  if (error) {
    return (
      <div className="alert alert-warning py-2 px-3 text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span>AI commentary unavailable: {error}</span>
        <button
          className="btn btn-xs btn-ghost ml-auto"
          onClick={fetchCommentary}
        >
          Retry
        </button>
      </div>
    );
  }

  return <CommentaryCard commentary={commentary} loading={false} />;
}

export default function TickerCard({
  symbol,
  displayName,
  data,
  loading,
  error,
  onRetry,
}) {
  const [openSections, setOpenSections] = useState({
    regime: true,
    hmm: false,
    risk: false,
    recommendations: false,
    commentary: false,
    simulation: false,
  });

  const { streamStates, toggleStream, subscriptions, tickCounts } = useStream();
  const isSubscribed = !!subscriptions[symbol];
  const streamState = streamStates[symbol] || {};
  const { isConnected, lastTick, sseMode, isStreaming } = streamState;
  const tickCount = tickCounts[symbol] || 0;

  // Derive live regime from the streaming lastTick — use useMemo, not useEffect+setState
  const liveRegime = useMemo(() => {
    if (!lastTick?.regime_label) return null;
    return {
      regime_label: lastTick.regime_label,
      vol_state: lastTick.vol_state,
      trend_state: lastTick.trend_state,
      confidence: lastTick.confidence,
      risk_multiplier: lastTick.risk_multiplier,
      recommended_f: lastTick.recommended_f,
      var_95: lastTick.var_95,
      cvar_95: lastTick.cvar_95,
      suggested_stop: lastTick.suggested_stop,
      suggested_tp: lastTick.suggested_tp,
      sharpe_ratio: lastTick.sharpe_ratio,
    };
  }, [lastTick]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <LoadingSkeleton type="card" />;
  }

  if (error) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between mb-2">
            <h2 className="card-title text-lg">{displayName || symbol}</h2>
          </div>
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const analysis = data.analysis || {};
  const regime = liveRegime || analysis.regime || {};
  const sizing = analysis.sizing || {};
  const risk = analysis.risk || {};
  const prices = data.prices || [];
  const dates = data.dates || [];
  const features = analysis.observation_features || analysis.features || null;

  // Calculate current price and return — use live price if streaming
  const livePrice = lastTick?.price;
  const lastPrice =
    livePrice ?? (prices.length > 0 ? prices[prices.length - 1] : null);
  const firstPrice = prices.length > 0 ? prices[0] : null;
  const totalReturn =
    firstPrice && lastPrice ? (lastPrice - firstPrice) / firstPrice : null;
  const isPositiveReturn = totalReturn != null && totalReturn >= 0;

  // Price change from live tick
  const liveChange = lastTick?.price_change;
  const liveChangePercent = lastTick?.price_change_pct;

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        {/* Header: Name + Price + Return Badge + LIVE Badge */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="card-title text-lg">{displayName || symbol}</h2>
          <div className="flex items-center gap-2">
            {/* Go Live / Stop Live button */}
            <button
              className={`btn btn-xs gap-1 ${isSubscribed ? "btn-error" : "btn-outline btn-success"}`}
              onClick={() => toggleStream(symbol)}
              title={isSubscribed ? "Stop live stream" : "Start live stream"}
            >
              {isSubscribed ? (
                <>
                  {isStreaming ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : null}
                  Stop Live
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  Go Live
                </>
              )}
            </button>

            {lastPrice != null && (
              <span className="text-lg font-bold font-mono">
                ${lastPrice.toFixed(2)}
              </span>
            )}
            {liveChange != null ? (
              <span
                className={`badge ${liveChange >= 0 ? "badge-success" : "badge-error"}`}
              >
                {liveChange >= 0 ? "▲" : "▼"} ${Math.abs(liveChange).toFixed(2)}
                {liveChangePercent != null && (
                  <span className="ml-1 opacity-75">
                    ({Math.abs(liveChangePercent).toFixed(2)}%)
                  </span>
                )}
              </span>
            ) : totalReturn != null ? (
              <span
                className={`badge ${isPositiveReturn ? "badge-success" : "badge-error"}`}
              >
                {isPositiveReturn ? "▲" : "▼"}{" "}
                {(Math.abs(totalReturn) * 100).toFixed(2)}%
              </span>
            ) : null}
            <LiveBadge isConnected={isConnected} sseMode={sseMode} />
          </div>
        </div>

        {/* Live Regime Banner (when streaming) */}
        {isConnected && liveRegime && (
          <div
            className={`alert py-2 px-3 text-sm ${
              liveRegime.regime_label?.includes("bear")
                ? "alert-error"
                : liveRegime.regime_label?.includes("bull")
                  ? "alert-success"
                  : "alert-warning"
            }`}
          >
            <span className="font-mono font-bold text-xs">
              {liveRegime.regime_label}
            </span>
            <span className="text-xs opacity-70">
              Risk: {liveRegime.risk_multiplier?.toFixed(2)}× | Size:{" "}
              {((liveRegime.recommended_f || 0) * 100).toFixed(1)}% | VaR95:{" "}
              {((liveRegime.var_95 || 0) * 100).toFixed(2)}%
            </span>
            {tickCount > 0 && (
              <span className="text-xs opacity-50 ml-auto">
                {tickCount} ticks
              </span>
            )}
          </div>
        )}

        {/* Price Chart */}
        <PriceChart
          prices={prices}
          dates={dates}
          regimeLabel={regime.regime_label}
          livePrice={livePrice}
        />

        {/* Collapsible: Regime State (default open) */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.regime}
            onChange={() => toggleSection("regime")}
          />
          <div className="collapse-title text-sm font-semibold">
            🏛️ Regime State
          </div>
          <div className="collapse-content">
            <RegimeCard data={regime} />
          </div>
        </div>

        {/* Collapsible: HMM Features */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.hmm}
            onChange={() => toggleSection("hmm")}
          />
          <div className="collapse-title text-sm font-semibold">
            🔬 HMM Features
          </div>
          <div className="collapse-content">
            <ObservationFeatures data={analysis} />
          </div>
        </div>

        {/* Collapsible: Risk Metrics */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.risk}
            onChange={() => toggleSection("risk")}
          />
          <div className="collapse-title text-sm font-semibold">
            ⚠️ Risk Metrics
          </div>
          <div className="collapse-content">
            <RiskCard data={risk} />
          </div>
        </div>

        {/* Collapsible: Recommendations */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.recommendations}
            onChange={() => toggleSection("recommendations")}
          />
          <div className="collapse-title text-sm font-semibold">
            💡 Recommendations
          </div>
          <div className="collapse-content">
            <RecommendationsCard data={analysis} />
          </div>
        </div>

        {/* Collapsible: AI Commentary */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.commentary}
            onChange={() => toggleSection("commentary")}
          />
          <div className="collapse-title text-sm font-semibold">
            🤖 AI Commentary
          </div>
          <div className="collapse-content">
            <CommentaryCardWrapper
              symbol={symbol}
              regime={regime}
              sizing={sizing}
              risk={risk}
            />
          </div>
        </div>

        {/* Collapsible: Monte Carlo Simulation */}
        <div className="collapse collapse-arrow bg-base-300 rounded-lg">
          <input
            type="checkbox"
            checked={openSections.simulation}
            onChange={() => toggleSection("simulation")}
          />
          <div className="collapse-title text-sm font-semibold">
            🎲 Monte Carlo Simulation
          </div>
          <div className="collapse-content">
            <SimulationPanel
              symbol={symbol}
              prices={prices}
              currentPrice={livePrice ?? lastPrice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
