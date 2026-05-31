'use client'

import { useState, useEffect, useCallback } from 'react';
import AlpacaKeySetup from '@/components/orders/AlpacaKeySetup';
import AccountSummary from '@/components/orders/AccountSummary';
import OrderHistory from '@/components/orders/OrderHistory';
import OpenPositions from '@/components/orders/OpenPositions';
import OrderModal from '@/components/orders/OrderModal';
import PortfolioAnalysis from '@/components/orders/PortfolioAnalysis';
import PerformanceReport from '@/components/orders/PerformanceReport';
import GracefulError from '@/components/shared/GracefulError';
import { notifySuccess, notifyWarning } from '@/lib/notifications';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
];

export default function OrdersPage() {
  const [keysConfigured, setKeysConfigured] = useState(null); // null = checking, true/false = result
  const [checkingKeys, setCheckingKeys] = useState(true);
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [period, setPeriod] = useState('3m');
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [activities, setActivities] = useState([]);
  const [equityCurve, setEquityCurve] = useState([]);
  const [orderModal, setOrderModal] = useState(null);
  const [accountError, setAccountError] = useState(null);   // { message, code } | null
  const [ordersError, setOrdersError] = useState(null);      // { message, code } | null
  const [positionsError, setPositionsError] = useState(null); // { message, code } | null
  const [showKeyManager, setShowKeyManager] = useState(false);

  // Check if Alpaca keys are configured (unified credential system)
  const checkKeys = useCallback(async () => {
    setCheckingKeys(true);
    try {
      const res = await fetch('/api/credentials/paper');
      const data = await res.json().catch(() => ({ configured: false }));
      setKeysConfigured(data.configured === true);
    } catch {
      setKeysConfigured(false);
    } finally {
      setCheckingKeys(false);
    }
  }, []);

  useEffect(() => {
    checkKeys();
  }, [checkKeys]);

  // Fetch account data
  const fetchAccount = useCallback(async () => {
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const res = await fetch('/api/alpaca/account');
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setAccountError({ message: data.error, code: data.code });
        // If 403 NO_KEYS, keys are invalid — re-check
        if (res.status === 403 && data.code === 'NO_KEYS') {
          setKeysConfigured(false);
        } else if (res.status === 401 || res.status === 403) {
          notifyWarning('Your API keys appear invalid. Please update them in Settings.');
        }
      }
    } catch (err) {
      setAccountError({ message: 'Unable to reach the trading service.', code: 'CONNECTION_FAILED' });
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async (p) => {
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const res = await fetch(`/api/alpaca/orders?period=${p}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setOrdersError({ message: data.error, code: data.code });
        setOrders([]);
        if (res.status === 403 && data.code === 'NO_KEYS') {
          setKeysConfigured(false);
        }
      }
    } catch (err) {
      setOrdersError({ message: 'Unable to reach the trading service.', code: 'CONNECTION_FAILED' });
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    setLoadingPositions(true);
    setPositionsError(null);
    try {
      const res = await fetch('/api/alpaca/positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setPositionsError({ message: data.error, code: data.code });
        setPositions([]);
        if (res.status === 403 && data.code === 'NO_KEYS') {
          setKeysConfigured(false);
        }
      }
    } catch (err) {
      setPositionsError({ message: 'Unable to reach the trading service.', code: 'CONNECTION_FAILED' });
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }, []);

  // Fetch trade activities (fills)
  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/activities?period=3m&page_size=100');
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently skip — non-critical for main page
    }
  }, []);

  // Fetch equity curve
  const fetchEquityCurve = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/portfolio/history?period=1M&timeframe=1D');
      if (res.ok) {
        const data = await res.json();
        if (data?.timestamp && data?.equity) {
          const startEquity = data.equity[0] || 1;
          const curve = data.timestamp.map((ts, i) => ({
            timestamp: ts * 1000,
            date: new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            equity: parseFloat(data.equity[i]) || 0,
            pnl: parseFloat(data.profit_loss?.[i]) || 0,
            pnlPc: startEquity > 0 ? ((parseFloat(data.equity[i]) - startEquity) / startEquity) * 100 : 0,
          }));
          setEquityCurve(curve);
        }
      }
    } catch {
      // Silently skip
    }
  }, []);

  // Fetch all data when keys are configured
  useEffect(() => {
    if (keysConfigured === true) {
      fetchAccount();
      fetchOrders(period);
      fetchPositions();
      fetchActivities();
      fetchEquityCurve();
    }
  }, [keysConfigured, period, fetchAccount, fetchOrders, fetchPositions, fetchActivities, fetchEquityCurve]);

  // Handle key configuration success
  const handleKeysConfigured = () => {
    setKeysConfigured(true);
    setShowKeyManager(false);
    notifySuccess('Alpaca keys configured successfully!');
  };

  // Handle key removal
  const handleKeysRemoved = () => {
    setKeysConfigured(false);
    setAccount(null);
    setOrders([]);
    setPositions([]);
    setShowKeyManager(false);
  };

  // Handle order success - refresh data
  const handleOrderSuccess = () => {
    fetchAccount();
    fetchOrders(period);
    fetchPositions();
  };

  // Refresh all data
  const refreshAll = () => {
    if (keysConfigured) {
      fetchAccount();
      fetchOrders(period);
      fetchPositions();
    }
  };

  // Still checking keys
  if (checkingKeys) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-primary">Orders</h1>
        <div className="flex items-center gap-3">
          <span className="loading loading-spinner loading-md"></span>
          <span className="text-base-content/60">Checking configuration...</span>
        </div>
      </div>
    );
  }

  // Keys not configured - show setup
  if (!keysConfigured) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-primary">Orders</h1>
        <AlpacaKeySetup onConfigured={handleKeysConfigured} />
      </div>
    );
  }

  // Full orders page
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-3xl font-bold text-primary">Orders</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Filter */}
          <div className="join">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`btn min-h-[44px] sm:min-h-0 sm:btn-sm join-item ${period === p.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost gap-1"
            onClick={refreshAll}
            title="Refresh data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          {/* Key Manager Toggle */}
          <button
            className="btn min-h-[44px] sm:min-h-0 sm:btn-sm btn-ghost gap-1"
            onClick={() => setShowKeyManager(!showKeyManager)}
            title="Manage Alpaca keys"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Alpaca Key Manager (toggle-able) */}
      {showKeyManager && (
        <AlpacaKeySetup
          onConfigured={handleKeysConfigured}
          onRemoved={handleKeysRemoved}
          isManaging
        />
      )}

      {/* Account Error — Graceful UI */}
      {accountError && (
        <GracefulError
          code={accountError.code}
          message={accountError.message}
          onAction={() => setKeysConfigured(false)}
          onRetry={fetchAccount}
        />
      )}

      {/* Account Summary */}
      {loadingAccount ? (
        <div className="card bg-base-200 shadow">
          <div className="card-body p-4">
            <div className="skeleton h-6 w-40 mb-3"></div>
            <div className="flex gap-4 flex-wrap">
              <div className="skeleton h-16 w-28"></div>
              <div className="skeleton h-16 w-28"></div>
              <div className="skeleton h-16 w-28"></div>
              <div className="skeleton h-16 w-28"></div>
            </div>
          </div>
        </div>
      ) : account && !accountError ? (
        <AccountSummary account={account} />
      ) : null}

      {/* Two-column grid: Orders left, Positions right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrderHistory
          orders={orders}
          loading={loadingOrders}
          error={ordersError}
          onRetry={() => fetchOrders(period)}
          onSetupKeys={() => setKeysConfigured(false)}
        />
        <OpenPositions
          positions={positions}
          loading={loadingPositions}
          error={positionsError}
          onRetry={fetchPositions}
          onSetupKeys={() => setKeysConfigured(false)}
        />
      </div>

      {/* Portfolio Analysis (from order history symbols) */}
      <PortfolioAnalysis orders={orders} period={period} />

      {/* Performance Report (PDF Download) */}
      <PerformanceReport
        account={account}
        positions={positions}
        equityCurve={equityCurve}
        activities={activities}
      />

      {/* Order Modal */}
      {orderModal && (
        <OrderModal
          symbol={orderModal}
          onClose={() => setOrderModal(null)}
          onSuccess={handleOrderSuccess}
        />
      )}
    </div>
  );
}
