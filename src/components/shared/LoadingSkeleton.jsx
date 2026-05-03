'use client'

export default function LoadingSkeleton({ type = 'card', count = 1 }) {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  if (type === 'card') {
    return (
      <div className="grid gap-4">
        {skeletons.map((i) => (
          <div key={i} className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <div className="skeleton h-6 w-3/4 mb-2" />
              <div className="skeleton h-4 w-full mb-1" />
              <div className="skeleton h-4 w-5/6 mb-1" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {[1, 2, 3, 4, 5].map((col) => (
                <th key={col}>
                  <div className="skeleton h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((row) => (
              <tr key={row}>
                {[1, 2, 3, 4, 5].map((col) => (
                  <td key={col}>
                    <div className="skeleton h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <div className="grid gap-4">
        {skeletons.map((i) => (
          <div key={i} className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <div className="skeleton h-5 w-1/3 mb-4" />
              <div className="skeleton h-64 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: generic skeleton
  return (
    <div className="grid gap-4">
      {skeletons.map((i) => (
        <div key={i} className="skeleton h-32 w-full" />
      ))}
    </div>
  );
}
