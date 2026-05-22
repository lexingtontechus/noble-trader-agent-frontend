"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * LiveCandlestickChart — TradingView Lightweight Charts with technical indicators.
 *
 * Features:
 *   - Professional candlestick chart with volume bars
 *   - Period selector (1D, 5D, 1M, 3M, 6M, 1Y, 2Y)
 *   - Real-time price line overlay from WebSocket feed
 *   - Chart type selector: Candles, Line, Area
 *   - Technical indicators: SMA, EMA, Bollinger Bands, RSI, MACD
 *   - Multi-pane: RSI and MACD in sub-panels
 *   - Crosshair with OHLCV tooltip
 *   - Responsive + dark/light theme support
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

const CHART_TYPES = [
  { key: "candles", label: "Candles" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
];

const INDICATORS = {
  sma: { label: "SMA", color: "#f59e0b", params: [20] },
  ema: { label: "EMA", color: "#8b5cf6", params: [20] },
  bb: { label: "Bollinger", color: "#06b6d4", params: [20, 2] },
  rsi: { label: "RSI", color: "#ec4899", params: [14] },
  macd: { label: "MACD", color: "#10b981", params: [12, 26, 9] },
};

// ── Technical Indicator Calculations ────────────────────────────────────────

function calcSMA(closes, period) {
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push({ time: 0, value: sum / period });
  }
  return result;
}

function calcEMA(closes, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period - 1; i < closes.length; i++) {
    if (i === period - 1) {
      result.push({ time: 0, value: ema });
    } else {
      ema = closes[i] * k + ema * (1 - k);
      result.push({ time: 0, value: ema });
    }
  }
  return result;
}

function calcBollinger(closes, period = 20, stdDev = 2) {
  const upper = [], lower = [], mid = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    mid.push({ time: 0, value: mean });
    upper.push({ time: 0, value: mean + stdDev * sd });
    lower.push({ time: 0, value: mean - stdDev * sd });
  }
  return { upper, lower, mid };
}

function calcRSI(closes, period = 14) {
  const result = [];
  if (closes.length < period + 1) return result;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result.push({ time: 0, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result.push({ time: 0, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  }
  return result;
}

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const fastEma = calcEMA(closes, fast);
  const slowEma = calcEMA(closes, slow);
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset].value - slowEma[i].value);
  }
  const signalLine = calcEMA(macdLine, signal);
  const histogram = [];
  const histOffset = signal - 1;
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + histOffset] - signalLine[i].value);
  }
  return { macdLine, signalLine: signalLine.map((s) => s.value), histogram };
}

// Assign timestamps to indicator data
function assignTimes(indicatorData, candles, startOffset) {
  return indicatorData.map((d, i) => ({
    ...d,
    time: candles[i + startOffset]?.time,
  })).filter((d) => d.time);
}

export default function LiveCandlestickChart() {
  const {
    selectedSymbol,
    prices,
    connected,
    chartPeriod,
    setChartPeriod,
    setChartInterval,
  } = usePriceFeed();

  // ── State ─────────────────────────────────────────────────────────────────
  const [chartType, setChartType] = useState("candles");
  const [activeIndicators, setActiveIndicators] = useState([]); // ["sma", "rsi", ...]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null); // candle, line, or area series
  const volumeSeriesRef = useRef(null);
  const priceLineRef = useRef(null);
  const indicatorSeriesRef = useRef({}); // { sma: series, ema: series, ... }
  const rsiChartRef = useRef(null);
  const macdChartRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const macdSeriesRef = useRef({ macd: null, signal: null, histogram: null });

  const currentPeriodConfig = PERIOD_OPTIONS.find((p) => p.key === chartPeriod) || PERIOD_OPTIONS[4];

  // ── Get theme colors ──────────────────────────────────────────────────────
  const getThemeColors = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        background: "#0f0f23", text: "#d1d5db", grid: "#1e293b",
        upColor: "#22c55e", downColor: "#ef4444",
        borderUpColor: "#22c55e", borderDownColor: "#ef4444",
        wickUpColor: "#22c55e", wickDownColor: "#ef4444",
        volumeUp: "rgba(34, 197, 94, 0.3)", volumeDown: "rgba(239, 68, 68, 0.3)",
      };
    }
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      background: isDark ? "#0f0f23" : "#ffffff",
      text: isDark ? "#d1d5db" : "#374151",
      grid: isDark ? "#1e293b" : "#f3f4f6",
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      volumeUp: "rgba(34, 197, 94, 0.3)", volumeDown: "rgba(239, 68, 68, 0.3)",
    };
  }, []);

  // ── Calculate indicators from chartData ───────────────────────────────────
  const indicatorData = useMemo(() => {
    if (chartData.length === 0) return {};
    const closes = chartData.map((c) => c.close);
    const result = {};

    if (activeIndicators.includes("sma")) {
      const raw = calcSMA(closes, 20);
      result.sma = assignTimes(raw, chartData, 19);
    }
    if (activeIndicators.includes("ema")) {
      const raw = calcEMA(closes, 20);
      result.ema = assignTimes(raw, chartData, 19);
    }
    if (activeIndicators.includes("bb")) {
      const { upper, lower, mid } = calcBollinger(closes, 20, 2);
      result.bb_upper = assignTimes(upper, chartData, 19);
      result.bb_lower = assignTimes(lower, chartData, 19);
      result.bb_mid = assignTimes(mid, chartData, 19);
    }
    if (activeIndicators.includes("rsi")) {
      const raw = calcRSI(closes, 14);
      result.rsi = assignTimes(raw, chartData, 14);
    }
    if (activeIndicators.includes("macd")) {
      const { macdLine, signalLine, histogram } = calcMACD(closes, 12, 26, 9);
      // MACD starts after 26 candles, signal starts after 26+9-1=34 candles
      const macdStart = 25;
      const signalStart = 33;
      result.macd_line = macdLine.map((v, i) => ({
        time: chartData[i + macdStart]?.time,
        value: v,
      })).filter((d) => d.time);
      result.macd_signal = signalLine.map((v, i) => ({
        time: chartData[i + signalStart]?.time,
        value: v,
      })).filter((d) => d.time);
      result.macd_histogram = histogram.map((v, i) => ({
        time: chartData[i + signalStart]?.time,
        value: v,
        color: v >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)",
      })).filter((d) => d.time);
    }
    return result;
  }, [chartData, activeIndicators]);

  // ── Create main chart ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const colors = getThemeColors();
    const container = chartContainerRef.current;

    // Calculate height splits: main chart, RSI pane, MACD pane
    const hasRSI = activeIndicators.includes("rsi");
    const hasMACD = activeIndicators.includes("macd");
    const totalPanes = 1 + (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
    const mainHeight = Math.floor(container.clientHeight * (hasRSI || hasMACD ? 0.6 : 1));
    const subPaneHeight = hasRSI || hasMACD ? Math.floor(container.clientHeight * 0.2) : 0;

    // Main chart
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text, fontSize: 12 },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid, timeVisible: true, secondsVisible: false },
      width: container.clientWidth,
      height: mainHeight,
    });

    const mainSeries = createMainSeries(chart, chartType, colors);
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;

    // RSI sub-chart
    if (hasRSI) {
      const rsiChart = createChart(container, {
        layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text, fontSize: 10 },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { visible: false },
        width: container.clientWidth,
        height: subPaneHeight,
      });
      const rsiSeries = rsiChart.addLineSeries({ color: INDICATORS.rsi.color, lineWidth: 1, priceFormat: { type: "price", precision: 1, minMove: 0.1 } });
      // Add RSI reference lines at 30 and 70
      rsiSeries.createPriceLine({ price: 70, color: "rgba(239, 68, 68, 0.3)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      rsiSeries.createPriceLine({ price: 30, color: "rgba(34, 197, 94, 0.3)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      rsiChartRef.current = rsiChart;
      rsiSeriesRef.current = rsiSeries;
    }

    // MACD sub-chart
    if (hasMACD) {
      const macdChart = createChart(container, {
        layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text, fontSize: 10 },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { visible: false },
        width: container.clientWidth,
        height: subPaneHeight,
      });
      const macdLineSeries = macdChart.addLineSeries({ color: "#3b82f6", lineWidth: 1, priceFormat: { type: "price", precision: 2 } });
      const signalSeries = macdChart.addLineSeries({ color: "#f97316", lineWidth: 1, priceFormat: { type: "price", precision: 2 } });
      const histSeries = macdChart.addHistogramSeries({ priceFormat: { type: "price", precision: 2 } });
      macdChartRef.current = macdChart;
      macdSeriesRef.current = { macd: macdLineSeries, signal: signalSeries, histogram: histSeries };
    }

    // Sync time scales across all charts
    if (hasRSI || hasMACD) {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
          if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      chart.applyOptions({ width: w });
      if (rsiChartRef.current) rsiChartRef.current.applyOptions({ width: w });
      if (macdChartRef.current) macdChartRef.current.applyOptions({ width: w });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      rsiChartRef.current?.remove();
      macdChartRef.current?.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
      rsiSeriesRef.current = null;
      macdSeriesRef.current = { macd: null, signal: null, histogram: null };
      indicatorSeriesRef.current = {};
      priceLineRef.current = null;
    };
  }, [chartType, activeIndicators, getThemeColors]);

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
      setChartData(candles);
    } catch (err) {
      console.error("[LiveCandlestickChart] Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol, chartPeriod, currentPeriodConfig.interval]);

  // ── Apply data to chart when chartData changes ───────────────────────────
  useEffect(() => {
    if (!mainSeriesRef.current || chartData.length === 0) return;
    const colors = getThemeColors();

    // Set main series data
    if (chartType === "candles") {
      mainSeriesRef.current.setData(chartData.map((c) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
      })));
    } else {
      mainSeriesRef.current.setData(chartData.map((c) => ({
        time: c.time, value: c.close,
      })));
    }

    // Set volume data
    volumeSeriesRef.current?.setData(
      chartData.map((c) => ({
        time: c.time, value: c.volume,
        color: c.close >= c.open ? colors.volumeUp : colors.volumeDown,
      }))
    );

    // Apply overlay indicators (SMA, EMA, Bollinger)
    applyOverlayIndicators();

    // Apply RSI
    if (rsiSeriesRef.current && indicatorData.rsi) {
      rsiSeriesRef.current.setData(indicatorData.rsi);
    }

    // Apply MACD
    if (macdSeriesRef.current.macd && indicatorData.macd_line) {
      macdSeriesRef.current.macd.setData(indicatorData.macd_line);
      macdSeriesRef.current.signal.setData(indicatorData.macd_signal);
      macdSeriesRef.current.histogram.setData(indicatorData.macd_histogram);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
    rsiChartRef.current?.timeScale().fitContent();
    macdChartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, chartType, indicatorData]);

  // Fetch on symbol or period change
  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // ── Apply overlay indicators (SMA, EMA, Bollinger Bands) ─────────────────
  const applyOverlayIndicators = useCallback(() => {
    if (!chartRef.current) return;

    // Remove old indicator series
    for (const [key, series] of Object.entries(indicatorSeriesRef.current)) {
      try { chartRef.current.removeSeries(series); } catch { /* ignore */ }
    }
    indicatorSeriesRef.current = {};

    // Add SMA
    if (activeIndicators.includes("sma") && indicatorData.sma) {
      const series = chartRef.current.addLineSeries({
        color: INDICATORS.sma.color, lineWidth: 1, priceLineVisible: false,
        lastValueVisible: false, crosshairMarkerVisible: false,
      });
      series.setData(indicatorData.sma);
      indicatorSeriesRef.current.sma = series;
    }

    // Add EMA
    if (activeIndicators.includes("ema") && indicatorData.ema) {
      const series = chartRef.current.addLineSeries({
        color: INDICATORS.ema.color, lineWidth: 1, priceLineVisible: false,
        lastValueVisible: false, crosshairMarkerVisible: false,
      });
      series.setData(indicatorData.ema);
      indicatorSeriesRef.current.ema = series;
    }

    // Add Bollinger Bands
    if (activeIndicators.includes("bb") && indicatorData.bb_upper) {
      const upperSeries = chartRef.current.addLineSeries({
        color: INDICATORS.bb.color, lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      upperSeries.setData(indicatorData.bb_upper);
      indicatorSeriesRef.current.bb_upper = upperSeries;

      const lowerSeries = chartRef.current.addLineSeries({
        color: INDICATORS.bb.color, lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: Math.min(...indicatorData.bb_lower.map((d) => d.value)), maxValue: Math.max(...indicatorData.bb_upper.map((d) => d.value)) },
        }),
      });
      lowerSeries.setData(indicatorData.bb_lower);
      indicatorSeriesRef.current.bb_lower = lowerSeries;
    }
  }, [activeIndicators, indicatorData]);

  // ── Real-time price updates ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSymbol || !prices[selectedSymbol]) return;
    if (!mainSeriesRef.current) return;

    const tick = prices[selectedSymbol];
    const lastCandle = chartData[chartData.length - 1];
    if (!lastCandle) return;

    if (chartType === "candles") {
      const updatedCandle = {
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, tick.price),
        low: Math.min(lastCandle.low, tick.price),
        close: tick.price,
      };
      mainSeriesRef.current.update(updatedCandle);
    } else {
      mainSeriesRef.current.update({ time: lastCandle.time, value: tick.price });
    }

    // Update price line
    if (chartType === "candles") {
      if (!priceLineRef.current) {
        priceLineRef.current = mainSeriesRef.current.createPriceLine({
          price: tick.price,
          color: tick.change >= 0 ? "#22c55e" : "#ef4444",
          lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "",
        });
      } else {
        priceLineRef.current.applyOptions({
          price: tick.price,
          color: tick.change >= 0 ? "#22c55e" : "#ef4444",
        });
      }
    }
  }, [prices, selectedSymbol, chartData, chartType]);

  // Reset price line when symbol changes
  useEffect(() => {
    if (priceLineRef.current && mainSeriesRef.current) {
      try { mainSeriesRef.current.removePriceLine(priceLineRef.current); } catch { /* ignore */ }
      priceLineRef.current = null;
    }
  }, [selectedSymbol]);

  // ── Theme change observer ─────────────────────────────────────────────────
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const colors = getThemeColors();
      const applyOpts = (ch) => {
        ch?.applyOptions({
          layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text },
          grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
          rightPriceScale: { borderColor: colors.grid },
          timeScale: { borderColor: colors.grid },
        });
      };
      applyOpts(chartRef.current);
      applyOpts(rsiChartRef.current);
      applyOpts(macdChartRef.current);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [getThemeColors]);

  // ── Indicator toggle ─────────────────────────────────────────────────────
  const toggleIndicator = (key) => {
    setActiveIndicators((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // ── Period selector ──────────────────────────────────────────────────────
  const handlePeriodChange = (periodKey) => {
    const config = PERIOD_OPTIONS.find((p) => p.key === periodKey);
    if (config) { setChartPeriod(periodKey); setChartInterval(config.interval); }
  };

  const currentPrice = prices[selectedSymbol];

  return (
    <div className="flex flex-col h-full">
      {/* Chart header */}
      <div className="px-4 py-2 border-b border-base-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">{selectedSymbol}</h3>
          {currentPrice && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold">
                ${formatPrice(currentPrice.price, selectedSymbol)}
              </span>
              <span className={`badge badge-sm font-mono ${currentPrice.change > 0 ? "badge-success" : currentPrice.change < 0 ? "badge-error" : "badge-ghost"}`}>
                {currentPrice.change > 0 ? "+" : ""}{currentPrice.change.toFixed(2)}%
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

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Chart type selector */}
          <div className="flex items-center gap-0.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.key}
                className={`btn btn-xs ${chartType === ct.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setChartType(ct.key)}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* Indicator menu */}
          <div className="relative">
            <button
              className={`btn btn-xs ${activeIndicators.length > 0 ? "btn-secondary" : "btn-ghost"}`}
              onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
            >
              Indicators {activeIndicators.length > 0 && `(${activeIndicators.length})`}
            </button>
            {showIndicatorMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 min-w-[160px]">
                {Object.entries(INDICATORS).map(([key, ind]) => (
                  <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-base-200 rounded cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={activeIndicators.includes(key)}
                      onChange={() => toggleIndicator(key)}
                    />
                    <span className="w-3 h-0.5 rounded" style={{ backgroundColor: ind.color }} />
                    <span>{ind.label}</span>
                    <span className="text-base-content/40 ml-auto">{ind.params.join(", ")}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`btn btn-xs ${chartPeriod === opt.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => handlePeriodChange(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
              <button className="btn btn-xs btn-ghost" onClick={fetchChartData}>Retry</button>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}

// ── Helper: Create the main series based on chart type ─────────────────────
function createMainSeries(chart, type, colors) {
  switch (type) {
    case "line":
      return chart.addLineSeries({
        color: colors.upColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
    case "area":
      return chart.addAreaSeries({
        lineColor: colors.upColor,
        topColor: `${colors.upColor}40`,
        bottomColor: `${colors.upColor}05`,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
    default: // candles
      return chart.addCandlestickSeries({
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.borderUpColor,
        borderDownColor: colors.borderDownColor,
        wickUpColor: colors.wickUpColor,
        wickDownColor: colors.wickDownColor,
      });
  }
}

function formatPrice(price, symbol) {
  if (symbol?.includes("BTC") || price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}
