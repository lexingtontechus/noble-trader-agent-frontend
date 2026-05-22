'use client'

import GracefulError from '@/components/shared/GracefulError';

export default function OrderHistory({ orders, loading, error, onRetry, onSetupKeys }) {
  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const fmtPrice = (val) => {
    if (val == null) return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const sideBadge = (side) => {
    if (!side || typeof side !== 'string') return null;
    const cls = String(side).toLowerCase() === 'buy' ? 'badge-success' : 'badge-error';
    return <span className={`badge badge-sm ${cls}`}>{String(side).toUpperCase()}</span>;
  };

  const statusBadge = (status) => {
    if (!status) return null;
    const map = {
      filled: 'badge-success',
      partially_filled: 'badge-warning',
      pending_new: 'badge-info',
      new: 'badge-info',
      accepted: 'badge-info',
      done_for_day: 'badge-ghost',
      canceled: 'badge-ghost',
      cancelled: 'badge-ghost',
      expired: 'badge-ghost',
      rejected: 'badge-error',
      replaced: 'badge-info',
    };
    const cls = map[status] || 'badge-ghost';
    return <span className={`badge badge-sm ${cls}`}>{status.replace(/_/g, ' ')}</span>;
  };

  if (loading) {
    return (
      <div className="card bg-base-200 shadow">
        <div className="card-body p-4">
          <h2 className="card-title text-lg mb-3">Order History</h2>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-4 w-24"></div>
                <div className="skeleton h-4 w-12"></div>
                <div className="skeleton h-4 w-10"></div>
                <div className="skeleton h-4 w-10"></div>
                <div className="skeleton h-4 w-10"></div>
                <div className="skeleton h-4 w-16"></div>
                <div className="skeleton h-4 w-16"></div>
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
        <h2 className="card-title text-lg mb-3">Order History</h2>

        {error ? (
          <GracefulError
            code={error.code}
            message={error.message}
            compact
            onAction={onSetupKeys}
            onRetry={onRetry}
          />
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-40">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p className="text-sm">No orders found for this period</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block max-h-96 overflow-y-auto">
              <table className="table table-zebra table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Filled Price</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={order.id || idx}>
                      <td className="text-xs whitespace-nowrap">{formatDate(order.submitted_at || order.created_at)}</td>
                      <td className="font-medium">{order.symbol}</td>
                      <td>{sideBadge(order.side)}</td>
                      <td className="text-xs uppercase">{order.type}</td>
                      <td>{order.qty || order.filled_qty || '—'}</td>
                      <td>{statusBadge(order.status)}</td>
                      <td>{fmtPrice(order.filled_avg_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
              {orders.map((order, idx) => (
                <div key={order.id || idx} className="bg-base-300/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">{order.symbol}</span>
                    <div className="flex items-center gap-1.5">
                      {sideBadge(order.side)}
                      {statusBadge(order.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span>{formatDate(order.submitted_at || order.created_at)}</span>
                    <span className="uppercase">{order.type}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-base-content/50">Qty: {order.qty || order.filled_qty || '—'}</span>
                    <span className="font-mono">{fmtPrice(order.filled_avg_price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
