'use client'

import { useState, useEffect, useCallback } from 'react';
import AlpacaKeySetup from '@/components/orders/AlpacaKeySetup';
import AccountSummary from '@/components/orders/AccountSummary';
import OrderHistory from '@/components/orders/OrderHistory';
import OpenPositions from '@/components/orders/OpenPositions';
import OrderModal from '@/components/orders/OrderModal';
import PortfolioAnalysis from '@/components/orders/PortfolioAnalysis';

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
  const [orderModal, setOrderModal] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [positionsError, setPositionsError] = useState('');
  const [showKeyManager, setShowKeyManager] = useState(false);

  // Check if Alpaca keys are configured
  const checkKeys = useCallback(async () => {
    setCheckingKeys(true);
    try {
      const res = await fetch('/api/clerk/alpaca-keys-status');
      const data = await res.json();
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
    setAccountError('');
    try {
      const res = await fetch('/api/alpaca/account');
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setAccountError(data.error || `Account fetch failed (${res.status})`);
        // If 403, keys are invalid — re-check
        if (res.status === 403) {
          setKeysConfigured(false);
        }
      }
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async (p) => {
    setLoadingOrders(true);
    setOrdersError('');
    try {
      const res = await fetch(`/api/alpaca/orders?period=${p}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setOrdersError(data.error || `Orders fetch failed (${res.status})`);
        setOrders([]);
        if (res.status === 403) {
          setKeysConfigured(false);
        }
      }
    } catch (err) {
      setOrdersError(err.message);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    setLoadingPositions(true);
    setPositionsError('');
    try {
      const res = await fetch('/api/alpaca/positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setPositionsError(data.error || `Positions fetch failed (${res.status})`);
        setPositions([]);
        if (res.status === 403) {
          setKeysConfigured(false);
        }
      }
    } catch (err) {
      setPositionsError(err.message);
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }, []);

  // Fetch all data when keys are configured
  useEffect(() => {
    if (keysConfigured === true) {
      fetchAccount();
      fetchOrders(period);
      fetchPositions();
    }
  }, [keysConfigured, period, fetchAccount, fetchOrders, fetchPositions]);

  // Handle key configuration success
  const handleKeysConfigured = () => {
    setKeysConfigured(true);
    setShowKeyManager(false);
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
                className={`btn btn-sm join-item ${period === p.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            className="btn btn-sm btn-ghost gap-1"
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
            className="btn btn-sm btn-ghost gap-1"
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

      {/* Account Error Banner */}
      {accountError && (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{accountError}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setKeysConfigured(false)}>
            Re-enter Keys
          </button>
        </div>
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
        />
        <OpenPositions
          positions={positions}
          loading={loadingPositions}
          error={positionsError}
          onRetry={fetchPositions}
        />
      </div>

      {/* Portfolio Analysis (from order history symbols) */}
      <PortfolioAnalysis orders={orders} period={period} />

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
