"use client";

export default function OpenPositions({ positions, loading, error, onRetry }) {
  const fmt = (val) => {
    if (val == null) return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(num);
  };

  const fmtPnl = (val) => {
    if (val == null) return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "—";
    const prefix = num >= 0 ? "+" : "";
    return (
      prefix +
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(num)
    );
  };

  const fmtPct = (val) => {
    if (val == null) return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "—";
    const prefix = num >= 0 ? "+" : "";
    return `${prefix}${num.toFixed(2)}%`;
  };

  const pnlClass = (val) => {
    if (val == null) return "";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (num > 0) return "text-success";
    if (num < 0) return "text-error";
    return "";
  };

  if (loading) {
    return (
      <div className="card bg-base-200 shadow">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-3">Open Positions</h2>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-4 w-16"></div>
                <div className="skeleton h-4 w-8"></div>
                <div className="skeleton h-4 w-16"></div>
                <div className="skeleton h-4 w-16"></div>
                <div className="skeleton h-4 w-20"></div>
                <div className="skeleton h-4 w-20"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow">
      <div className="card-body p-4">
        <h2 className="card-title text-lg mb-3">Open Positions</h2>

        {error ? (
          <div className="text-center py-6">
            <div className="alert alert-error mb-3">
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
              <span className="text-sm">{error}</span>
            </div>
            {onRetry && (
              <button className="btn btn-sm btn-ghost" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : !positions || positions.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-2 opacity-40"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            <p className="text-sm">No open positions</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Qty</th>
                  <th>Avg Entry</th>
                  <th>Current</th>
                  <th>Market Value</th>
                  <th>Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, idx) => (
                  <tr key={pos.asset_id || pos.symbol || idx}>
                    <td className="font-medium">{pos.symbol}</td>
                    <td>{pos.qty}</td>
                    <td>{fmt(pos.avg_entry_price)}</td>
                    <td>{fmt(pos.current_price)}</td>
                    <td>{fmt(pos.market_value)}</td>
                    <td>
                      <div className={pnlClass(pos.unrealized_pl)}>
                        <span>{fmtPnl(pos.unrealized_pl)}</span>
                        {pos.unrealized_plpc != null && (
                          <span className="text-xs ml-1 opacity-70">
                            ({fmtPct(parseFloat(pos.unrealized_plpc) * 100)})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
