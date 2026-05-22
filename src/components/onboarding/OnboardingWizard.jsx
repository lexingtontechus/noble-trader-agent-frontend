"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { usePlan } from "@/hooks/usePlan";
import { PLANS } from "@/lib/plans";
import PlanGate from "@/components/shared/PlanGate";

/**
 * OnboardingWizard — 3-step guided setup for new users.
 *
 * Step 0: Welcome + Platform Overview
 * Step 1: Connect Paper Account (Alpaca paper keys)
 * Step 2: (Optional) Upgrade to Live (Premium CTA)
 *
 * After completion, sets onboarding_complete=true and navigates to dashboard.
 */
export default function OnboardingWizard({ onComplete }) {
  const { user, isLoaded: userLoaded } = useUser();
  const { canUseLive, plan, planDetails, isLoaded: planLoaded } = usePlan();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);

  const STEPS = [
    { key: "welcome", label: "Welcome", icon: "👋" },
    { key: "paper", label: "Paper Account", icon: "📝" },
    { key: "live", label: "Go Live", icon: "🚀" },
  ];

  // Save paper keys
  const handleSavePaperKeys = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      setError("Both API Key and Secret Key are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/credentials/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), secretKey: secretKey.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save keys");

      // Update onboarding progress
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_step: 2,
          paper_keys_configured: true,
        }),
      });

      setApiKey("");
      setSecretKey("");
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Skip paper keys
  const handleSkipPaper = async () => {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_step: 2 }),
    });
    setStep(2);
  };

  // Complete onboarding
  const handleComplete = async () => {
    setCompleting(true);
    try {
      await fetch("/api/onboarding", { method: "PUT" });
      onComplete?.();
    } catch {
      // Still proceed even if API fails
      onComplete?.();
    } finally {
      setCompleting(false);
    }
  };

  if (!userLoaded || !planLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-2xl bg-base-100 shadow-2xl">
        <div className="card-body p-8">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  className={`btn btn-circle min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:btn-sm ${
                    i === step
                      ? "btn-primary"
                      : i < step
                        ? "btn-success"
                        : "btn-ghost"
                  }`}
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                >
                  {i < step ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <span className="text-xs">{i + 1}</span>
                  )}
                </button>
                <span className={`text-xs hidden sm:inline ${i === step ? "font-bold text-primary" : "text-base-content/50"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? "bg-success" : "bg-base-300"}`}></div>
                )}
              </div>
            ))}
          </div>

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="text-6xl">👋</div>
              <h1 className="text-3xl font-bold text-primary">
                Welcome to Noble Trader
              </h1>
              <p className="text-base-content/70 max-w-md mx-auto">
                Your institutional-grade regime risk management platform. Here&apos;s what you can do:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="card bg-base-200 shadow-sm">
                  <div className="card-body items-center text-center p-4">
                    <span className="text-3xl mb-2">📊</span>
                    <h3 className="font-bold text-sm">Regime Detection</h3>
                    <p className="text-xs text-base-content/60">HMM-powered market regime identification</p>
                  </div>
                </div>
                <div className="card bg-base-200 shadow-sm">
                  <div className="card-body items-center text-center p-4">
                    <span className="text-3xl mb-2">🎲</span>
                    <h3 className="font-bold text-sm">Backtesting</h3>
                    <p className="text-xs text-base-content/60">Walk-forward and Monte Carlo simulation</p>
                  </div>
                </div>
                <div className="card bg-base-200 shadow-sm">
                  <div className="card-body items-center text-center p-4">
                    <span className="text-3xl mb-2">📋</span>
                    <h3 className="font-bold text-sm">Paper Trading</h3>
                    <p className="text-xs text-base-content/60">Risk-free strategy execution via Alpaca</p>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-wide mt-4"
                onClick={() => setStep(1)}
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 1: Connect Paper Account */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <span className="text-4xl">📝</span>
                <h2 className="text-xl font-bold text-primary mt-2">
                  Connect Your Paper Trading Account
                </h2>
                <p className="text-sm text-base-content/60 mt-1">
                  Enter your Alpaca paper trading API keys to start placing trades with simulated capital.
                </p>
              </div>

              <div className="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-xs">
                  Your keys are encrypted to ensure safety and security. They are never exposed to the browser — only a configured/invalid status is returned.
                </span>
              </div>

              {error && (
                <div className="alert alert-error">
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* API Key Input */}
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">API Key</span></label>
                <div className="join w-full">
                  <input
                    type={showApiKey ? "text" : "password"}
                    placeholder="PK..."
                    className="input input-bordered join-item flex-1"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSavePaperKeys()}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-bordered join-item"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Secret Key Input */}
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">Secret Key</span></label>
                <div className="join w-full">
                  <input
                    type={showSecretKey ? "text" : "password"}
                    placeholder="Your secret key"
                    className="input input-bordered join-item flex-1"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSavePaperKeys()}
                  />
                  <button
                    type="button"
                    className="btn btn-bordered join-item"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  className={`btn btn-primary flex-1 ${saving ? "btn-disabled" : ""}`}
                  onClick={handleSavePaperKeys}
                  disabled={saving || !apiKey.trim() || !secretKey.trim()}
                >
                  {saving ? (
                    <><span className="loading loading-spinner loading-sm"></span> Connecting...</>
                  ) : (
                    "Connect Paper Account"
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleSkipPaper}
                >
                  Skip for Now
                </button>
              </div>

              <div className="text-center mt-3">
                <p className="text-xs text-base-content/50">
                  Don&apos;t have an Alpaca account?{" "}
                  <a href="https://app.alpaca.markets/signup" target="_blank" rel="noopener noreferrer" className="link link-primary">
                    Sign up for free paper trading
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Go Live (Premium CTA) */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <span className="text-4xl">🚀</span>
                <h2 className="text-xl font-bold text-primary mt-2">
                  Ready to Go Live?
                </h2>
                <p className="text-sm text-base-content/60 mt-1">
                  {canUseLive
                    ? "Your Premium plan unlocks live trading. Connect a live Alpaca account to trade with real capital."
                    : "Upgrade to Premium to trade with real capital and unlock advanced features."}
                </p>
              </div>

              {canUseLive ? (
                /* Premium user — offer live key setup */
                <div className="card bg-warning/10 border border-warning/30">
                  <div className="card-body items-center text-center p-4">
                    <span className="badge badge-warning badge-lg mb-2">PREMIUM</span>
                    <p className="text-sm">
                      You can connect a live Alpaca account from the Settings page at any time.
                    </p>
                    <button
                      className="btn btn-warning min-h-[44px] sm:min-h-0 sm:btn-sm mt-2"
                      onClick={() => {
                        handleComplete();
                        window.dispatchEvent(
                          new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "live" } })
                        );
                      }}
                    >
                      Set Up Live Account
                    </button>
                  </div>
                </div>
              ) : (
                /* Free user — upgrade CTA */
                <div className="space-y-4">
                  {/* Feature comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="card bg-base-200 shadow-sm">
                      <div className="card-body p-4">
                        <h3 className="font-bold text-sm">Free Plan</h3>
                        <ul className="text-xs space-y-1 mt-2 text-base-content/60">
                          <li>Paper trading only</li>
                          <li>5 backtests/day</li>
                          <li>Basic regime detection</li>
                          <li>No real-time P&L</li>
                        </ul>
                      </div>
                    </div>
                    <div className="card bg-warning/10 border border-warning/30 shadow-sm">
                      <div className="card-body p-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm">Premium — $49/mo</h3>
                          <span className="badge badge-warning badge-xs">RECOMMENDED</span>
                        </div>
                        <ul className="text-xs space-y-1 mt-2 text-success">
                          <li>Live + Paper trading</li>
                          <li>Unlimited backtests</li>
                          <li>Real-time P&L dashboard</li>
                          <li>Portfolio optimization</li>
                          <li>Priority execution</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-warning btn-wide"
                    onClick={() => {
                      handleComplete();
                      window.dispatchEvent(
                        new CustomEvent("noble:navigate", { detail: { view: "settings", tab: "plan" } })
                      );
                    }}
                  >
                    Upgrade to Premium
                  </button>
                </div>
              )}

              <div className="text-center">
                <button
                  className={`btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-sm ${completing ? "btn-disabled" : ""}`}
                  onClick={handleComplete}
                  disabled={completing}
                >
                  {completing ? (
                    <><span className="loading loading-spinner loading-xs"></span> Setting up...</>
                  ) : (
                    "Skip — Go to Dashboard"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
