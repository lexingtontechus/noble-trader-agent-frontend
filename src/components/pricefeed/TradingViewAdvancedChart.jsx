"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * TradingViewAdvancedChart — Full TradingView Advanced Chart Widget.
 *
 * Features:
 *   - 100+ built-in technical indicators
 *   - Drawing tools (trendlines, Fibonacci, shapes, etc.)
 *   - Multiple chart types (candle, line, area, bars, heikin-ashi, etc.)
 *   - Comparison overlays (add multiple symbols)
 *   - Multiple timeframes (1m to 1M)
 *   - Style customization
 *   - Watchlist integration
 *   - Symbol sync from PriceFeedContext
 *   - Theme sync (dark/light)
 *   - Responsive layout
 *   - Study templates and drawing templates
 *
 * Architecture:
 *   - Loads TradingView widget script dynamically (avoids bundle bloat)
 *   - Widget instance managed via ref
 *   - Symbol changes trigger widget.setSymbol()
 *   - Theme changes trigger widget.changeTheme()
 *   - Container auto-resizes via ResizeObserver
 *
 * Note: TradingView widget uses its own data feed. For real-time
 * WebSocket prices, use the LiveCandlestickChart (lightweight-charts).
 */

const TV_WIDGET_SCRIPT_URL = "https://s3.tradingview.com/tv.js";

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

// Map our period keys to TradingView range strings
const PERIOD_TO_TV_RANGE = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "12M",
  "2y": "24M",
};

// Style presets for the widget
const STYLE_PRESETS = {
  default: {
    name: "Default",
    studies: ["MASimple@tv-basicstudies", "Volume@tv-basicstudies"],
  },
  pro: {
    name: "Pro Trader",
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
    studies: [],
  },
  volume: {
    name: "Volume Profile",
    studies: [
      "Volume@tv-basicstudies",
      "VolumeProfile@tv-basicstudies",
    ],
  },
};

export default function TradingViewAdvancedChart() {
  const { selectedSymbol, setSelectedSymbol, chartPeriod, setChartPeriod } = usePriceFeed();
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const scriptLoadedRef = useRef(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [activePreset, setActivePreset] = useState("default");
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const prevSymbolRef = useRef(selectedSymbol);
  const prevThemeRef = useRef(null);

  // Get current theme
  const getCurrentTheme = useCallback(() => {
    if (typeof window === "undefined") return "dark";
    return document.documentElement.getAttribute("data-theme") !== "light" ? "dark" : "light";
  }, []);

  // Convert Yahoo Finance symbol to TradingView symbol format
  // e.g. "SPY" → "SPY", "BTC-USD" → "BINANCE:BTCUSDT", "GC=F" → "COMEX:GC1!"
  const yahooToTvSymbol = useCallback((symbol) => {
    if (!symbol) return "SPY";

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
        GC: "COMEX",
        SI: "COMEX",
        CL: "NYMEX",
        NG: "NYMEX",
        ES: "CME_MINI",
        NQ: "CME_MINI",
        YM: "CBOT_MINI",
        RTY: "CME_MINI",
        ZB: "CBOT",
        ZN: "CBOT",
        ZF: "CBOT",
        ZT: "CBOT",
        HG: "COMEX",
        PL: "NYMEX",
        PA: "NYMEX",
      };
      const exchange = exchangeMap[base] || "COMEX";
      return `${exchange}:${base}1!`;
    }

    // Indices: ^GSPC → SP:SPX, ^IXIC → NASDAQ:NDX, ^DJI → DJI:DJI
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

    // Default: stocks/ETFs — just use the symbol as-is
    return symbol;
  }, []);

  // Convert TradingView symbol back to Yahoo format (for watchlist sync)
  const tvToYahooSymbol = useCallback((tvSymbol) => {
    if (!tvSymbol) return null;

    // BINANCE:BTCUSDT → BTC-USD
    if (tvSymbol.startsWith("BINANCE:")) {
      const pair = tvSymbol.replace("BINANCE:", "");
      if (pair.endsWith("USDT")) return `${pair.replace("USDT", "")}-USD`;
      if (pair.endsWith("BUSD")) return `${pair.replace("BUSD", "")}-USD`;
      if (pair.endsWith("BTC")) return `${pair.replace("BTC", "")}-BTC`;
      if (pair.endsWith("ETH")) return `${pair.replace("ETH", "")}-ETH`;
    }

    // FX:EURUSD → EURUSD=X
    if (tvSymbol.startsWith("FX:")) {
      return `${tvSymbol.replace("FX:", "")}=X`;
    }

    // COMEX:GC1! → GC=F, CME_MINI:ES1! → ES=F
    if (tvSymbol.match(/^(COMEX|NYMEX|CME_MINI|CBOT|CBOT_MINI):/)) {
      const base = tvSymbol.split(":")[1].replace(/\d+!$/, "");
      return `${base}=F`;
    }

    // SP:SPX → ^GSPC, etc.
    if (tvSymbol.startsWith("SP:")) {
      const reverseIndex = {
        "SP:SPX": "^GSPC",
        "SP:RUT": "^RUT",
      };
      return reverseIndex[tvSymbol] || null;
    }

    // Default: just the ticker part
    const parts = tvSymbol.split(":");
    return parts.length > 1 ? parts[1] : tvSymbol;
  }, []);

  // Load TradingView widget script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.TradingView) {
      scriptLoadedRef.current = true;
      return;
    }

    // Check if script tag already exists
    const existingScript = document.querySelector(`script[src="${TV_WIDGET_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        scriptLoadedRef.current = true;
      });
      return;
    }

    const script = document.createElement("script");
    script.src = TV_WIDGET_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
    };
    script.onerror = () => {
      setLoadError("Failed to load TradingView chart library. Check your internet connection.");
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove script on unmount — it's shared
    };
  }, []);

  // Create widget when script is loaded and container exists
  useEffect(() => {
    if (!scriptLoadedRef.current || !containerRef.current) return;

    // Wait for TradingView global to be available
    const waitForTV = setInterval(() => {
      if (typeof window.TradingView !== "undefined") {
        clearInterval(waitForTV);
        createWidget();
      }
    }, 100);

    // Timeout after 10s
    const timeout = setTimeout(() => {
      clearInterval(waitForTV);
      if (!widgetRef.current) {
        setLoadError("TradingView widget failed to initialize.");
      }
    }, 10000);

    return () => {
      clearInterval(waitForTV);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create the TradingView widget
  const createWidget = useCallback(() => {
    if (!containerRef.current || widgetRef.current) return;

    const theme = getCurrentTheme();
    prevThemeRef.current = theme;
    const tvSymbol = yahooToTvSymbol(selectedSymbol);
    const interval = PERIOD_TO_TV_INTERVAL[chartPeriod] || "D";

    try {
      // Clear container
      containerRef.current.innerHTML = "";

      widgetRef.current = new window.TradingView.widget({
        // Container
        container_id: containerRef.current.id,
        autosize: true,

        // Symbol & interval
        symbol: tvSymbol,
        interval: interval,

        // Appearance
        theme: theme,
        style: "1", // Candle style
        locale: "en",
        toolbar_bg: theme === "dark" ? "#0f0f23" : "#ffffff",

        // Features
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies_overrides: {},

        // Chart config
        withdateranges: true,
        save_image: true,
        details: false,
        hotlist: false,
        calendar: false,
        show_popup_button: false,
        popup_width: 1000,
        popup_height: 650,

        // Studies from active preset
        studies: STYLE_PRESETS[activePreset]?.studies || [],

        // Custom CSS URL (optional)
        // custom_css_url: "/tradingview-override.css",

        // Loading screen
        loading_screen: { backgroundColor: theme === "dark" ? "#0f0f23" : "#ffffff", foregroundColor: theme === "dark" ? "#d1d5db" : "#374151" },

        // Overrides for dark/light theme consistency
        overrides: theme === "dark" ? {
          "mainSeriesProperties.candleStyle.upColor": "#22c55e",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
          "paneProperties.background": "#0f0f23",
          "paneProperties.vertGridProperties.color": "#1e293b",
          "paneProperties.horzGridProperties.color": "#1e293b",
          "scalesProperties.textColor": "#d1d5db",
        } : {
          "mainSeriesProperties.candleStyle.upColor": "#22c55e",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        },
      });

      setWidgetReady(true);
      setLoadError(null);
    } catch (err) {
      console.error("[TradingViewAdvancedChart] Widget creation error:", err);
      setLoadError(`Chart error: ${err.message}`);
    }
  }, [selectedSymbol, chartPeriod, activePreset, yahooToTvSymbol, getCurrentTheme]);

  // Sync symbol changes (without recreating widget)
  useEffect(() => {
    if (!widgetRef.current || !widgetReady) return;
    if (prevSymbolRef.current === selectedSymbol) return;

    const tvSymbol = yahooToTvSymbol(selectedSymbol);
    try {
      widgetRef.current.setSymbol(tvSymbol, PERIOD_TO_TV_INTERVAL[chartPeriod] || "D");
      prevSymbolRef.current = selectedSymbol;
    } catch (err) {
      console.error("[TradingViewAdvancedChart] Symbol change error:", err);
    }
  }, [selectedSymbol, chartPeriod, widgetReady, yahooToTvSymbol]);

  // Sync theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = getCurrentTheme();
      if (newTheme !== prevThemeRef.current && widgetRef.current) {
        try {
          widgetRef.current.changeTheme(newTheme);
          prevThemeRef.current = newTheme;
        } catch (err) {
          console.error("[TradingViewAdvancedChart] Theme change error:", err);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [getCurrentTheme, widgetReady]);

  // Handle preset change (requires widget recreation)
  const handlePresetChange = useCallback((presetKey) => {
    setActivePreset(presetKey);
    setShowPresetMenu(false);

    // Must recreate widget to change studies
    if (widgetRef.current) {
      try {
        widgetRef.current.remove();
      } catch { /* ignore */ }
      widgetRef.current = null;
    }
    setWidgetReady(false);

    // Small delay to allow cleanup
    setTimeout(() => {
      if (window.TradingView && containerRef.current) {
        createWidget();
      }
    }, 100);
  }, [createWidget]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch { /* ignore */ }
        widgetRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header bar — TradingView branding + controls */}
      <div className="px-3 sm:px-4 py-2 border-b border-base-300 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-content/70">TradingView</span>
          <span className="badge badge-xs badge-accent gap-1">Advanced</span>
          {widgetReady && (
            <span className="badge badge-xs badge-ghost gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
              Connected
            </span>
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
            <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 min-w-[200px]">
              <div className="text-xs text-base-content/50 px-2 pb-1.5 font-medium">Style Presets</div>
              {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={`w-full text-left flex items-center gap-2 px-2 py-2 sm:py-1.5 hover:bg-base-200 rounded text-sm sm:text-xs min-h-[44px] sm:min-h-0 ${activePreset === key ? "bg-base-200 font-medium" : ""}`}
                  onClick={() => handlePresetChange(key)}
                >
                  <span className="flex-1">{preset.name}</span>
                  {activePreset === key && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="text-base-content/30 text-[10px]">{preset.studies.length} ind.</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 relative min-h-0">
        {/* Loading state */}
        {!widgetReady && !loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-200/50 z-10 gap-3">
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
                  if (window.TradingView) createWidget();
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* TradingView widget container */}
        <div
          id="tradingview-advanced-chart"
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
