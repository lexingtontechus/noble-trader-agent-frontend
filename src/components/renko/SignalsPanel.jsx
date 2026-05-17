"use client";

/**
 * SignalsPanel — Displays recent signals, active position, filter status, and Kelly fraction.
 * Tab 2 of the Renko HFT Pipeline.
 */

function SignalRow({ signal, index }) {
  const isLong = signal.direction === "LONG" || signal.direction === "BUY";
  const isShort = signal.direction === "SHORT" || signal.direction === "SELL";
  const dirBadge = isLong
    ? "badge-success"
    : isShort
      ? "badge-error"
      : "badge-ghost";
  const confValue =
    typeof signal.confidence === "number" ? signal.confidence : 0;
  const confPct = (confValue * 100).toFixed(1);
  const confBar =
    confValue > 0.7 ? "progress-success" : confValue > 0.4 ? "progress-warning" : "progress-error";

  return (
    <tr>
      <td>
        <span className={`badge badge-sm ${dirBadge}`}>
          {signal.direction || "—"}
        </span>
      </td>
      <td className="text-xs">{signal.pattern || "—"}</td>
      <td className="font-mono text-xs">
        {typeof signal.price === "number" ? `$${signal.price.toFixed(2)}` : "—"}
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <progress
            className={`progress w-12 ${confBar}`}
            value={confValue}
            max="1"
          />
          <span className="font-mono text-xs">{confPct}%</span>
        </div>
      </td>
      <td className="font-mono text-xs">
        {signal.velocity != null ? signal.velocity.toFixed(1) : "—"}
      </td>
      <td className="font-mono text-xs">
        {signal.brick_count != null ? signal.brick_count : "—"}
      </td>
    </tr>
  );
}

function FilterStatusCard({ stats }) {
  const filterRejections = stats?.filter_rejections || {};
  const session = stats?.session || {};
  const config = stats?.config || {};

  const filters = [
    {
      key: "session_window",
      label: "Session Window",
      active: !!(config.session_start && config.session_end),
      detail: config.session_start && config.session_end
        ? `${config.session_start}–${config.session_end}`
        : "Not set",
    },
    {
      key: "regime_gate",
      label: "Regime Gate",
      active: config.regime_gate === true,
      detail: config.regime_gate ? "Enabled" : "Disabled",
    },
    {
      key: "cooldown",
      label: "Cooldown",
      active: (config.cooldown_seconds || 0) > 0,
      detail: config.cooldown_seconds
        ? `${config.cooldown_seconds}s`
        : "Off",
    },
    {
      key: "daily_loss",
      label: "Daily Loss Limit",
      active: (config.max_daily_loss_bricks || 0) > 0,
      detail: config.max_daily_loss_bricks
        ? `${config.max_daily_loss_bricks} bricks`
        : "Off",
    },
    {
      key: "max_consecutive",
      label: "Max Consecutive Losses",
      active: (config.max_consecutive_losses || 0) > 0,
      detail: config.max_consecutive_losses
        ? String(config.max_consecutive_losses)
        : "Off",
    },
    {
      key: "max_trades",
      label: "Max Trades/Session",
      active: (config.max_trades_per_session || 0) > 0,
      detail: config.max_trades_per_session
        ? String(config.max_trades_per_session)
        : "Unlimited",
    },
  ];

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
            <span className="text-xs">🛡️</span>
          </div>
          <h4 className="font-semibold text-sm">Signal Filters</h4>
        </div>
        <div className="space-y-2">
          {filters.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between bg-base-300/30 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    f.active ? "bg-success" : "bg-base-content/20"
                  }`}
                />
                <span className="text-xs">{f.label}</span>
              </div>
              <span className="text-xs font-mono text-base-content/50">
                {f.detail}
              </span>
            </div>
          ))}
        </div>

        {/* Filter rejections */}
        {Object.keys(filterRejections).length > 0 && (
          <div className="mt-3 pt-3 border-t border-base-300">
            <div className="text-xs text-base-content/40 mb-2">
              Filter Rejections
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(filterRejections).map(([key, count]) => (
                <span key={key} className="badge badge-xs badge-ghost">
                  {key}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivePositionCard({ state }) {
  const position = state?.active_position;

  if (!position) {
    return (
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center">
              <span className="text-xs">📍</span>
            </div>
            <h4 className="font-semibold text-sm">Active Position</h4>
          </div>
          <div className="text-center py-4">
            <span className="text-base-content/30 text-sm">
              No active position
            </span>
          </div>
        </div>
      </div>
    );
  }

  const isLong =
    position.direction === "LONG" || position.direction === "BUY";
  const dirColor = isLong ? "text-success" : "text-error";
  const pnlBricks = position.pnl_bricks ?? 0;
  const pnlDollars = position.pnl_dollars ?? 0;
  const entryPrice = position.entry_price;

  return (
    <div className="card bg-base-200 shadow-sm border-l-4 border-l-primary">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <span className="text-xs">📍</span>
          </div>
          <h4 className="font-semibold text-sm">Active Position</h4>
          <span
            className={`badge badge-sm ${isLong ? "badge-success" : "badge-error"}`}
          >
            {position.direction || "—"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-base-300/30 rounded-lg p-2.5">
            <div className="text-[10px] text-base-content/40 uppercase">
              Entry Price
            </div>
            <div className="font-mono font-bold text-sm">
              {typeof entryPrice === "number"
                ? `$${entryPrice.toFixed(2)}`
                : "—"}
            </div>
          </div>
          <div className="bg-base-300/30 rounded-lg p-2.5">
            <div className="text-[10px] text-base-content/40 uppercase">
              Direction
            </div>
            <div className={`font-mono font-bold text-sm ${dirColor}`}>
              {position.direction || "—"}
            </div>
          </div>
          <div className="bg-base-300/30 rounded-lg p-2.5">
            <div className="text-[10px] text-base-content/40 uppercase">
              P&L (bricks)
            </div>
            <div
              className={`font-mono font-bold text-sm ${
                pnlBricks >= 0 ? "text-success" : "text-error"
              }`}
            >
              {pnlBricks >= 0 ? "+" : ""}
              {pnlBricks}
            </div>
          </div>
          <div className="bg-base-300/30 rounded-lg p-2.5">
            <div className="text-[10px] text-base-content/40 uppercase">
              P&L ($)
            </div>
            <div
              className={`font-mono font-bold text-sm ${
                pnlDollars >= 0 ? "text-success" : "text-error"
              }`}
            >
              {pnlDollars >= 0 ? "+" : ""}${Math.abs(pnlDollars).toFixed(2)}
            </div>
          </div>
          {position.sl_bricks != null && (
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Stop Loss
              </div>
              <div className="font-mono text-sm text-error">
                {position.sl_bricks} bricks
              </div>
            </div>
          )}
          {position.tp_bricks != null && (
            <div className="bg-base-300/30 rounded-lg p-2.5">
              <div className="text-[10px] text-base-content/40 uppercase">
                Take Profit
              </div>
              <div className="font-mono text-sm text-success">
                {position.tp_bricks} bricks
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignalsPanel({ signals = [], stats = {}, state = {} }) {
  return (
    <div className="space-y-4">
      {/* Active Position */}
      <ActivePositionCard state={state} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signals Table */}
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center">
                <span className="text-xs">📊</span>
              </div>
              <h4 className="font-semibold text-sm">Recent Signals</h4>
              <span className="badge badge-xs badge-ghost ml-auto">
                {signals.length} signals
              </span>
            </div>

            {signals.length === 0 ? (
              <div className="text-center py-6">
                <span className="text-base-content/30 text-sm">
                  No signals generated yet
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="text-xs">Dir</th>
                      <th className="text-xs">Pattern</th>
                      <th className="text-xs">Price</th>
                      <th className="text-xs">Conf</th>
                      <th className="text-xs">Vel</th>
                      <th className="text-xs">Bricks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((signal, i) => (
                      <SignalRow
                        key={signal.timestamp || i}
                        signal={signal}
                        index={i}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Filter Status */}
        <FilterStatusCard stats={stats} />
      </div>

      {/* Kelly Fraction Estimate */}
      {(stats?.kelly_fraction != null || state?.session_trades > 0) && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
                <span className="text-xs">📐</span>
              </div>
              <h4 className="font-semibold text-sm">Kelly Fraction</h4>
            </div>
            <div className="flex items-center gap-4">
              {stats?.kelly_fraction != null && (
                <div className="bg-base-300/30 rounded-lg p-3 flex-1">
                  <div className="text-[10px] text-base-content/40 uppercase">
                    Recommended f*
                  </div>
                  <div className="font-mono font-bold text-lg text-secondary">
                    {(stats.kelly_fraction * 100).toFixed(1)}%
                  </div>
                  <div className="mt-1 bg-base-300 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-secondary h-full rounded-full"
                      style={{
                        width: `${Math.min(stats.kelly_fraction * 400, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="bg-base-300/30 rounded-lg p-3 flex-1">
                <div className="text-[10px] text-base-content/40 uppercase">
                  Session Trades
                </div>
                <div className="font-mono font-bold text-lg">
                  {state?.session_trades || 0}
                </div>
              </div>
              <div className="bg-base-300/30 rounded-lg p-3 flex-1">
                <div className="text-[10px] text-base-content/40 uppercase">
                  Session P&L
                </div>
                <div
                  className={`font-mono font-bold text-lg ${
                    (state?.session_pnl_bricks || 0) >= 0
                      ? "text-success"
                      : "text-error"
                  }`}
                >
                  {(state?.session_pnl_bricks || 0) >= 0 ? "+" : ""}
                  {state?.session_pnl_bricks || 0} bricks
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
