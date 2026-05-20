"use client";

import { useState } from "react";
import { PLANS, PLAN_HIERARCHY } from "@/lib/plans";

/**
 * PlanCard — Displays plan options and current subscription status.
 * Handles plan upgrades via Helio payment integration (coming soon).
 * For now, includes a manual "Request Upgrade" flow for admin approval.
 */
export default function PlanCard({ currentPlan, onPlanChange }) {
  const [requesting, setRequesting] = useState(null);
  const [requestResult, setRequestResult] = useState(null);

  const plans = Object.values(PLANS);
  const currentLevel = PLAN_HIERARCHY[currentPlan] ?? 0;

  const handleRequestUpgrade = async (planKey) => {
    setRequesting(planKey);
    setRequestResult(null);

    try {
      // TODO: Replace with Helio SDK payment flow
      // For now, send a request that admin can approve
      const res = await fetch("/api/subscription/request-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });

      if (res.ok) {
        setRequestResult({ plan: planKey, success: true, message: "Upgrade request submitted! An admin will review your request." });
      } else {
        const data = await res.json().catch(() => ({}));
        // If the endpoint doesn't exist yet, show a friendly message
        setRequestResult({ plan: planKey, success: true, message: "Payment integration coming soon! Contact admin@nobletrader.io to upgrade." });
      }
    } catch {
      setRequestResult({ plan: planKey, success: true, message: "Payment integration coming soon! Contact admin@nobletrader.io to upgrade." });
    } finally {
      setRequesting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title text-lg">Current Plan</h3>
              <p className="text-sm text-base-content/60 mt-1">
                Your subscription determines which features you can access
              </p>
            </div>
            <span className={`badge badge-lg ${
              currentPlan === "institutional" ? "badge-secondary" :
              currentPlan === "premium" ? "badge-warning" :
              "badge-ghost"
            }`}>
              {PLANS[currentPlan]?.name || "Free"}
            </span>
          </div>
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrentPlan = plan.key === currentPlan;
          const isUpgrade = PLAN_HIERARCHY[plan.key] > currentLevel;
          const isDowngrade = PLAN_HIERARCHY[plan.key] < currentLevel;

          return (
            <div
              key={plan.key}
              className={`card shadow transition-all ${
                isCurrentPlan
                  ? "bg-primary text-primary-content ring-2 ring-primary"
                  : plan.key === "premium"
                    ? "bg-base-200 ring-1 ring-warning/50 hover:ring-warning"
                    : "bg-base-200 hover:ring-1 hover:ring-base-300"
              }`}
            >
              <div className="card-body p-5">
                {/* Plan name & price */}
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  {plan.key === "premium" && !isCurrentPlan && (
                    <span className="badge badge-warning badge-xs">POPULAR</span>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{plan.priceLabel}</span>
                </div>
                <p className="text-sm opacity-70 mt-1">{plan.description}</p>

                {/* Features */}
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    {plan.features.paperTrading ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Paper Trading
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.liveTrading ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Live Trading
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">&#10003;</span>
                    {plan.limits.backtestsPerDay === Infinity
                      ? "Unlimited Backtests"
                      : `${plan.limits.backtestsPerDay} Backtests/day`}
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.regimeDetection ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Regime Detection
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.portfolioOptimization ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Portfolio Optimization
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.realTimePL ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Real-Time P&L
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.apiAccess ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    API Access
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.multiTenant ? (
                      <span className="text-success">&#10003;</span>
                    ) : (
                      <span className="text-base-content/30">&#10005;</span>
                    )}
                    Multi-Tenant (Orgs)
                  </li>
                </ul>

                {/* Action Button */}
                <div className="card-actions mt-4">
                  {isCurrentPlan ? (
                    <button className="btn btn-sm btn-disabled w-full" disabled>
                      Current Plan
                    </button>
                  ) : isUpgrade ? (
                    <button
                      className={`btn btn-sm w-full ${
                        plan.key === "premium" ? "btn-warning" :
                        plan.key === "institutional" ? "btn-secondary" :
                        "btn-primary"
                      } ${requesting === plan.key ? "btn-disabled" : ""}`}
                      onClick={() => handleRequestUpgrade(plan.key)}
                      disabled={requesting === plan.key}
                    >
                      {requesting === plan.key ? (
                        <><span className="loading loading-spinner loading-xs"></span> Processing...</>
                      ) : (
                        plan.price ? `Upgrade — ${plan.priceLabel}` : "Contact Sales"
                      )}
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-ghost w-full" disabled>
                      Downgrade
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upgrade Request Result */}
      {requestResult && (
        <div className="alert alert-info">
          <span className="text-sm">{requestResult.message}</span>
        </div>
      )}

      {/* Helio Payment — Coming Soon Notice */}
      {currentPlan === "free" && (
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="font-medium text-sm">Payment Integration</h3>
            <p className="text-xs text-base-content/60 mt-1">
              We use Helio for crypto-based subscription payments. Full self-serve upgrades
              are coming soon. In the meantime, contact{" "}
              <a href="mailto:admin@nobletrader.io" className="link link-primary">
                admin@nobletrader.io
              </a>{" "}
              to upgrade your plan manually.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
