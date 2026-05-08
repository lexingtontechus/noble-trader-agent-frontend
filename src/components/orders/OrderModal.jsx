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

/**
 * Map our getAssetClass() result to the Alpaca trading category.
 * "stock" and "unknown" → equity rules
 * "crypto"              → crypto rules
 * Forex / futures / indices are blocked entirely (not supported by Alpaca).
 */
function getAlpacaAssetCategory(assetClass) {
  if (assetClass === "crypto") return "crypto";
  // Forex is NOT supported by Alpaca — will be caught by isAlpacaTradable()
  return "equity"; // stock, unknown → equity
}

/* ─────────────────────────────────────────────────────────────── */

export default function OrderModal({ symbol, onClose, onSuccess }) {
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState(100);
  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailPrice, setTrailPrice] = useState("");
  const [trailPercent, setTrailPercent] = useState("");
  const [trailType, setTrailType] = useState("price"); // "price" | "percent"
  const [timeInForce, setTimeInForce] = useState("day");
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
  // value is not valid for the new category (e.g. switching from
  // equity "day" to crypto which doesn't support "day").
  useEffect(() => {
    const typeValues = allowedTypes.map((t) => t.value);
    if (!typeValues.includes(orderType)) {
      setOrderType("market");
    }
  }, [category, allowedTypes]);

  useEffect(() => {
    const tifValues = allowedTIF.map((t) => t.value);
    if (!tifValues.includes(timeInForce)) {
      setTimeInForce(tifValues[0]?.value || "gtc");
    }
  }, [category, allowedTIF]);

  // Which extra fields are needed for the current order type?
  const needsLimitPrice  = orderType === "limit" || orderType === "stop_limit";
  const needsStopPrice   = orderType === "stop" || orderType === "stop_limit";
  const needsTrail       = orderType === "trailing_stop";

  // Human-readable label for the current order type
  const orderTypeLabel =
    allowedTypes.find((t) => t.value === orderType)?.label || orderType;
  const tifLabel =
    allowedTIF.find((t) => t.value === timeInForce)?.label || timeInForce;

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
    if (needsLimitPrice && !limitPrice) return false;
    if (needsStopPrice && !stopPrice) return false;
    if (needsTrail && trailType === "price" && !trailPrice) return false;
    if (needsTrail && trailType === "percent" && !trailPercent) return false;
    return true;
  }, [canTrade, orderType, limitPrice, stopPrice, trailType, trailPrice, trailPercent, needsLimitPrice, needsStopPrice, needsTrail]);

  const handleSubmit = async () => {
    // Block submission for non-tradable assets
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
        symbol: alpacaSymbol, // Always send the Alpaca-compatible symbol
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

      const res = await fetch("/api/alpaca/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      setToast(`${side.toUpperCase()} ${qty} ${displaySymbol} order submitted!`);
      notifySuccess(`${side.toUpperCase()} ${qty} ${displaySymbol} order submitted!`);
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

  return (
    <>
      <dialog className="modal modal-open modal-top" ref={modalRef}>
        {/* Backdrop */}
        <div
          className="modal-backdrop bg-black/60"
          onClick={handleBackdropClick}
        ></div>

        <div className="modal-box max-w-2xl p-8 bg-base-300 w-full">
          {/* Close button */}
          <button
            className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 hover:bg-base-300"
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
              {category === "crypto" ? "₿ Crypto" :
               "📈 Equity"}
            </span>
            {symbolConverted && (
              <span className="badge badge-sm badge-info">
                {symbol} → {alpacaSymbol}
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

              {/* Order Type — filtered by asset class */}
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
                >
                  {allowedTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Limit Price — shown for limit & stop_limit */}
              {needsLimitPrice && (
                <div className="form-control w-full mb-3">
                  <label className="label">
                    <span className="label-text font-medium">Limit Price</span>
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

              {/* Stop Price — shown for stop & stop_limit */}
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

              {/* Trailing Stop — trail price or trail percent */}
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
                      {side.toUpperCase()}
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
                  {needsLimitPrice && limitPrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Limit Price</span>
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
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Time in Force</span>
                    <span className="font-medium">{tifLabel}</span>
                  </div>
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
                    `Confirm ${side.toUpperCase()}`
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
