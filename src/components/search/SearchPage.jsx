'use client'

import { useState, useEffect, useCallback } from 'react';
import SearchResults from '@/components/search/SearchResults';
import OrderModal from '@/components/orders/OrderModal';
import { notifySuccess, notifyError } from '@/lib/notifications';
import { getAssetClass } from '@/lib/symbol-utils';

const POPULAR_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY',
  'QQQ', 'DIA', 'IWM', 'GLD', 'SLV', 'BTC-USD', 'ETH-USD', 'EURUSD=X',
];

// Badge colors for different asset classes
const ASSET_CLASS_BADGE = {
  stock: '',
  crypto: 'badge-primary',
  forex: 'badge-secondary',
  futures: 'badge-accent',
  index: 'badge-ghost',
};

const ASSET_CLASS_LABEL = {
  stock: '',
  crypto: '₿',
  forex: '💱',
  futures: '📈',
  index: '📊',
};

const PERIODS = [
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
];

const STORAGE_KEY = 'noble-trader-recent-searches';

function getRecentSearches() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(symbol) {
  const recent = getRecentSearches().filter((s) => s !== symbol);
  recent.unshift(symbol);
  if (recent.length > 8) recent.length = 8;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  return recent;
}

function removeRecentSearch(symbol) {
  const recent = getRecentSearches().filter((s) => s !== symbol);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  return recent;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('6mo');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const [orderModal, setOrderModal] = useState(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const doSearch = useCallback(async (symbol, p) => {
    const trimmed = String(symbol).trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: trimmed, period: p || period }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setResults(data);
      setRecentSearches(saveRecentSearch(trimmed));
      notifySuccess(`Analysis complete for ${trimmed}`);
    } catch (err) {
      setError(err.message);
      notifyError(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const handleSearch = () => {
    doSearch(query);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleTickerClick = (ticker) => {
    setQuery(ticker);
    doSearch(ticker);
  };

  const handleRecentClick = (symbol) => {
    setQuery(symbol);
    doSearch(symbol);
  };

  const handleRemoveRecent = (symbol) => {
    setRecentSearches(removeRecentSearch(symbol));
  };

  const handleRetry = () => {
    if (query) doSearch(query);
  };

  const handleBuySell = (symbol) => {
    setOrderModal(symbol);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">Search</h1>

      {/* Search Input */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input input-bordered flex-1"
          placeholder="Enter ticker symbol (e.g. AAPL)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-base-content/60">Period:</span>
        <div className="btn-group">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setPeriod(p.key);
                if (results) doSearch(query, p.key);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Popular Tickers */}
      <div>
        <h2 className="text-sm font-medium text-base-content/60 mb-2">Popular Tickers</h2>
        <div className="flex flex-wrap gap-2">
          {POPULAR_TICKERS.map((ticker) => {
            const cls = getAssetClass(ticker);
            const isNonStock = cls !== 'stock';
            return (
              <button
                key={ticker}
                className={`btn btn-sm btn-outline ${isNonStock ? 'gap-1' : ''}`}
                onClick={() => handleTickerClick(ticker)}
              >
                {ticker}
                {isNonStock && (
                  <span className={`badge badge-xs ${ASSET_CLASS_BADGE[cls] || ''}`}>
                    {ASSET_CLASS_LABEL[cls] || cls}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-base-content/60 mb-2">Recent Searches</h2>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((symbol) => (
              <div key={symbol} className="badge badge-lg badge-outline gap-1">
                <button
                  className="hover:text-primary transition-colors"
                  onClick={() => handleRecentClick(symbol)}
                >
                  {symbol}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleRemoveRecent(symbol)}
                  aria-label={`Remove ${symbol}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="card bg-base-200 shadow">
            <div className="card-body p-4">
              <div className="skeleton h-6 w-40 mb-3"></div>
              <div className="skeleton h-48 w-full"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card bg-base-200 shadow">
              <div className="card-body p-4 space-y-2">
                <div className="skeleton h-6 w-32"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-3/4"></div>
              </div>
            </div>
            <div className="card bg-base-200 shadow">
              <div className="card-body p-4 space-y-2">
                <div className="skeleton h-6 w-32"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-3/4"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost" onClick={handleRetry}>Retry</button>
        </div>
      )}

      {/* Results */}
      {!loading && !error && results && (
        <SearchResults data={results} onBuySell={handleBuySell} />
      )}

      {/* Order Modal */}
      {orderModal && (
        <OrderModal
          symbol={orderModal}
          onClose={() => setOrderModal(null)}
          onSuccess={() => setOrderModal(null)}
        />
      )}
    </div>
  );
}
