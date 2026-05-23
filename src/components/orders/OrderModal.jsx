"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { notifySuccess, notifyError, notifyWarning } from "@/lib/notifications";
import {
  yahooToAlpacaSymbol,
  getAlpacaTradeabilityReason,
  isAlpacaTradable,
  getAssetClass,
} from "@/lib/symbol-utils";

/* ───────────────────────────────────────────────────────────────
   Alpaca order-type & time-in-force rules per asset class
   Ref: https://docs.alpaca.markets/reference/postorder
   ─────────────────────────────────────────────────────────────── */

const ORDER_TYPES = {
  equity: [
    { value: "market",         label: "Market" },
    { value: "limit",          label: "Limit" },
    { value: "stop",           label: "Stop" },
    { value: "stop_limit",     label: "Stop Limit" },
    { value: "trailing_stop",  label: "Trailing Stop" },
  ],
  crypto: [
    { value: "market",     label: "Market" },
    { value: "limit",      label: "Limit" },
    { value: "stop_limit", label: "Stop Limit" },
  ],
};

const TIME_IN_FORCE = {
  equity: [
    { value: "day", label: "Day" },
    { value: "gtc", label: "GTC (Good Till Cancelled)" },
    { value: "opg", label: "OPG (At Open)" },
    { value: "cls", label: "CLS (At Close)" },
    { value: "ioc", label: "IOC (Immediate or Cancel)" },
    { value: "fok", label: "FOK (Fill or Kill)" },
  ],
  crypto: [
    { value: "gtc", label: "GTC (Good Till Cancelled)" },
    { value: "ioc", label: "IOC (Immediate or Cancel)" },
  ],
};

const ORDER_CLASSES = [
  { value: "simple",  label: "Simple",   desc: "Standard single-leg order" },
  { value: "bracket", label: "Bracket",  desc: "Entry + TP + SL (3 legs)" },
  { value: "oco",     label: "OCO",      desc: "One-Cancels-Other: TP + SL" },
  { value: "oto",     label: "OTO",      desc: "One-Triggers-Other: Entry + 1 leg" },
];

/**
 * Map our getAssetClass() result to the Alpaca trading category.
 * "stock" and "unknown" → equity rules
 * "crypto"              → crypto rules
 * Forex / futures / indices are blocked entirely (not supported by Alpaca).
 */
function getAlpacaAssetCategory(assetClass) {
  if (assetClass === "crypto") return "crypto";
  return "equity";
}

/* ─────────────────────────────────────────────────────────────── */

export default function OrderModal({ symbol, onClose, onSuccess, defaultSide }) {
  const [side, setSide] = useState(defaultSide || "buy");
  const [qty, setQty] = useState(100);
  const [orderType, setOrderType] = useState("limit");
  const [orderClass, setOrderClass] = useState("simple");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailPrice, setTrailPrice] = useState("");
  const [trailPercent, setTrailPercent] = useState("");
  const [trailType, setTrailType] = useState("price"); // "price" | "percent"
  const [timeInForce, setTimeInForce] = useState("day");
  const [tpLimitPrice, setTpLimitPrice] = useState("");
  const [slStopPrice, setSlStopPrice] = useState("");
  const [slLimitPrice, setSlLimitPrice] = useState("");
  const [otoLeg, setOtoLeg] = useState("sl"); // "tp" | "sl" — which leg to trigger for OTO
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

  // Convert the incoming Yahoo Finance symbol to Alpaca format
  const alpacaSymbol = yahooToAlpacaSymbol(symbol);
  const assetClass = getAssetClass(symbol);
  const tradeabilityReason = getAlpacaTradeabilityReason(symbol);
  const canTrade = isAlpacaTradable(symbol);

  // Show the Alpaca-compatible symbol to the user (or the original if same)
  const displaySymbol = alpacaSymbol || symbol;
  const symbolConverted = alpacaSymbol !== symbol && alpacaSymbol !== null;

  // Derive the Alpaca asset category and its allowed options
  const category = getAlpacaAssetCategory(assetClass);
  const allowedTypes = ORDER_TYPES[category] || ORDER_TYPES.equity;
  const allowedTIF   = TIME_IN_FORCE[category] || TIME_IN_FORCE.equity;

  // When the category changes, reset order type / TIF if the current
  // value is not valid for the new category
  useEffect(() => {
    const typeValues = allowedTypes.map((t) => t.value);
    if (!typeValues.includes(orderType)) {
      setOrderType("limit");
    }
  }, [category]);

  useEffect(() => {
    const tifValues = allowedTIF.map((t) => t.value);
    if (!tifValues.includes(timeInForce)) {
      setTimeInForce(tifValues[0]?.value || "gtc");
    }
  }, [category, allowedTIF]);

  // Bracket/OCO/OTO only available for equity
  const isAdvanced = orderClass === "bracket" || orderClass === "oco" || orderClass === "oto";
  const supportsAdvanced = category === "equity";

  // When switching to bracket/OTO, force orderType to "limit" or "market" (Alpaca requirement)
  useEffect(() => {
    if ((orderClass === "bracket" || orderClass === "oto") && orderType !== "limit" && orderType !== "market") {
      setOrderType("limit");
    }
  }, [orderClass, orderType]);

  // Which extra fields are needed for the current order type?
  const needsLimitPrice  = orderType === "limit" || orderType === "stop_limit" || isAdvanced;
  const needsStopPrice   = orderType === "stop" || orderType === "stop_limit";
  const needsTrail       = orderType === "trailing_stop" && !isAdvanced;

  // Human-readable label for the current order type
  const orderTypeLabel =
    allowedTypes.find((t) => t.value === orderType)?.label || orderType;
  const tifLabel =
    allowedTIF.find((t) => t.value === timeInForce)?.label || timeInForce;
  const orderClassLabel =
    ORDER_CLASSES.find((c) => c.value === orderClass)?.label || orderClass;

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Handle Escape key to close modal
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        if (confirming) {
          setConfirming(false);
        } else {
          onClose();
        }
      }
    },
    [confirming, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus first input after mount
  useEffect(() => {
    if (firstInputRef.current && !confirming) {
      const timer = setTimeout(() => firstInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  // Validate before allowing "Review Order"
  const canReview = useMemo(() => {
    if (!canTrade) return false;
    if (needsLimitPrice && !limitPrice && orderClass !== "simple") return false;
    if (needsLimitPrice && !limitPrice && (orderType === "limit" || orderType === "stop_limit")) return false;
    if (needsStopPrice && !stopPrice) return false;
    if (needsTrail && trailType === "price" && !trailPrice) return false;
    if (needsTrail && trailType === "percent" && !trailPercent) return false;

    // Bracket validation
    if (orderClass === "bracket") {
      if (!tpLimitPrice) return false;
      if (!slStopPrice) return false;
    }

    // OCO validation
    if (orderClass === "oco") {
      if (!tpLimitPrice) return false;
      if (!slStopPrice) return false;
    }

    // OTO validation — need the chosen triggered leg
    if (orderClass === "oto") {
      if (otoLeg === "tp" && !tpLimitPrice) return false;
      if (otoLeg === "sl" && !slStopPrice) return false;
    }

    return true;
  }, [canTrade, orderType, orderClass, limitPrice, stopPrice, trailType, trailPrice, trailPercent,
      tpLimitPrice, slStopPrice, otoLeg, needsLimitPrice, needsStopPrice, needsTrail]);

  const handleSubmit = async () => {
    if (!canTrade) {
      const msg = tradeabilityReason || `${symbol} is not available for trading on Alpaca`;
      setError(msg);
      notifyError(msg);
      setConfirming(false);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const body = {
        symbol: alpacaSymbol,
        qty: Number(qty),
        side,
        type: orderType,
        time_in_force: timeInForce,
      };

      // Add optional price fields per Alpaca API spec
      if (needsLimitPrice && limitPrice) {
        body.limit_price = Number(limitPrice);
      }
      if (needsStopPrice && stopPrice) {
        body.stop_price = Number(stopPrice);
      }
      if (needsTrail) {
        if (trailType === "price" && trailPrice) {
          body.trail_price = Number(trailPrice);
        } else if (trailType === "percent" && trailPercent) {
          body.trail_percent = Number(trailPercent);
        }
      }

      // Advanced order classes
      if (orderClass === "bracket") {
        body.order_class = "bracket";
        body.take_profit = { limit_price: Number(tpLimitPrice) };
        body.stop_loss = { stop_price: Number(slStopPrice) };
        if (slLimitPrice) {
          body.stop_loss.limit_price = Number(slLimitPrice);
        }
      } else if (orderClass === "oco") {
        body.order_class = "oco";
        body.take_profit = { limit_price: Number(tpLimitPrice) };
        body.stop_loss = { stop_price: Number(slStopPrice) };
        if (slLimitPrice) {
          body.stop_loss.limit_price = Number(slLimitPrice);
        }
      } else if (orderClass === "oto") {
        body.order_class = "oto";
        if (otoLeg === "tp") {
          body.take_profit = { limit_price: Number(tpLimitPrice) };
        } else {
          body.stop_loss = { stop_price: Number(slStopPrice) };
          if (slLimitPrice) {
            body.stop_loss.limit_price = Number(slLimitPrice);
          }
        }
      }

      const res = await fetch("/api/alpaca/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      const classTag = orderClass !== "simple" ? ` [${orderClassLabel.toUpperCase()}]` : "";
      setToast(`${String(side).toUpperCase()} ${qty} ${displaySymbol}${classTag} order submitted!`);
      notifySuccess(`${String(side).toUpperCase()} ${qty} ${displaySymbol}${classTag} order submitted!`);
      setTimeout(() => {
        setToast("");
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
      notifyError(`Order failed: ${err.message}`);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Compute risk/reward for bracket/OCO
  const entryPx = parseFloat(limitPrice) || 0;
  const slPx = parseFloat(slStopPrice) || 0;
  const tpPx = parseFloat(tpLimitPrice) || 0;
  const riskAmt = entryPx > 0 && slPx > 0 ? Math.abs(entryPx - slPx) * Number(qty) : 0;
  const rewardAmt = entryPx > 0 && tpPx > 0 ? Math.abs(tpPx - entryPx) * Number(qty) : 0;
  const rrRatio = riskAmt > 0 ? (rewardAmt / riskAmt).toFixed(2) : "—";

  return (
    <>
      <dialog className="modal modal-open modal-top" ref={modalRef}>
        {/* Backdrop */}
        <div
          className="modal-backdrop bg-black/60"
          onClick={handleBackdropClick}
        ></div>

        <div className="modal-box max-w-2xl p-8 bg-base-300 w-full max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 hover:bg-base-300"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Title */}
          <h3 className="font-bold text-lg mb-1">
            {side === "buy" ? "Buy" : "Sell"} {displaySymbol}
          </h3>
          <p className="text-sm text-base-content/60 mb-2">
            Place a paper trading order via Alpaca
          </p>

          {/* Asset class badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`badge badge-sm ${
              category === "crypto" ? "badge-primary" :
              "badge-ghost"
            }`}>
              {category === "crypto" ? "Crypto" : "Equity"}
            </span>
            {symbolConverted && (
              <span className="badge badge-sm badge-info">
                {symbol} → {alpacaSymbol}
              </span>
            )}
            {orderClass !== "simple" && (
              <span className="badge badge-sm badge-accent">
                {orderClassLabel}
              </span>
            )}
          </div>

          {/* Symbol conversion notice */}
          {symbolConverted && (
            <div className="alert alert-info mb-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">
                Symbol converted for Alpaca: {symbol} → {alpacaSymbol}
              </span>
            </div>
          )}

          {/* Non-tradable asset warning */}
          {!canTrade && (
            <div className="alert alert-warning mb-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-xs">{tradeabilityReason}</span>
            </div>
          )}

          {/* Category-specific TIF restriction notice */}
          {canTrade && category === "crypto" && (
            <div className="alert alert-info mb-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">
                Crypto orders support GTC and IOC time-in-force only. Stop and trailing stop orders are not available.
              </span>
            </div>
          )}

          {!confirming ? (
            <>
              {/* Symbol (read-only) */}
              <div className="form-control w-full mb-3">
                <label className="label">
                  <span className="label-text font-medium">Symbol</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full opacity-70"
                  value={displaySymbol}
                  disabled
                />
              </div>

              {/* Side Toggle */}
              <div className="form-control w-full mb-3">
                <label className="label">
                  <span className="label-text font-medium">Side</span>
                </label>
                <div className="flex w-full gap-2">
                  <button
                    className={`btn flex-1 ${side === "buy" ? "btn-success" : "btn-ghost border-base-300"}`}
                    onClick={() => setSide("buy")}
                  >
                    Buy
                  </button>
                  <button
                    className={`btn flex-1 ${side === "sell" ? "btn-error" : "btn-ghost border-base-300"}`}
                    onClick={() => setSide("sell")}
                  >
                    Sell
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div className="form-control w-full mb-3">
                <label className="label">
                  <span className="label-text font-medium">Quantity</span>
                </label>
                <input
                  ref={firstInputRef}
                  type="number"
                  className="input input-bordered w-full"
                  value={qty}
                  min={1}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>

              {/* ── Order Class Selector ─────────────────────────── */}
              {supportsAdvanced && (
                <div className="form-control w-full mb-3">
                  <label className="label">
                    <span className="label-text font-medium">Order Class</span>
                    <span className="label-text-alt text-base-content/40 text-xs">
                      Advanced strategies
                    </span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {ORDER_CLASSES.map((cls) => (
                      <button
                        key={cls.value}
                        type="button"
                        className={`btn btn-sm flex-col items-center py-2 h-auto ${
                          orderClass === cls.value
                            ? cls.value === "bracket"
                              ? "btn-accent"
                              : cls.value === "oco"
                              ? "btn-secondary"
                              : cls.value === "oto"
                              ? "btn-warning"
                              : "btn-primary"
                            : "btn-ghost border border-base-300"
                        }`}
                        onClick={() => setOrderClass(cls.value)}
                      >
                        <span className="font-bold text-xs">{cls.label}</span>
                        <span className="text-[9px] text-base-content/50 leading-tight mt-0.5">
                          {cls.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Type — filtered by asset class & order class */}
              <div className="form-control w-full mb-3">
                <label className="label">
                  <span className="label-text font-medium">Order Type</span>
                  <span className="label-text-alt text-base-content/40 text-xs">
                    {category === "crypto" ? "Crypto" : "Equity"} options
                  </span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  disabled={orderClass === "bracket" || orderClass === "oto"}
                >
                  {allowedTypes
                    .filter((t) => {
                      // Bracket/OTO require limit or market entry
                      if ((orderClass === "bracket" || orderClass === "oto") && t.value !== "limit" && t.value !== "market") return false;
                      // OCO uses limit leg internally
                      if (orderClass === "oco" && t.value !== "limit") return false;
                      return true;
                    })
                    .map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                </select>
                {(orderClass === "bracket" || orderClass === "oto") && (
                  <label className="label">
                    <span className="label-text-alt text-xs text-base-content/40">
                      {orderClass === "oto" ? "OTO" : "Bracket"} entry is always limit or market
                    </span>
                  </label>
                )}
                {orderClass === "oco" && (
                  <label className="label">
                    <span className="label-text-alt text-xs text-base-content/40">
                      OCO uses limit order as the primary leg
                    </span>
                  </label>
                )}
              </div>

              {/* Limit Price — shown for limit, stop_limit, bracket, OCO */}
              {needsLimitPrice && (
                <div className="form-control w-full mb-3">
                  <label className="label">
                    <span className="label-text font-medium">
                      {isAdvanced ? "Entry Price" : "Limit Price"}
                    </span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    placeholder="0.00"
                    value={limitPrice}
                    step="0.01"
                    min="0"
                    onChange={(e) => setLimitPrice(e.target.value)}
                  />
                </div>
              )}

              {/* Stop Price — shown for stop & stop_limit (simple mode) */}
              {needsStopPrice && (
                <div className="form-control w-full mb-3">
                  <label className="label">
                    <span className="label-text font-medium">Stop Price</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    placeholder="0.00"
                    value={stopPrice}
                    step="0.01"
                    min="0"
                    onChange={(e) => setStopPrice(e.target.value)}
                  />
                </div>
              )}

              {/* Trailing Stop — trail price or trail percent (simple mode only) */}
              {needsTrail && (
                <div className="form-control w-full mb-3">
                  <label className="label">
                    <span className="label-text font-medium">Trail By</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="join flex-1">
                      <input
                        type="number"
                        className="input input-bordered join-item flex-1"
                        placeholder={trailType === "price" ? "0.00" : "0.0"}
                        value={trailType === "price" ? trailPrice : trailPercent}
                        step={trailType === "price" ? "0.01" : "0.1"}
                        min="0"
                        onChange={(e) =>
                          trailType === "price"
                            ? setTrailPrice(e.target.value)
                            : setTrailPercent(e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className={`btn join-item ${trailType === "price" ? "btn-active" : ""}`}
                        onClick={() => setTrailType("price")}
                      >
                        $ Price
                      </button>
                      <button
                        type="button"
                        className={`btn join-item ${trailType === "percent" ? "btn-active" : ""}`}
                        onClick={() => setTrailType("percent")}
                      >
                        % Percent
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-base-content/40 mt-1">
                    Dollar or percent amount away from the highest (sell) / lowest (buy) price
                  </p>
                </div>
              )}

              {/* ── Bracket / OCO / OTO: Take Profit & Stop Loss ─────── */}
              {isAdvanced && (
                <div className="border border-base-300 rounded-lg p-4 mb-3 bg-base-200/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="font-bold text-sm">
                      {orderClass === "bracket" ? "Bracket Order — Risk Management" : orderClass === "oco" ? "OCO Order — Exit Strategy" : "OTO Order — Triggered Order"}
                    </span>
                  </div>

                  <p className="text-xs text-base-content/50 mb-3">
                    {orderClass === "bracket"
                      ? "When the entry order fills, Alpaca automatically places the TP and SL orders. Both exit orders are active until one fills, then the other is canceled."
                      : orderClass === "oco"
                      ? "Place a limit take-profit order and a stop-loss order. When one fills, the other is automatically canceled."
                      : "When the entry order fills, Alpaca places a single triggered order (TP or SL). Choose which leg to activate on fill."}
                  </p>

                  {/* OTO Leg Selector */}
                  {orderClass === "oto" && (
                    <div className="form-control w-full mb-3">
                      <label className="label py-0">
                        <span className="label-text font-medium">Triggered Leg</span>
                        <span className="label-text-alt text-xs text-base-content/40">
                          Which order activates on entry fill
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`btn btn-sm flex-1 ${otoLeg === "tp" ? "btn-success" : "btn-ghost border border-base-300"}`}
                          onClick={() => setOtoLeg("tp")}
                        >
                          Take Profit
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm flex-1 ${otoLeg === "sl" ? "btn-error" : "btn-ghost border border-base-300"}`}
                          onClick={() => setOtoLeg("sl")}
                        >
                          Stop Loss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Take Profit — always shown for bracket/OCO, conditional for OTO */}
                  {(orderClass !== "oto" || otoLeg === "tp") && (
                    <div className="form-control w-full mb-3">
                      <label className="label py-0">
                        <span className="label-text font-medium text-success">
                          Take Profit (Limit)
                        </span>
                        <span className="label-text-alt text-xs text-base-content/40">
                          {side === "buy" ? "Above entry" : "Below entry"}
                        </span>
                      </label>
                      <input
                        type="number"
                        className="input input-bordered w-full border-success/30 focus:border-success"
                        placeholder="0.00"
                        value={tpLimitPrice}
                        step="0.01"
                        min="0"
                        onChange={(e) => setTpLimitPrice(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Stop Loss — always shown for bracket/OCO, conditional for OTO */}
                  {(orderClass !== "oto" || otoLeg === "sl") && (
                    <div className="form-control w-full mb-2">
                      <label className="label py-0">
                        <span className="label-text font-medium text-error">
                          Stop Loss (Stop Price)
                        </span>
                        <span className="label-text-alt text-xs text-base-content/40">
                          {side === "buy" ? "Below entry" : "Above entry"}
                        </span>
                      </label>
                      <input
                        type="number"
                        className="input input-bordered w-full border-error/30 focus:border-error"
                        placeholder="0.00"
                        value={slStopPrice}
                        step="0.01"
                        min="0"
                        onChange={(e) => setSlStopPrice(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Optional: Stop Loss Limit Price (stop-limit SL) — only when SL is visible */}
                  {(orderClass !== "oto" || otoLeg === "sl") && (
                    <div className="collapse collapse-arrow mb-2">
                      <input type="checkbox" className="min-h-0 py-0" />
                      <div className="collapse-title text-xs text-base-content/50 py-1 min-h-0 flex items-center gap-1">
                        <span>Stop-Loss Limit Price (optional)</span>
                      </div>
                      <div className="collapse-content">
                        <div className="form-control w-full pt-2">
                          <input
                            type="number"
                            className="input input-bordered input-sm w-full"
                            placeholder="Limit price for SL (stop-limit)"
                            value={slLimitPrice}
                            step="0.01"
                            min="0"
                            onChange={(e) => setSlLimitPrice(e.target.value)}
                          />
                          <p className="text-[10px] text-base-content/40 mt-1">
                            If set, the SL becomes a stop-limit order instead of a stop-market order.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Risk/Reward summary */}
                  {entryPx > 0 && slPx > 0 && tpPx > 0 && (
                    <div className="bg-base-300/60 rounded-lg p-3 mt-2">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-base-content/50">Risk</div>
                          <div className="font-mono font-bold text-error">
                            ${riskAmt.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-base-content/50">Reward</div>
                          <div className="font-mono font-bold text-success">
                            ${rewardAmt.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-base-content/50">R:R Ratio</div>
                          <div className="font-mono font-bold text-primary">
                            {rrRatio}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Time in Force — filtered by asset class */}
              <div className="form-control w-full mb-4">
                <label className="label">
                  <span className="label-text font-medium">Time in Force</span>
                  <span className="label-text-alt text-base-content/40 text-xs">
                    {category === "crypto" ? "Crypto" : "Equity"} options
                  </span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={timeInForce}
                  onChange={(e) => setTimeInForce(e.target.value)}
                >
                  {allowedTIF.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {error && (
                <div className="alert alert-error mb-3 text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="modal-action flex-col sm:flex-row gap-2">
                <button
                  className="btn btn-ghost w-full sm:w-auto order-2 sm:order-1"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className={`btn ${side === "buy" ? "btn-success" : "btn-error"} w-full sm:w-auto order-1 sm:order-2`}
                  onClick={() => {
                    if (!canTrade) {
                      const msg = tradeabilityReason || `${symbol} is not available for trading on Alpaca`;
                      setError(msg);
                      notifyWarning(msg);
                      return;
                    }
                    setConfirming(true);
                  }}
                  disabled={!canReview}
                >
                  Review Order
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Confirmation Step */}
              <div className="space-y-3 mb-4">
                <h4 className="font-semibold text-base">Confirm Order</h4>
                <div className="bg-base-200 rounded-lg p-4 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Symbol</span>
                    <span className="font-mono font-bold">{displaySymbol}</span>
                  </div>
                  {symbolConverted && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Original</span>
                      <span className="font-mono text-base-content/50">{symbol} → {alpacaSymbol}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Asset Class</span>
                    <span className="badge badge-sm badge-outline">{assetClass}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Side</span>
                    <span
                      className={`font-bold ${side === "buy" ? "text-success" : "text-error"}`}
                    >
                      {String(side).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Quantity</span>
                    <span className="font-medium">{qty}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Type</span>
                    <span className="font-medium">{orderTypeLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Order Class</span>
                    <span className={`badge badge-sm ${
                      orderClass === "bracket" ? "badge-accent" :
                      orderClass === "oco" ? "badge-secondary" :
                      orderClass === "oto" ? "badge-warning" :
                      "badge-ghost"
                    }`}>
                      {orderClassLabel}
                    </span>
                  </div>
                  {needsLimitPrice && limitPrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">
                        {isAdvanced ? "Entry Price" : "Limit Price"}
                      </span>
                      <span className="font-medium">${limitPrice}</span>
                    </div>
                  )}
                  {needsStopPrice && stopPrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Stop Price</span>
                      <span className="font-medium">${stopPrice}</span>
                    </div>
                  )}
                  {needsTrail && trailType === "price" && trailPrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Trail Price</span>
                      <span className="font-medium">${trailPrice}</span>
                    </div>
                  )}
                  {needsTrail && trailType === "percent" && trailPercent && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Trail Percent</span>
                      <span className="font-medium">{trailPercent}%</span>
                    </div>
                  )}

                  {/* TP / SL Confirmation */}
                  {isAdvanced && tpLimitPrice && (orderClass !== "oto" || otoLeg === "tp") && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60 text-success">Take Profit</span>
                      <span className="font-medium text-success">${tpLimitPrice}</span>
                    </div>
                  )}
                  {isAdvanced && slStopPrice && (orderClass !== "oto" || otoLeg === "sl") && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60 text-error">Stop Loss</span>
                      <span className="font-medium text-error">${slStopPrice}</span>
                    </div>
                  )}
                  {isAdvanced && slLimitPrice && (orderClass !== "oto" || otoLeg === "sl") && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60 text-error/70">SL Limit Price</span>
                      <span className="font-medium text-error/70">${slLimitPrice}</span>
                    </div>
                  )}
                  {orderClass === "oto" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Triggered Leg</span>
                      <span className={`badge badge-xs ${otoLeg === "tp" ? "badge-success" : "badge-error"}`}>
                        {otoLeg === "tp" ? "Take Profit" : "Stop Loss"}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Time in Force</span>
                    <span className="font-medium">{tifLabel}</span>
                  </div>

                  {/* Risk/Reward in confirmation — only show for bracket/OCO (OTO has single leg) */}
                  {(orderClass === "bracket" || orderClass === "oco") && riskAmt > 0 && (
                    <div className="border-t border-base-300 pt-2 mt-2">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-base-content/50">Risk</div>
                          <div className="font-mono font-bold text-error">${riskAmt.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-base-content/50">Reward</div>
                          <div className="font-mono font-bold text-success">${rewardAmt.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-base-content/50">R:R</div>
                          <div className="font-mono font-bold text-primary">{rrRatio}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Error on confirm */}
              {error && (
                <div className="alert alert-error mb-3 text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="modal-action flex-col sm:flex-row gap-2">
                <button
                  className="btn btn-ghost w-full sm:w-auto order-2 sm:order-1"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                >
                  Back
                </button>
                <button
                  className={`btn ${side === "buy" ? "btn-success" : "btn-error"} w-full sm:w-auto order-1 sm:order-2`}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Submitting...
                    </>
                  ) : (
                    `Confirm ${String(side).toUpperCase()}${orderClass !== "simple" ? ` (${orderClassLabel})` : ""}`
                  )}
                </button>
              </div>
            </>
          )}

          {/* Paper Trading Notice */}
          <div className="alert alert-warning mt-4 py-2">
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
            <span className="text-xs">
              Paper trading only — this uses the Alpaca paper trading API.
            </span>
          </div>

          {/* Extra close hint for mobile */}
          <p className="text-center text-xs text-base-content/40 mt-3">
            Press <kbd className="kbd kbd-xs">Esc</kbd> or click outside to
            close
          </p>
        </div>
      </dialog>
    </>
  );
}
