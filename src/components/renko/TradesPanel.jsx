"use client";

import { useMemo } from "react";

/**
 * TradesPanel — Trade history, session stats, cumulative stats, and equity curve.
 * Tab 3 of the Renko HFT Pipeline.
 */

function TradeRow({ trade }) {
  const isLong = trade.direction === "LONG" || trade.direction === "BUY";
  const pnlBricks = trade.pnl_bricks ?? 0;
  const pnlDollars = trade.pnl_dollars ?? 0;
  const isWin = pnlBricks > 0;

  return (
    <tr className={isWin ? "" : "opacity-70"}>
      <td className="font-mono text-xs">{trade.symbol || "—"}</td>
      <td>
        <span
          className={`badge badge-xs ${isLong ? "badge-success" : "badge-error"}`}
        >
          {trade.direction || "—"}
        </span>
      </td>
      <td className="font-mono text-xs">
        {typeof trade.entry_price === "number"
          ? `$${trade.entry_price.toFixed(2)}`
          : "—"}
      </td>
      <td className="font-mono text-xs">
        {typeof trade.exit_price === "number"
          ? `$${trade.exit_price.toFixed(2)}`
          : "—"}
      </td>
      <td>
        <span
          className={`font-mono text-xs ${
            pnlBricks >= 0 ? "text-success" : "text-error"
          }`}
        >
          {pnlBricks >= 0 ? "+" : ""}
          {pnlBricks}
        </span>
      </td>
      <td>
        <span
          className={`font-mono text-xs ${
            pnlDollars >= 0 ? "text-success" : "text-error"
          }`}
        >
          {pnlDollars >= 0 ? "+" : ""}$
          {Math.abs(pnlDollars).toFixed(2)}
        </span>
      </td>
      <td>
        <span
          className={`badge badge-xs ${
            trade.status === "closed"
              ? "badge-ghost"
              : trade.status === "open"
                ? "badge-info"
                : "badge-warning"
          }`}
        >
          {trade.status || "—"}
        </span>
      </td>
      <td className="text-xs text-base-content/50">
        {trade.close_reason || "—"}
      </td>
    </tr>
  );
}

function EquityCurve({ trades }) {
  const cumulativePnl = useMemo(() => {
    if (!trades.length) return [];
    let running = 0;
    return trades.map((t) => {
      running += t.pnl_bricks ?? 0;
      return running;
    });
  }, [trades]);

  if (cumulativePnl.length < 2) {
    return (
      <div className="text-center py-6 text-base-content/30 text-sm">
        Need at least 2 trades to render equity curve
      </div>
    );
  }

  const maxVal = Math.max(...cumulativePnl, 0);
  const minVal = Math.min(...cumulativePnl, 0);
  const range = maxVal - minVal || 1;

  const points = cumulativePnl.map((val, i) => {
    const x = (i / (cumulativePnl.length - 1)) * 100;
    const y = 100 - ((val - minVal) / range) * 80 - 10;
    return `${x},${y}`;
  });

  const isPositive = cumulativePnl[cumulativePnl.length - 1] >= 0;
  const lineColor = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-32"
      >
        {/* Zero line */}
        {(() => {
          const zeroY = 100 - ((0 - minVal) / range) * 80 - 10;
          return (
            <line
              x1="0"
              y1={zeroY}
              x2="100"
              y2={zeroY}
              stroke="currentColor"
              strokeWidth="0.3"
              opacity="0.2"
            />
          );
        })()}

        {/* Equity line */}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />

        {/* End point */}
        {(() => {
          const lastX = 100;
          const lastY =
            100 -
            ((cumulativePnl[cumulativePnl.length - 1] - minVal) / range) *
              80 -
            10;
          return (
            <circle cx={lastX} cy={lastY} r="1.5" fill={lineColor} />
          );
        })()}
      </svg>

      {/* Labels */}
      <div className="flex justify-between mt-1 text-xs font-mono text-base-content/40">
        <span>{cumulativePnl.length} trades</span>
        <span className={isPositive ? "text-success" : "text-error"}>
          {isPositive ? "+" : ""}
          {cumulativePnl[cumulativePnl.length - 1]} bricks
        </span>
      </div>
    </div>
  );
}

export default function TradesPanel({ trades = [], state = {}, stats = {} }) {
  const session = stats?.session || {};
  const journal = stats?.journal || {};

  // Compute session stats
  const closedTrades = trades.filter((t) => t.status === "closed");
  const wins = closedTrades.filter((t) => (t.pnl_bricks ?? 0) > 0);
  const losses = closedTrades.filter((t) => (t.pnl_bricks ?? 0) <= 0);
  const winRate =
    closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const totalPnlBricks = closedTrades.reduce(
    (sum, t) => sum + (t.pnl_bricks ?? 0),
    0
  );
  const totalPnlDollars = closedTrades.reduce(
    (sum, t) => sum + (t.pnl_dollars ?? 0),
    0
  );
  const avgPnlBricks =
    closedTrades.length > 0 ? totalPnlBricks / closedTrades.length : 0;

  // Compute max drawdown
  const maxDrawdown = (() => {
    let running = 0;
    let peak = 0;
    let dd = 0;
    closedTrades.forEach((t) => {
      running += t.pnl_bricks ?? 0;
      if (running > peak) peak = running;
      const drawdown = peak - running;
      if (drawdown > dd) dd = drawdown;
    });
    return dd;
  })();

  return (
    <div className="space-y-4">
      {/* Session Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3">
            <span className="text-[10px] text-base-content/40 uppercase">
              Trades Taken
            </span>
            <div className="font-mono font-bold text-xl">
              {state?.session_trades || closedTrades.length}
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3">
            <span className="text-[10px] text-base-content/40 uppercase">
              Win Rate
            </span>
            <div
              className={`font-mono font-bold text-xl ${
                winRate >= 50 ? "text-success" : "text-error"
              }`}
            >
              {winRate.toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3">
            <span className="text-[10px] text-base-content/40 uppercase">
              Daily P&L
            </span>
            <div
              className={`font-mono font-bold text-xl ${
                totalPnlBricks >= 0 ? "text-success" : "text-error"
              }`}
            >
              {totalPnlBricks >= 0 ? "+" : ""}
              {totalPnlBricks} bricks
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3">
            <span className="text-[10px] text-base-content/40 uppercase">
              Max Drawdown
            </span>
            <div className="font-mono font-bold text-xl text-error">
              -{maxDrawdown} bricks
            </div>
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <span className="text-xs">📈</span>
            </div>
            <h4 className="font-semibold text-sm">Equity Curve</h4>
            <span className="badge badge-xs badge-ghost ml-auto">
              Cumulative P&L in bricks
            </span>
          </div>
          <EquityCurve trades={closedTrades} />
        </div>
      </div>

      {/* Cumulative Stats */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center">
              <span className="text-xs">📊</span>
            </div>
            <h4 className="font-semibold text-sm">Cumulative Stats</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-base-300/30 rounded-lg p-3">
              <div className="text-[10px] text-base-content/40 uppercase">
                Total Trades
              </div>
              <div className="font-mono font-bold text-lg">
                {state?.total_trades || closedTrades.length}
              </div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-3">
              <div className="text-[10px] text-base-content/40 uppercase">
                Total P&L ($)
              </div>
              <div
                className={`font-mono font-bold text-lg ${
                  totalPnlDollars >= 0 ? "text-success" : "text-error"
                }`}
              >
                {totalPnlDollars >= 0 ? "+" : ""}$
                {Math.abs(totalPnlDollars).toFixed(2)}
              </div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-3">
              <div className="text-[10px] text-base-content/40 uppercase">
                Total P&L (bricks)
              </div>
              <div
                className={`font-mono font-bold text-lg ${
                  (state?.total_pnl_bricks ?? totalPnlBricks) >= 0
                    ? "text-success"
                    : "text-error"
                }`}
              >
                {state?.total_pnl_bricks ?? totalPnlBricks >= 0 ? "+" : ""}
                {state?.total_pnl_bricks ?? totalPnlBricks}
              </div>
            </div>
            <div className="bg-base-300/30 rounded-lg p-3">
              <div className="text-[10px] text-base-content/40 uppercase">
                Avg P&L/Trade
              </div>
              <div
                className={`font-mono font-bold text-lg ${
                  avgPnlBricks >= 0 ? "text-success" : "text-error"
                }`}
              >
                {avgPnlBricks >= 0 ? "+" : ""}
                {avgPnlBricks.toFixed(2)} bricks
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trade History Table */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center">
              <span className="text-xs">💰</span>
            </div>
            <h4 className="font-semibold text-sm">Trade Journal</h4>
            <span className="badge badge-xs badge-ghost ml-auto">
              {trades.length} records
            </span>
          </div>

          {trades.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-2xl mb-2 block">📋</span>
              <span className="text-base-content/30 text-sm">
                No trades recorded yet
              </span>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="text-xs">Symbol</th>
                      <th className="text-xs">Dir</th>
                      <th className="text-xs">Entry</th>
                      <th className="text-xs">Exit</th>
                      <th className="text-xs">P&L (br)</th>
                      <th className="text-xs">P&L ($)</th>
                      <th className="text-xs">Status</th>
                      <th className="text-xs">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => (
                      <TradeRow
                        key={trade.id || trade.timestamp || i}
                        trade={trade}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile card list */}
              <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
                {trades.map((trade, i) => {
                  const isLong = trade.direction === "LONG" || trade.direction === "BUY";
                  const pnlBricks = trade.pnl_bricks ?? 0;
                  const pnlDollars = trade.pnl_dollars ?? 0;
                  return (
                    <div key={trade.id || trade.timestamp || i} className="card bg-base-300/50 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">{trade.symbol || "—"}</span>
                          <span className={`badge badge-xs ${isLong ? "badge-success" : "badge-error"}`}>
                            {trade.direction || "—"}
                          </span>
                        </div>
                        <span className={`font-mono text-sm font-bold ${pnlBricks >= 0 ? "text-success" : "text-error"}`}>
                          {pnlBricks >= 0 ? "+" : ""}{pnlBricks} br
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div><span className="text-base-content/50">Entry:</span> <span className="font-mono">{typeof trade.entry_price === "number" ? `$${trade.entry_price.toFixed(2)}` : "—"}</span></div>
                        <div><span className="text-base-content/50">Exit:</span> <span className="font-mono">{typeof trade.exit_price === "number" ? `$${trade.exit_price.toFixed(2)}` : "—"}</span></div>
                        <div><span className="text-base-content/50">P&L ($):</span> <span className={`font-mono ${pnlDollars >= 0 ? "text-success" : "text-error"}`}>{pnlDollars >= 0 ? "+" : ""}${Math.abs(pnlDollars).toFixed(2)}</span></div>
                        <div><span className="text-base-content/50">Status:</span> <span className={`badge badge-xs ${trade.status === "closed" ? "badge-ghost" : trade.status === "open" ? "badge-info" : "badge-warning"}`}>{trade.status || "—"}</span></div>
                        <div className="col-span-2"><span className="text-base-content/50">Reason:</span> <span className="text-base-content/50">{trade.close_reason || "—"}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
