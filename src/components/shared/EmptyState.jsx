'use client'

export default function EmptyState({ title, description, icon, action }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="card bg-base-200 shadow-sm max-w-md w-full">
        <div className="card-body items-center text-center">
          {icon && (
            <div className="text-5xl mb-2">{icon}</div>
          )}
          <h3 className="card-title text-base-content/70">
            {title || 'Nothing here yet'}
          </h3>
          {description && (
            <p className="text-sm text-base-content/50">{description}</p>
          )}
          {action && (
            <div className="card-actions mt-4">
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
