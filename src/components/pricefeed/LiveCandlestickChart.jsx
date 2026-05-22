"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * LiveCandlestickChart — TradingView Lightweight Charts candlestick chart
 * with real-time price updates from Finnhub WebSocket.
 *
 * Features:
 *   - Professional candlestick chart with volume bars
 *   - Period selector (1D, 5D, 1M, 3M, 6M, 1Y, 2Y)
 *   - Real-time price line overlay from WebSocket feed
 *   - Crosshair with OHLCV tooltip
 *   - Responsive: fills parent container
 *   - Dark/light theme support via DaisyUI CSS variables
 */

const PERIOD_OPTIONS = [
  { key: "1d", label: "1D", interval: "5m" },
  { key: "5d", label: "5D", interval: "15m" },
  { key: "1mo", label: "1M", interval: "1h" },
  { key: "3mo", label: "3M", interval: "1d" },
  { key: "6mo", label: "6M", interval: "1d" },
  { key: "1y", label: "1Y", interval: "1d" },
  { key: "2y", label: "2Y", interval: "1d" },
];

export default function LiveCandlestickChart() {
  const {
    selectedSymbol,
    prices,
    connected,
    chartPeriod,
    setChartPeriod,
    setChartInterval,
  } = usePriceFeed();

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const priceLineRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartData, setChartData] = useState([]);
  const currentPeriodConfig = PERIOD_OPTIONS.find((p) => p.key === chartPeriod) || PERIOD_OPTIONS[4];

  // ── Get theme colors from CSS variables ─────────────────────────────────
  const getThemeColors = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        background: "#0f0f23",
        text: "#d1d5db",
        grid: "#1e293b",
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        volumeUp: "rgba(34, 197, 94, 0.3)",
        volumeDown: "rgba(239, 68, 68, 0.3)",
      };
    }
    const style = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      background: isDark ? "#0f0f23" : "#ffffff",
      text: isDark ? "#d1d5db" : "#374151",
      grid: isDark ? "#1e293b" : "#f3f4f6",
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      volumeUp: "rgba(34, 197, 94, 0.3)",
      volumeDown: "rgba(239, 68, 68, 0.3)",
    };
  }, []);

  // ── Create chart instance ────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = getThemeColors();

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: colors.grid,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderUpColor: colors.borderUpColor,
      borderDownColor: colors.borderDownColor,
      wickUpColor: colors.wickUpColor,
      wickDownColor: colors.wickDownColor,
    });

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [getThemeColors]);

  // ── Re-create chart on theme change ──────────────────────────────────────
  useEffect(() => {
    const observer = new MutationObserver(() => {
      // Re-apply theme colors when data-theme changes
      if (!chartRef.current) return;
      const colors = getThemeColors();
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.text,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        rightPriceScale: { borderColor: colors.grid },
        timeScale: { borderColor: colors.grid },
      });
      if (candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: colors.upColor,
          downColor: colors.downColor,
          borderUpColor: colors.borderUpColor,
          borderDownColor: colors.borderDownColor,
          wickUpColor: colors.wickUpColor,
          wickDownColor: colors.wickDownColor,
        });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [getThemeColors]);

  // ── Fetch historical OHLCV data ──────────────────────────────────────────
  const fetchChartData = useCallback(async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/prices/ohlc?symbol=${encodeURIComponent(selectedSymbol)}&period=${chartPeriod}&interval=${currentPeriodConfig.interval}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const candles = data.candles || [];

      if (candleSeriesRef.current && volumeSeriesRef.current) {
        const colors = getThemeColors();

        // Set candle data
        candleSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        // Set volume data
        volumeSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? colors.volumeUp : colors.volumeDown,
          }))
        );

        // Fit content
        chartRef.current?.timeScale().fitContent();
      }

      setChartData(candles);
    } catch (err) {
      console.error("[LiveCandlestickChart] Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol, chartPeriod, currentPeriodConfig.interval, getThemeColors]);

  // Fetch on symbol or period change
  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // ── Real-time price updates from Finnhub ─────────────────────────────────
  useEffect(() => {
    if (!selectedSymbol || !prices[selectedSymbol]) return;
    if (!candleSeriesRef.current) return;

    const tick = prices[selectedSymbol];
    const lastCandle = chartData[chartData.length - 1];
    if (!lastCandle) return;

    // Update the last candle with the new price
    const currentTime = lastCandle.time;
    const updatedCandle = {
      time: currentTime,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, tick.price),
      low: Math.min(lastCandle.low, tick.price),
      close: tick.price,
    };

    candleSeriesRef.current.update(updatedCandle);

    // Update or create price line
    if (!priceLineRef.current) {
      priceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: tick.price,
        color: tick.change >= 0 ? "#22c55e" : "#ef4444",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "",
      });
    } else {
      priceLineRef.current.applyOptions({
        price: tick.price,
        color: tick.change >= 0 ? "#22c55e" : "#ef4444",
      });
    }
  }, [prices, selectedSymbol, chartData]);

  // Reset price line when symbol changes
  useEffect(() => {
    if (priceLineRef.current && candleSeriesRef.current) {
      candleSeriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
  }, [selectedSymbol]);

  // ── Period selector handler ──────────────────────────────────────────────
  const handlePeriodChange = (periodKey) => {
    const config = PERIOD_OPTIONS.find((p) => p.key === periodKey);
    if (config) {
      setChartPeriod(periodKey);
      setChartInterval(config.interval);
    }
  };

  // ── Current price display ────────────────────────────────────────────────
  const currentPrice = prices[selectedSymbol];
  const displayName = selectedSymbol;

  return (
    <div className="flex flex-col h-full">
      {/* Chart header */}
      <div className="px-4 py-2 border-b border-base-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">{displayName}</h3>
          {currentPrice && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold">
                ${formatPrice(currentPrice.price, selectedSymbol)}
              </span>
              <span
                className={`badge badge-sm font-mono ${
                  currentPrice.change > 0
                    ? "badge-success"
                    : currentPrice.change < 0
                      ? "badge-error"
                      : "badge-ghost"
                }`}
              >
                {currentPrice.change > 0 ? "+" : ""}
                {currentPrice.change.toFixed(2)}%
              </span>
            </div>
          )}
          {connected && (
            <span className="badge badge-xs badge-success gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              Live
            </span>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`btn btn-xs ${
                chartPeriod === opt.key ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => handlePeriodChange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-200/50 z-10">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="alert alert-error alert-sm max-w-md">
              <span className="text-xs">{error}</span>
              <button className="btn btn-xs btn-ghost" onClick={fetchChartData}>
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
