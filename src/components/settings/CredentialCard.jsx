"use client";

import { useState } from "react";

/**
 * CredentialCard — Manages Alpaca API keys for a single credential type (paper/live).
 *
 * Features:
 * - Key entry with show/hide toggle
 * - Test connection (validates against Alpaca API)
 * - Replace keys
 * - Remove keys
 * - Security notice about encryption
 * - Danger zone styling for live accounts
 */
export default function CredentialCard({
  type,
  status,
  onStatusChange,
  alpacaBaseUrl,
  alpacaSignUpUrl,
  description,
  dangerZone = false,
}) {
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState(null);

  const isConfigured = status?.configured;
  const isValid = status?.isValid;
  const label = type === "paper" ? "Paper Trading" : "Live Trading";
  const labelIcon = type === "paper" ? "📝" : "🔴";

  const handleSave = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      setError("Both API Key and Secret Key are required");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/credentials/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), secretKey: secretKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save keys");
      }

      setSuccess("Keys saved successfully!");
      setApiKey("");
      setSecretKey("");
      onStatusChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const res = await fetch(`/api/credentials/${type}`, { method: "PUT" });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ valid: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm(`Are you sure you want to remove your ${label} Alpaca keys?`)) return;

    setRemoving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/credentials/${type}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove keys");
      }

      setSuccess("Keys removed successfully!");
      onStatusChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  };

  // Shared eye icon SVGs
  const EyeOpen = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );
  const EyeClosed = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  );

  const KeyInput = ({ label, placeholder, value, onChange, show, onToggle }) => (
    <div className="form-control w-full mb-3">
      <label className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <div className="join w-full">
        <input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          className="input input-bordered join-item flex-1"
          value={value}
          onChange={onChange}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <button
          type="button"
          className="btn btn-bordered join-item"
          onClick={onToggle}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
        >
          {show ? <EyeClosed /> : <EyeOpen />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className={`card shadow ${dangerZone ? "bg-error/5 border border-error/20" : "bg-base-200"}`}>
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{labelIcon}</span>
              <div>
                <h3 className="card-title text-lg">{label} Account</h3>
                <p className="text-sm text-base-content/60 mt-1">{description}</p>
              </div>
            </div>
            <div className="text-right">
              {isConfigured ? (
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge badge-sm ${isValid ? "badge-success" : isValid === false ? "badge-error" : "badge-warning"}`}>
                    {isValid ? "Connected" : isValid === false ? "Invalid Keys" : "Unknown"}
                  </span>
                  <button
                    className={`btn btn-xs btn-outline min-h-[44px] sm:min-h-0 sm:btn-xs ${testing ? "btn-disabled" : ""}`}
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? (
                      <><span className="loading loading-spinner loading-xs"></span> Testing</>
                    ) : (
                      "Test Connection"
                    )}
                  </button>
                </div>
              ) : (
                <span className="badge badge-ghost badge-sm">Not Configured</span>
              )}
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`alert ${testResult.valid ? "alert-success" : "alert-error"} mt-3`}>
              <span className="text-sm">
                {testResult.valid
                  ? "Connection successful! Your keys are valid."
                  : `Connection failed: ${testResult.error || "Invalid keys"}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Security Notice */}
      <div className="alert alert-info">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-xs">
          Your keys are encrypted to ensure safety and security. They are never exposed to the browser — only a configured/invalid status is returned.
        </span>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="alert alert-error">
          <span className="text-sm">{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Key Entry / Replace */}
      <div className={`card shadow ${dangerZone ? "bg-error/5 border border-error/20" : "bg-base-200"}`}>
        <div className="card-body">
          <h4 className="font-medium text-sm">
            {isConfigured ? "Replace Keys" : "Enter Your Alpaca API Keys"}
          </h4>

          <KeyInput
            label="API Key"
            placeholder="PK..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            show={showApiKey}
            onToggle={() => setShowApiKey(!showApiKey)}
          />

          <KeyInput
            label="Secret Key"
            placeholder="Your secret key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            show={showSecretKey}
            onToggle={() => setShowSecretKey(!showSecretKey)}
          />

          <button
            className={`btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm ${saving ? "btn-disabled" : ""}`}
            onClick={handleSave}
            disabled={saving || !apiKey.trim() || !secretKey.trim()}
          >
            {saving ? (
              <><span className="loading loading-spinner loading-xs"></span> Saving...</>
            ) : (
              isConfigured ? "Update Keys" : "Save Keys"
            )}
          </button>

          {!isConfigured && (
            <div className="mt-3 text-center">
              <p className="text-xs text-base-content/50">
                Don&apos;t have an Alpaca account?{" "}
                <a href={alpacaSignUpUrl} target="_blank" rel="noopener noreferrer" className="link link-primary link-hover">
                  Sign up for {type} trading
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Remove Keys */}
      {isConfigured && (
        <div className={`card shadow ${dangerZone ? "bg-error/10 border border-error/20" : "bg-base-200"}`}>
          <div className="card-body">
            <h4 className="font-medium text-sm text-error">Remove Keys</h4>
            <p className="text-xs text-base-content/50 mb-2">
              Remove your {label} Alpaca keys to disconnect your trading account.
            </p>
            <button
              className={`btn btn-error btn-outline min-h-[44px] sm:min-h-0 sm:btn-sm ${removing ? "btn-disabled" : ""}`}
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? (
                <><span className="loading loading-spinner loading-xs"></span> Removing...</>
              ) : (
                "Remove Keys"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
