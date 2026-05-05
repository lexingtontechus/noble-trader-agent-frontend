"use client";

import { useState, useCallback } from "react";
import SimulationPanel from "./SimulationPanel";
import PriceFanChart from "./PriceFanChart";
import { useStream } from "@/context/StreamContext";

const POPULAR_SYMBOLS = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "GC=F", name: "Gold" },
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
];

/**
 * SimulatePage — Standalone Monte Carlo simulation page.
 *
 * Users can:
 * 1. Pick a popular symbol or enter a custom one
 * 2. Configure simulation parameters
 * 3. Run simulation and view results
 *
 * Also shows active stream symbols for convenience.
 */
export default function SimulatePage() {
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");
  const [prices, setPrices] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceError, setPriceError] = useState(null);

  const { streamStates, activeStreamCount } = useStream();
  const streamedSymbols = Object.keys(streamStates);

  const activeSymbol = customSymbol || selectedSymbol;

  // Fetch prices for a symbol from Yahoo Finance
  const fetchPrices = useCallback(async (symbol) => {
    if (!symbol) return;

    setFetchingPrices(true);
    setPriceError(null);
    setPrices([]);
    setCurrentPrice(null);

    try {
      const res = await fetch(
        `/api/prices?symbol=${encodeURIComponent(symbol)}&period=1y`,
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.prices?.length >= 81) {
        setPrices(data.prices);
        setCurrentPrice(data.prices[data.prices.length - 1]);
      } else {
        throw new Error(
          `Insufficient price data (${data.prices?.length ?? 0} bars, need 81+)`,
        );
      }
    } catch (err) {
      setPriceError(err.message);
    } finally {
      setFetchingPrices(false);
    }
  }, []);

  // Handle symbol selection
  const handleSelectSymbol = (symbol) => {
    setSelectedSymbol(symbol);
    setCustomSymbol("");
    fetchPrices(symbol);
  };

  // Handle custom symbol submit
  const handleCustomSubmit = (e) => {
    e.preventDefault();
    const sym = customSymbol.trim().toUpperCase();
    if (sym) {
      setSelectedSymbol("");
      fetchPrices(sym);
    }
  };

  // Use stream data if available
  const handleUseStreamSymbol = (symbol) => {
    setSelectedSymbol(symbol);
    setCustomSymbol("");
    fetchPrices(symbol);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-primary">Simulate</h1>
        <span className="badge badge-primary badge-sm">v2.1</span>
      </div>
      <p className="text-base-content/60 text-sm">
        Monte Carlo regime transition simulation — fit a 4-state HMM on
        historical prices, then simulate forward trajectories using the Markov
        transition matrix.
      </p>

      {/* Symbol Selection */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-base mb-3">Select Symbol</h3>

          {/* Popular Symbols */}
          <div className="flex flex-wrap gap-2 mb-4">
            {POPULAR_SYMBOLS.map((s) => (
              <button
                key={s.symbol}
                className={`btn btn-sm gap-1 ${selectedSymbol === s.symbol ? "btn-primary" : "btn-ghost"}`}
                onClick={() => handleSelectSymbol(s.symbol)}
              >
                <span className="font-mono">{s.symbol}</span>
                <span className="text-xs opacity-50">{s.name}</span>
              </button>
            ))}
          </div>

          {/* Active Stream Symbols */}
          {streamedSymbols.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-base-content/50 mb-2">
                From active streams:
              </p>
              <div className="flex flex-wrap gap-2">
                {streamedSymbols.map((sym) => (
                  <button
                    key={sym}
                    className={`btn btn-sm btn-outline gap-1 ${selectedSymbol === sym ? "btn-primary" : ""}`}
                    onClick={() => handleUseStreamSymbol(sym)}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                    </span>
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Symbol Input */}
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter symbol (e.g. MSFT)"
              className="input input-sm input-bordered flex-1 font-mono"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
            />
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!customSymbol.trim()}
            >
              Load
            </button>
          </form>

          {/* Active Symbol Display */}
          {activeSymbol && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-base-content/50">Active:</span>
              <span className="badge badge-lg badge-primary font-mono">
                {activeSymbol}
              </span>
              {currentPrice != null && (
                <span className="font-mono font-bold">
                  ${currentPrice.toFixed(2)}
                </span>
              )}
              {prices.length > 0 && (
                <span className="text-xs text-base-content/40">
                  {prices.length} bars
                </span>
              )}
            </div>
          )}

          {/* Fetching Prices */}
          {fetchingPrices && (
            <div className="flex items-center gap-2 mt-3">
              <span className="loading loading-spinner loading-xs" />
              <span className="text-sm text-base-content/50">
                Loading price data for {activeSymbol}...
              </span>
            </div>
          )}

          {/* Price Error */}
          {priceError && (
            <div className="alert alert-warning alert-sm mt-3">
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
              <span className="text-sm">{priceError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Simulation Panel (shown when prices are loaded) */}
      {prices.length >= 81 && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title text-base">
              🎲 Simulation Configuration
              <span className="badge badge-outline badge-sm">
                {activeSymbol}
              </span>
            </h3>
            <SimulationPanel
              symbol={activeSymbol}
              prices={prices}
              currentPrice={currentPrice}
            />
          </div>
        </div>
      )}

      {/* Info Callout */}
      {!activeSymbol && (
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body items-center text-center py-8">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-base-content/20 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">Select a Symbol to Begin</h3>
            <p className="text-base-content/50 text-sm max-w-md">
              Choose a popular symbol, use an active stream, or enter a custom
              ticker. We&apos;ll load historical prices and let you configure
              the Monte Carlo simulation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
