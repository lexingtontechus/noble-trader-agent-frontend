'use client'

import InfoTip from '@/components/shared/InfoTip'

export default function AccountSummary({ account }) {
  if (!account) return null;

  const fmt = (val) => {
    if (val == null) return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="card bg-base-200 shadow">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="card-title text-lg">Account Summary</h2>
          <div className="flex gap-2 items-center">
            {account.status && (
              <span className={`badge badge-sm ${account.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                {account.status}
              </span>
            )}
            {account.pattern_day_trader && (
              <InfoTip tip="Pattern Day Trader — 4+ day trades in 5 business days; $25K minimum equity required">
                <span className="badge badge-sm badge-error">PDT</span>
              </InfoTip>
            )}
            {account.trade_suspended_by_user && (
              <span className="badge badge-sm badge-warning">Suspended</span>
            )}
          </div>
        </div>

        <div className="stats stats-vertical sm:stats-horizontal shadow w-full">
          <div className="stat">
            <div className="stat-title text-xs">Equity</div>
            <div className="stat-value text-lg text-primary">{fmt(account.equity)}</div>
          </div>
          <div className="stat">
            <div className="stat-title text-xs">Cash</div>
            <div className="stat-value text-lg">{fmt(account.cash)}</div>
          </div>
          <div className="stat">
            <div className="stat-title text-xs">Buying Power<InfoTip tip="Total capital available for opening new positions (includes margin if applicable)" /></div>
            <div className="stat-value text-lg">{fmt(account.buying_power)}</div>
          </div>
          <div className="stat">
            <div className="stat-title text-xs">Long Market Value<InfoTip tip="Total market value of all long (buy) positions" /></div>
            <div className="stat-value text-lg">{fmt(account.long_market_value)}</div>
          </div>
        </div>

        {/* Account number and additional info */}
        {(account.account_number || account.short_market_value != null) && (
          <div className="flex gap-4 mt-2 text-xs text-base-content/50">
            {account.account_number && (
              <span>Account: {account.account_number}</span>
            )}
            {account.short_market_value != null && parseFloat(account.short_market_value) > 0 && (
              <span>Short MV<InfoTip tip="Short Market Value — total value of all short (sell) positions" />: {fmt(account.short_market_value)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
