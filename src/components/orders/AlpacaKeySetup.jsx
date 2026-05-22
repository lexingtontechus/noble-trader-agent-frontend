'use client'

import { useState } from 'react';

/**
 * AlpacaKeySetup — Manages Alpaca paper trading API keys.
 *
 * Now uses the unified credential system (/api/credentials/paper)
 * which stores keys encrypted in Supabase with Clerk privateMetadata fallback.
 */
export default function AlpacaKeySetup({ onConfigured, onRemoved, isManaging = false }) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      setError('Both API Key and Secret Key are required');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/credentials/paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), secretKey: secretKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save keys');
      }

      setSuccess('Keys saved successfully!');
      setApiKey('');
      setSecretKey('');
      onConfigured?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/credentials/paper', {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove keys');
      }

      setSuccess('Keys removed successfully!');
      onRemoved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  };

  // Shared eye icon components
  const EyeOpen = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );
  const EyeClosed = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  );

  // Shared key input field
  const KeyInput = ({ label, placeholder, value, onChange, show, onToggle }) => (
    <div className="form-control w-full mb-3">
      <label className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <div className="join w-full">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          className="input input-bordered join-item flex-1"
          value={value}
          onChange={onChange}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
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

  // When managing existing keys, render as a collapsible card
  if (isManaging) {
    return (
      <div className="card bg-base-200 shadow">
        <div className="card-body p-4">
          <h3 className="card-title text-lg text-primary">Paper Trading Keys</h3>

          <div className="alert alert-info mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs">Your keys are encrypted to ensure safety and security. They are stored server-side and never reach the browser.</span>
          </div>

          {error && (
            <div className="alert alert-error mb-3">
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success mb-3">
              <span className="text-sm">{success}</span>
            </div>
          )}

          <div className="divider text-xs text-base-content/50 mt-0 mb-2">Replace Keys</div>

          <KeyInput
            label="New API Key"
            placeholder="PK..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            show={showApiKey}
            onToggle={() => setShowApiKey(!showApiKey)}
          />

          <KeyInput
            label="New Secret Key"
            placeholder="Your secret key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            show={showSecretKey}
            onToggle={() => setShowSecretKey(!showSecretKey)}
          />

          <div className="flex gap-2 mt-2">
            <button
              className={`btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm ${saving ? 'btn-disabled' : ''}`}
              onClick={handleSave}
              disabled={saving || !apiKey.trim() || !secretKey.trim()}
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Saving...
                </>
              ) : (
                'Update Keys'
              )}
            </button>
          </div>

          <div className="divider text-xs text-base-content/50 mt-4 mb-2">Remove Keys</div>
          <p className="text-xs text-base-content/50 mb-2">
            Remove your Alpaca keys to disconnect your trading account.
          </p>
          <button
            className={`btn btn-error btn-outline min-h-[44px] sm:min-h-0 sm:btn-sm ${removing ? 'btn-disabled' : ''}`}
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Removing...
              </>
            ) : (
              'Remove Keys'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Initial setup — rendered as a card (NOT a dialog) to avoid DaisyUI v5 modal issues
  return (
    <div className="card bg-base-200 shadow-lg max-w-lg mx-auto">
      <div className="card-body p-6">
        <h3 className="card-title text-lg text-primary mb-1">Connect Your Alpaca Account</h3>
        <p className="text-sm text-base-content/60 mb-4">
          Enter your Alpaca paper trading API keys to view orders and positions.
        </p>

        {/* Security Notice */}
        <div className="alert alert-info mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-xs">Your keys are encrypted to ensure safety and security. They are stored server-side and never reach the browser directly.</span>
        </div>

        {/* API Key Field */}
        <KeyInput
          label="API Key"
          placeholder="PK..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          show={showApiKey}
          onToggle={() => setShowApiKey(!showApiKey)}
        />

        {/* Secret Key Field */}
        <KeyInput
          label="Secret Key"
          placeholder="Your secret key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          show={showSecretKey}
          onToggle={() => setShowSecretKey(!showSecretKey)}
        />

        {/* Error */}
        {error && (
          <div className="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Save Button */}
        <button
          className={`btn btn-primary w-full ${saving ? 'btn-disabled' : ''}`}
          onClick={handleSave}
          disabled={saving || !apiKey.trim() || !secretKey.trim()}
        >
          {saving ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Connecting...
            </>
          ) : (
            'Connect Paper Account'
          )}
        </button>

        {/* Alpaca Sign Up Link */}
        <div className="mt-4 text-center">
          <p className="text-xs text-base-content/50">
            Don&apos;t have an Alpaca account?{' '}
            <a
              href="https://app.alpaca.markets/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary link-hover"
            >
              Sign up for paper trading
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
