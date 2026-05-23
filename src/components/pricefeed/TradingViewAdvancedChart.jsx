"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * TradingViewAdvancedChart — Full TradingView Advanced Chart Widget.
 *
 * Features:
 *   - 100+ built-in technical indicators
 *   - Drawing tools (trendlines, Fibonacci, shapes, etc.)
 *   - Multiple chart types (candle, line, area, bars, heikin-ashi)
 *   - Comparison overlays (add multiple symbols)
 *   - Multiple timeframes (1m to 1M)
 *   - Style presets with curated indicator sets
 *   - Symbol sync from PriceFeedContext
 *   - Theme sync (dark/light)
 *   - Responsive layout
 *
 * Architecture:
 *   - Uses the NEW TradingView embed format (embed-widget-advanced-chart.js)
 *   - Widget is an iframe managed via container ref
 *   - Symbol/theme changes require full widget recreation (free widget limitation)
 *   - Debounced recreation to avoid excessive reloads
 *   - Watchlist symbols passed as widget watchlist parameter
 *
 * Note: The free TradingView widget uses TradingView's own data feed.
 * For real-time WebSocket prices from Finnhub, use the LiveCandlestickChart.
 */

// Map our period keys to TradingView interval strings
const PERIOD_TO_TV_INTERVAL = {
  "1d": "5",
  "5d": "15",
  "1mo": "60",
  "3mo": "D",
  "6mo": "D",
  "1y": "D",
  "2y": "W",
};

// Style presets for the widget
const STYLE_PRESETS = {
  default: {
    name: "Default",
    description: "SMA + Volume",
    studies: ["MASimple@tv-basicstudies", "Volume@tv-basicstudies"],
  },
  pro: {
    name: "Pro Trader",
    description: "SMA, EMA, BB, RSI, MACD",
    studies: [
      "MASimple@tv-basicstudies",
      "MAExp@tv-basicstudies",
      "BB@tv-basicstudies",
      "RSI@tv-basicstudies",
      "MACD@tv-basicstudies",
    ],
  },
  minimal: {
    name: "Clean",
    description: "No indicators",
    studies: [],
  },
  volume: {
    name: "Volume Profile",
    description: "Volume + Volume Profile",
    studies: [
      "Volume@tv-basicstudies",
      "VolumeProfile@tv-basicstudies",
    ],
  },
  momentum: {
    name: "Momentum",
    description: "RSI, Stochastic, MACD",
    studies: [
      "RSI@tv-basicstudies",
      "Stochastic@tv-basicstudies",
      "MACD@tv-basicstudies",
    ],
  },
  trend: {
    name: "Trend",
    description: "EMA, ADX, Ichimoku",
    studies: [
      "MAExp@tv-basicstudies",
      "ADX@tv-basicstudies",
      "IchimokuCloud@tv-basicstudies",
    ],
  },
};

export default function TradingViewAdvancedChart() {
  const { selectedSymbol, chartPeriod, watchlist } = usePriceFeed();
  const containerRef = useRef(null);
  const widgetContainerRef = useRef(null);
  const [loadError, setLoadError] = useState(null);
  const [activePreset, setActivePreset] = useState("default");
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(true);
  const prevSymbolRef = useRef(selectedSymbol);
  const prevPeriodRef = useRef(chartPeriod);
  const prevThemeRef = useRef(null);
  const prevPresetRef = useRef("default");
  const debounceTimerRef = useRef(null);

  // Get current theme
  const getCurrentTheme = useCallback(() => {
    if (typeof window === "undefined") return "dark";
    return document.documentElement.getAttribute("data-theme") !== "light" ? "dark" : "light";
  }, []);

  // Convert Yahoo Finance symbol to TradingView symbol format
  const yahooToTvSymbol = useCallback((symbol) => {
    if (!symbol) return "NYSE:SPY";

    // Crypto: BTC-USD → BINANCE:BTCUSDT
    if (symbol.includes("-USD")) {
      const base = symbol.replace("-USD", "");
      return `BINANCE:${base}USDT`;
    }
    if (symbol.includes("-BTC")) {
      const base = symbol.replace("-BTC", "");
      return `BINANCE:${base}BTC`;
    }
    if (symbol.includes("-ETH")) {
      const base = symbol.replace("-ETH", "");
      return `BINANCE:${base}ETH`;
    }

    // Forex: EURUSD=X → FX:EURUSD
    if (symbol.endsWith("=X") && !symbol.includes("^")) {
      const pair = symbol.replace("=X", "");
      return `FX:${pair}`;
    }

    // Futures: GC=F → COMEX:GC1!, ES=F → CME_MINI:ES1!
    if (symbol.endsWith("=F")) {
      const base = symbol.replace("=F", "");
      const exchangeMap = {
        GC: "COMEX", SI: "COMEX", HG: "COMEX", PL: "NYMEX", PA: "NYMEX",
        CL: "NYMEX", NG: "NYMEX", RB: "NYMEX", HO: "NYMEX",
        ES: "CME_MINI", NQ: "CME_MINI", RTY: "CME_MINI", YM: "CBOT_MINI",
        ZB: "CBOT", ZN: "CBOT", ZF: "CBOT", ZT: "CBOT",
      };
      const exchange = exchangeMap[base] || "COMEX";
      return `${exchange}:${base}1!`;
    }

    // Indices: ^GSPC → SP:SPX
    if (symbol.startsWith("^")) {
      const indexMap = {
        "^GSPC": "SP:SPX",
        "^IXIC": "NASDAQ:NDX",
        "^DJI": "DJI:DJI",
        "^RUT": "SP:RUT",
        "^VIX": "TVC:VIX",
        "^TNX": "CBOT:TNX",
        "^TYX": "CBOT:TYX",
        "^FVX": "CBOT:FVX",
        "^FTSE": "FTSE:UKX",
        "^N225": "TSE:NI225",
        "^HSI": "HSI:HSI",
        "^GDAXI": "XETRA:DAX",
      };
      return indexMap[symbol] || `SP:${symbol.replace("^", "")}`;
    }

    // Stocks/ETFs — add exchange prefix for popular ones
    const stockExchangeMap = {
      SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ", IWM: "AMEX:IWM", DIA: "AMEX:DIA",
      VOO: "AMEX:VOO", VTI: "AMEX:VTI", VWO: "AMEX:VWO", BND: "AMEX:BND",
      AAPL: "NASDAQ:AAPL", MSFT: "NASDAQ:MSFT", GOOGL: "NASDAQ:GOOGL",
      GOOG: "NASDAQ:GOOG", AMZN: "NASDAQ:AMZN", NVDA: "NASDAQ:NVDA",
      META: "NASDAQ:META", TSLA: "NASDAQ:TSLA", NFLX: "NASDAQ:NFLX",
    };
    return stockExchangeMap[symbol] || symbol;
  }, []);

  // Build watchlist array for TradingView widget
  const tvWatchlist = useMemo(() => {
    return watchlist
      .slice(0, 20) // TradingView widget limit
      .map((w) => yahooToTvSymbol(w.symbol))
      .filter(Boolean);
  }, [watchlist, yahooToTvSymbol]);

  // Create or recreate the TradingView widget
  const createWidget = useCallback(() => {
    if (!containerRef.current) return;

    const theme = getCurrentTheme();
    const tvSymbol = yahooToTvSymbol(selectedSymbol);
    const interval = PERIOD_TO_TV_INTERVAL[chartPeriod] || "D";
    const studies = STYLE_PRESETS[activePreset]?.studies || [];

    // Clear existing widget
    const widgetDiv = containerRef.current.querySelector(".tradingview-widget-container__widget");
    if (widgetDiv) {
      widgetDiv.innerHTML = "";
    }

    // Create the widget container
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.width = "100%";
    widgetContainer.style.height = "100%";

    const widgetDiv2 = document.createElement("div");
    widgetDiv2.className = "tradingview-widget-container__widget";
    widgetDiv2.style.width = "100%";
    widgetDiv2.style.height = "100%";
    widgetContainer.appendChild(widgetDiv2);

    // Create the script element with JSON config
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;

    const config = {
      autosize: true,
      symbol: tvSymbol,
      interval: interval,
      timezone: "America/New_York",
      theme: theme,
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      save_image: true,
      backgroundColor: theme === "dark" ? "#0f0f23" : "#ffffff",
      gridColor: theme === "dark" ? "rgba(30, 41, 59, 0.5)" : "rgba(243, 244, 246, 0.5)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      hide_volume: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      show_popup_button: false,
      studies: studies,
      watchlist: tvWatchlist,
      support_host: "https://www.tradingview.com",
    };

    script.innerHTML = JSON.stringify(config);

    script.onload = () => {
      setWidgetLoading(false);
      setLoadError(null);
    };

    script.onerror = () => {
      setLoadError("Failed to load TradingView chart. Check your internet connection.");
      setWidgetLoading(false);
    };

    widgetContainer.appendChild(script);

    // Replace container contents
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(widgetContainer);

    setWidgetLoading(true);
    prevSymbolRef.current = selectedSymbol;
    prevPeriodRef.current = chartPeriod;
    prevThemeRef.current = theme;
    prevPresetRef.current = activePreset;
  }, [selectedSymbol, chartPeriod, activePreset, tvWatchlist, yahooToTvSymbol, getCurrentTheme]);

  // Initial widget creation
  useEffect(() => {
    createWidget();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recreate widget when symbol, period, theme, or preset changes (debounced)
  useEffect(() => {
    const currentTheme = getCurrentTheme();
    const symbolChanged = prevSymbolRef.current !== selectedSymbol;
    const periodChanged = prevPeriodRef.current !== chartPeriod;
    const themeChanged = prevThemeRef.current !== currentTheme;
    const presetChanged = prevPresetRef.current !== activePreset;

    if (!symbolChanged && !periodChanged && !themeChanged && !presetChanged) return;

    // Debounce recreation to avoid rapid reloads
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      createWidget();
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [selectedSymbol, chartPeriod, activePreset, createWidget, getCurrentTheme]);

  // Theme change observer
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = getCurrentTheme();
      if (newTheme !== prevThemeRef.current) {
        // Trigger recreation via state update
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          createWidget();
        }, 300);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [createWidget, getCurrentTheme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Handle preset change
  const handlePresetChange = useCallback((presetKey) => {
    setActivePreset(presetKey);
    setShowPresetMenu(false);
    // Widget recreation is handled by the useEffect above
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header bar — TradingView branding + controls */}
      <div className="px-3 sm:px-4 py-2 border-b border-base-300 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-content/70">TradingView</span>
          <span className="badge badge-xs badge-accent gap-1">Advanced</span>
          {widgetLoading && (
            <span className="loading loading-spinner loading-xs text-primary"></span>
          )}
        </div>

        {/* Preset selector */}
        <div className="relative">
          <button
            className={`btn btn-sm sm:btn-xs min-h-[44px] sm:min-h-0 ${showPresetMenu ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => setShowPresetMenu(!showPresetMenu)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="hidden sm:inline">{STYLE_PRESETS[activePreset]?.name || "Default"}</span>
          </button>
          {showPresetMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 min-w-[220px]">
              <div className="text-xs text-base-content/50 px-2 pb-1.5 font-medium">Style Presets</div>
              {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={`w-full text-left flex items-center gap-2 px-2 py-2 sm:py-1.5 hover:bg-base-200 rounded text-sm sm:text-xs min-h-[44px] sm:min-h-0 ${activePreset === key ? "bg-base-200 font-medium" : ""}`}
                  onClick={() => handlePresetChange(key)}
                >
                  <span className="flex-1">
                    <div>{preset.name}</div>
                    <div className="text-[10px] text-base-content/40">{preset.description}</div>
                  </span>
                  {activePreset === key && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 relative min-h-0">
        {/* Loading state */}
        {widgetLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-200/50 z-10 gap-3 pointer-events-none">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <span className="text-sm text-base-content/50">Loading TradingView Chart...</span>
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="alert alert-error alert-sm max-w-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">{loadError}</span>
              <button
                className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost"
                onClick={() => {
                  setLoadError(null);
                  createWidget();
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* TradingView widget container */}
        <div
          ref={containerRef}
          className="w-full h-full"
        />
      </div>

      {/* Footer — info bar */}
      <div className="px-3 py-1 bg-base-200/30 border-t border-base-300 flex items-center justify-between text-[10px] text-base-content/40">
        <div className="flex items-center gap-2">
          <span>TradingView data</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">100+ indicators</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Drawing tools</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Switch to Live for real-time WS feed</span>
        </div>
      </div>
    </div>
  );
}
