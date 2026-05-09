'use client'

export default function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="alert alert-error">
      <span className="text-lg">✕</span>
      <div className="flex-1">
        <h3 className="font-bold">Something went wrong</h3>
        <div className="text-xs">{message || 'An unexpected error occurred. Please try again.'}</div>
      </div>
      {onRetry && (
        <button className="btn btn-sm btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
