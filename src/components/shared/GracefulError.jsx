'use client'

/**
 * GracefulError — A polished, user-friendly error display component.
 *
 * Replaces raw red error banners that leak internal details like
 * "Missing SUPABASE_SERVICE_ROLE_KEY" with contextual, actionable messages.
 *
 * Usage:
 *   <GracefulError
 *     code="NO_KEYS"
 *     onAction={() => setShowSetup(true)}
 *   />
 *
 *   // Or with a raw error message (will be sanitized):
 *   <GracefulError
 *     message="Failed to fetch account: Missing SUPABASE_SERVICE_ROLE_KEY"
 *     onRetry={() => refetch()}
 *   />
 */

import { getErrorDisplay, sanitizeError, ErrorCodes } from '@/lib/error-messages';

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const Icons = {
  key: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  shield: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  wrench: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  lock: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  crown: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
    </svg>
  ),
  wifi: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  clock: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  hourglass: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M5 3h14M5 21h14M7 3v1.5c0 2.25 1.5 3.75 3 5.25C11.5 11.25 13 12.75 13 15v1.5c0 2.25-1.5 3.75-3 5.25" />
      <path d="M17 3v1.5c0 2.25-1.5 3.75-3 5.25C11.5 11.25 10 12.75 10 15v1.5c0 2.25 1.5 3.75 3 5.25" />
    </svg>
  ),
  alert: (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

// ── Action button labels ──────────────────────────────────────────────────────
const ACTION_LABELS = {
  setup_keys: 'Set Up Keys',
  reenter_keys: 'Update Keys',
  sign_in: 'Sign In',
  upgrade: 'Upgrade Plan',
  retry: 'Try Again',
};

export default function GracefulError({
  code,
  message,
  onAction,
  onRetry,
  compact = false,
  className = '',
}) {
  // Resolve the error code from either explicit code or a raw message
  let errorCode = code;
  let displayMessage = message;

  if (!errorCode && message) {
    // Sanitize the raw message to get a code + safe message
    const sanitized = sanitizeError(message, { logOriginal: false });
    errorCode = sanitized.code;
    displayMessage = sanitized.message;
  }

  const display = getErrorDisplay(errorCode);

  // If we have a sanitized message from the API, prefer it over the generic display description
  const description = displayMessage || display.description;
  const icon = Icons[display.icon] || Icons.alert;
  const actionType = display.action;

  // Determine the action handler
  const handleAction = () => {
    if (actionType === 'retry' && onRetry) return onRetry();
    if (onAction) return onAction();
    if (onRetry) return onRetry();
  };

  // Compact variant (for inline cards like OrderHistory/OpenPositions)
  if (compact) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <div className="flex justify-center mb-3 text-base-content/40">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-base-content/70 mb-1">
          {display.title}
        </h3>
        <p className="text-xs text-base-content/50 mb-3 max-w-xs mx-auto">
          {description}
        </p>
        {actionType && (
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost btn-outline gap-1"
            onClick={handleAction}
          >
            {ACTION_LABELS[actionType] || 'Retry'}
          </button>
        )}
      </div>
    );
  }

  // Full variant (for page-level errors like account banner)
  return (
    <div className={`card bg-base-200 border border-base-300 shadow-sm ${className}`}>
      <div className="card-body p-5 flex-row items-start gap-4">
        <div className="flex-shrink-0 text-warning mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base-content mb-1">
            {display.title}
          </h3>
          <p className="text-sm text-base-content/60">
            {description}
          </p>
          {actionType && (
            <button
              className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-primary btn-outline mt-3 gap-1"
              onClick={handleAction}
            >
              {ACTION_LABELS[actionType] || 'Try Again'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
