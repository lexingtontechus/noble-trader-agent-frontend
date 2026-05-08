"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { notifySuccess, notifyError } from "@/lib/notifications";

export default function OrderModal({ symbol, onClose, onSuccess }) {
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState(100);
  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState("day");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const body = {
        symbol,
        qty: Number(qty),
        side,
        type: orderType,
        time_in_force: timeInForce,
      };

      if (orderType === "limit" && limitPrice) {
        body.limit_price = Number(limitPrice);
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

      setToast(`${side.toUpperCase()} ${qty} ${symbol} order submitted!`);
      notifySuccess(`${side.toUpperCase()} ${qty} ${symbol} order submitted!`);
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
    // Only close if clicking the backdrop itself, not its children
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      <dialog className="modal modal-open modal-top" ref={modalRef}>
        {/* Backdrop - clicking it closes the modal */}
        <div
          className="modal-backdrop bg-black/60"
          onClick={handleBackdropClick}
        ></div>

        <div className="modal-box max-w-2xl p-8 bg-base-300 w-full">
          {/* Close button - prominent X in top right */}
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
            {side === "buy" ? "Buy" : "Sell"} {symbol}
          </h3>
          <p className="text-sm text-base-content/60 mb-5">
            Place a paper trading order via Alpaca
          </p>

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
                  value={symbol}
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

              {/* Order Type */}
              <div className="form-control w-full mb-3">
                <label className="label">
                  <span className="label-text font-medium">Order Type</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </div>

              {/* Limit Price (conditional) */}
              {orderType === "limit" && (
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

              {/* Time in Force */}
              <div className="form-control w-full mb-4">
                <label className="label">
                  <span className="label-text font-medium">Time in Force</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={timeInForce}
                  onChange={(e) => setTimeInForce(e.target.value)}
                >
                  <option value="day">Day</option>
                  <option value="gtc">GTC (Good Till Cancelled)</option>
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

              {/* Action Buttons - responsive: stack on small screens */}
              <div className="modal-action flex-col sm:flex-row gap-2">
                <button
                  className="btn btn-ghost w-full sm:w-auto order-2 sm:order-1"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className={`btn ${side === "buy" ? "btn-success" : "btn-error"} w-full sm:w-auto order-1 sm:order-2`}
                  onClick={() => setConfirming(true)}
                  disabled={orderType === "limit" && !limitPrice}
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
                    <span className="font-mono font-bold">{symbol}</span>
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
                    <span className="font-medium uppercase">{orderType}</span>
                  </div>
                  {orderType === "limit" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-base-content/60">Limit Price</span>
                      <span className="font-medium">${limitPrice}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-base-content/60">Time in Force</span>
                    <span className="font-medium uppercase">{timeInForce}</span>
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

              {/* Submit Buttons - responsive: stack on small screens */}
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
