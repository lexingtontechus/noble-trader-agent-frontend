"use client";

/**
 * InfoTip — a reusable inline tooltip that shows helpful context on hover.
 * Uses DaisyUI's `tooltip` + `tooltip-bottom` by default.
 *
 * Usage:
 *   <InfoTip tip="Value at Risk at 95% confidence" />
 *   <InfoTip tip="Maximum expected daily loss" position="right">
 *     <span className="font-bold">{varValue}</span>
 *   </InfoTip>
 *
 * Props:
 *   tip      — (required) tooltip text
 *   position — "top" | "bottom" | "left" | "right" (default: "top")
 *   children — optional; if provided, wraps them. Otherwise renders a default ℹ icon.
 *   className— optional extra classes on the wrapper
 */
export default function InfoTip({ tip, position = "top", children, className = "" }) {
  if (!tip) return children || null;

  const posClass = `tooltip-${position}`;

  return (
    <span
      className={`tooltip ${posClass} ${className}`}
      data-tip={tip}
    >
      {children || (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5 text-base-content/30 hover:text-base-content/60 transition-colors cursor-help inline-block ml-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
    </span>
  );
}
