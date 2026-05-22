"use client";

/**
 * ExecutionModelingPanel — Institutional-grade display of Phase 7 execution modeling:
 * - Market Impact (Almgren-Chriss) detail card
 * - Fill Probability detail card
 * - Financing Costs (Borrow/Margin/Dividend) detail card
 * - Enhanced Cost Breakdown from trade journal
 */

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt(val, digits = 2) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return Number(val).toFixed(digits);
}

function fmtBps(val, digits = 1) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return `${Number(val).toFixed(digits)} bps`;
}

function fmtDollars(val, digits = 2) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return `$${Number(val).toFixed(digits)}`;
}

function fmtPct(val, digits = 1) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return `${(Number(val) * 100).toFixed(digits)}%`;
}

// ── Market Impact Card (Almgren-Chriss) ──────────────────────────────────

function MarketImpactCard({ marketImpact }) {
  if (!marketImpact) return null;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-error/15 flex items-center justify-center">
            <span className="text-xs">💥</span>
          </div>
          <h4 className="font-semibold text-sm">Market Impact (Almgren-Chriss)</h4>
          <span className="badge badge-xs badge-ghost">Phase 7A</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Participation Rate</div>
            <div className="stat-value text-base font-mono">
              {fmtPct(marketImpact.participation_rate)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Permanent Impact</div>
            <div className="stat-value text-base font-mono text-error">
              {fmtBps(marketImpact.permanent_impact_bps)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Temporary Impact</div>
            <div className="stat-value text-base font-mono text-warning">
              {fmtBps(marketImpact.temporary_impact_bps)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Total Impact</div>
            <div className="stat-value text-base font-mono text-error">
              {fmtBps(marketImpact.total_impact_bps)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Impact Cost</div>
            <div className="stat-value text-base font-mono text-error">
              {fmtDollars(marketImpact.impact_cost_dollars)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Impact % of Order</div>
            <div className="stat-value text-base font-mono">
              {marketImpact.impact_cost_pct != null
                ? `${fmt(marketImpact.impact_cost_pct * 100, 3)}%`
                : "\u2014"}
            </div>
          </div>
        </div>

        {/* Impact bar visualization */}
        {marketImpact.total_impact_bps > 0 && (
          <div className="mt-3">
            <div className="text-[10px] text-base-content/40 mb-1">Impact Composition</div>
            <div className="flex gap-0.5 h-3 rounded overflow-hidden">
              {marketImpact.permanent_impact_bps > 0 && (
                <div
                  className="bg-error/70"
                  style={{
                    width: `${(marketImpact.permanent_impact_bps / marketImpact.total_impact_bps) * 100}%`,
                  }}
                  title={`Permanent: ${fmtBps(marketImpact.permanent_impact_bps)}`}
                />
              )}
              {marketImpact.temporary_impact_bps > 0 && (
                <div
                  className="bg-warning/70"
                  style={{
                    width: `${(marketImpact.temporary_impact_bps / marketImpact.total_impact_bps) * 100}%`,
                  }}
                  title={`Temporary: ${fmtBps(marketImpact.temporary_impact_bps)}`}
                />
              )}
            </div>
            <div className="flex gap-4 mt-1 text-[10px] text-base-content/50">
              <span>
                <span className="inline-block w-2 h-2 bg-error/70 rounded-sm mr-1" />
                Permanent
              </span>
              <span>
                <span className="inline-block w-2 h-2 bg-warning/70 rounded-sm mr-1" />
                Temporary
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fill Probability Card ────────────────────────────────────────────────

function FillProbabilityCard({ fillProbability }) {
  if (!fillProbability) return null;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center">
            <span className="text-xs">🎲</span>
          </div>
          <h4 className="font-semibold text-sm">Fill Probability</h4>
          <span className="badge badge-xs badge-ghost">Phase 7B</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Fill Probability</div>
            <div className="stat-value text-base font-mono">
              {fmtPct(fillProbability.fill_probability)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Order Type</div>
            <div className="stat-value text-base font-mono capitalize">
              {fillProbability.order_type || "\u2014"}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Distance from Mid</div>
            <div className="stat-value text-base font-mono">
              {fillProbability.distance_from_mid_pct != null
                ? `${fmt(fillProbability.distance_from_mid_pct, 3)}%`
                : "\u2014"}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Distance (sigmas)</div>
            <div className="stat-value text-base font-mono">
              {fmt(fillProbability.distance_in_sigmas, 2)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Adverse Selection</div>
            <div className="stat-value text-base font-mono text-warning">
              {fmtBps(fillProbability.expected_fill_price_offset_bps)}
            </div>
          </div>
        </div>

        {/* Fill probability bar */}
        {fillProbability.fill_probability != null && (
          <div className="mt-3">
            <div className="text-[10px] text-base-content/40 mb-1">
              Fill Probability Gauge
            </div>
            <div className="w-full bg-base-300 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  fillProbability.fill_probability >= 0.9
                    ? "bg-success"
                    : fillProbability.fill_probability >= 0.7
                    ? "bg-warning"
                    : "bg-error"
                }`}
                style={{ width: `${Math.min(fillProbability.fill_probability * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-base-content/40 mt-0.5">
              <span>0%</span>
              <span>{fmtPct(fillProbability.fill_probability)}</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {fillProbability.interpretation && (
          <div className="text-xs text-base-content/60 mt-2">
            {fillProbability.interpretation}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Financing Costs Card ─────────────────────────────────────────────────

function FinancingCostsCard({ financingCosts }) {
  if (!financingCosts) return null;

  const components = financingCosts.components || {};
  const borrow = components.borrow || {};
  const margin = components.margin || {};
  const dividend = components.dividend || {};

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
            <span className="text-xs">🏦</span>
          </div>
          <h4 className="font-semibold text-sm">Financing Costs</h4>
          <span className="badge badge-xs badge-ghost">Phase 7C</span>
          {financingCosts.direction && (
            <span className={`badge badge-xs ${financingCosts.direction === "short" ? "badge-error" : "badge-success"}`}>
              {financingCosts.direction.toUpperCase()}
            </span>
          )}
        </div>

        {/* Total financing */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Total Financing</div>
            <div className="stat-value text-base font-mono text-error">
              {fmtDollars(financingCosts.total_financing_cost)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Daily Rate</div>
            <div className="stat-value text-base font-mono">
              {fmtDollars(financingCosts.daily_financing_cost)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Holding Days</div>
            <div className="stat-value text-base font-mono">
              {fmt(financingCosts.holding_days, 1)}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Daily BPS</div>
            <div className="stat-value text-base font-mono">
              {fmtBps(financingCosts.financing_cost_bps_daily)}
            </div>
          </div>
        </div>

        {/* Component breakdown table */}
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Component</th>
                <th className="text-right">Daily Cost</th>
                <th className="text-right">Total Cost</th>
                <th className="text-right">Rate / Details</th>
              </tr>
            </thead>
            <tbody>
              {/* Borrow */}
              {(borrow.daily_borrow_cost != null || borrow.total_borrow_cost != null) && (
                <tr>
                  <td className="text-secondary">
                    Borrow
                    {borrow.is_hard_to_borrow && (
                      <span className="badge badge-xs badge-error ml-1">HTB</span>
                    )}
                  </td>
                  <td className="text-right font-mono">{fmtDollars(borrow.daily_borrow_cost)}</td>
                  <td className="text-right font-mono">{fmtDollars(borrow.total_borrow_cost)}</td>
                  <td className="text-right font-mono text-xs">
                    {borrow.effective_annual_rate_bps != null
                      ? fmtBps(borrow.effective_annual_rate_bps, 0) + "/yr"
                      : "\u2014"}
                  </td>
                </tr>
              )}
              {/* Margin */}
              {(margin.daily_margin_cost != null || margin.total_margin_cost != null) && (
                <tr>
                  <td className="text-secondary">Margin</td>
                  <td className="text-right font-mono">{fmtDollars(margin.daily_margin_cost)}</td>
                  <td className="text-right font-mono">{fmtDollars(margin.total_margin_cost)}</td>
                  <td className="text-right font-mono text-xs">
                    {margin.margin_rate_bps != null
                      ? fmtBps(margin.margin_rate_bps, 0) + "/yr"
                      : "\u2014"}
                  </td>
                </tr>
              )}
              {/* Dividend (shorts) */}
              {(dividend.daily_dividend_cost != null || dividend.total_dividend_cost != null) && (
                <tr>
                  <td className="text-secondary">Dividend (Short)</td>
                  <td className="text-right font-mono">{fmtDollars(dividend.daily_dividend_cost)}</td>
                  <td className="text-right font-mono">{fmtDollars(dividend.total_dividend_cost)}</td>
                  <td className="text-right font-mono text-xs">
                    {dividend.dividend_yield_bps != null
                      ? fmtBps(dividend.dividend_yield_bps, 0) + "/yr"
                      : "\u2014"}
                    {dividend.prob_ex_dividend_during_hold != null &&
                      ` | P(ex-div): ${fmtPct(dividend.prob_ex_dividend_during_hold, 0)}`}
                  </td>
                </tr>
              )}
              {/* Total row */}
              <tr className="font-bold border-t">
                <td>Total Financing</td>
                <td className="text-right font-mono">
                  {fmtDollars(financingCosts.daily_financing_cost)}
                </td>
                <td className="text-right font-mono text-error">
                  {fmtDollars(financingCosts.total_financing_cost)}
                </td>
                <td className="text-right font-mono text-xs">
                  {financingCosts.financing_cost_bps_daily != null
                    ? fmtBps(financingCosts.financing_cost_bps_daily) + "/day"
                    : "\u2014"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {(borrow.daily_borrow_cost != null || borrow.total_borrow_cost != null) && (
            <div className="card bg-base-300/50 p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm text-secondary">
                  Borrow
                  {borrow.is_hard_to_borrow && (
                    <span className="badge badge-xs badge-error ml-1">HTB</span>
                  )}
                </span>
                <span className="font-mono text-sm">{fmtDollars(borrow.total_borrow_cost)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-base-content/50">Daily:</span> <span className="font-mono">{fmtDollars(borrow.daily_borrow_cost)}</span></div>
                <div><span className="text-base-content/50">Rate:</span> <span className="font-mono text-xs">{borrow.effective_annual_rate_bps != null ? fmtBps(borrow.effective_annual_rate_bps, 0) + "/yr" : "\u2014"}</span></div>
              </div>
            </div>
          )}
          {(margin.daily_margin_cost != null || margin.total_margin_cost != null) && (
            <div className="card bg-base-300/50 p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm text-secondary">Margin</span>
                <span className="font-mono text-sm">{fmtDollars(margin.total_margin_cost)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-base-content/50">Daily:</span> <span className="font-mono">{fmtDollars(margin.daily_margin_cost)}</span></div>
                <div><span className="text-base-content/50">Rate:</span> <span className="font-mono text-xs">{margin.margin_rate_bps != null ? fmtBps(margin.margin_rate_bps, 0) + "/yr" : "\u2014"}</span></div>
              </div>
            </div>
          )}
          {(dividend.daily_dividend_cost != null || dividend.total_dividend_cost != null) && (
            <div className="card bg-base-300/50 p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm text-secondary">Dividend (Short)</span>
                <span className="font-mono text-sm">{fmtDollars(dividend.total_dividend_cost)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-base-content/50">Daily:</span> <span className="font-mono">{fmtDollars(dividend.daily_dividend_cost)}</span></div>
                <div><span className="text-base-content/50">Rate:</span> <span className="font-mono text-xs">{dividend.dividend_yield_bps != null ? fmtBps(dividend.dividend_yield_bps, 0) + "/yr" : "\u2014"}</span></div>
              </div>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm px-1 pt-1 border-t border-base-300">
            <span>Total Financing</span>
            <span className="font-mono text-error">{fmtDollars(financingCosts.total_financing_cost)}</span>
          </div>
          <div className="text-xs text-base-content/60 px-1">
            Daily: {fmtDollars(financingCosts.daily_financing_cost)}
            {financingCosts.financing_cost_bps_daily != null ? ` | ${fmtBps(financingCosts.financing_cost_bps_daily)}/day` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Enhanced Cost Breakdown ──────────────────────────────────────────────

function EnhancedCostBreakdown({ costSummary, fillStats }) {
  if (!costSummary) return null;

  const items = [
    { label: "Commission", value: costSummary.commission, color: "text-info" },
    { label: "Slippage", value: costSummary.slippage, color: "text-warning" },
    { label: "Spread", value: costSummary.spread, color: "text-warning" },
    { label: "Market Impact", value: costSummary.market_impact, color: "text-error" },
    { label: "Borrow", value: costSummary.borrow, color: "text-secondary" },
    { label: "Margin", value: costSummary.margin, color: "text-secondary" },
    { label: "Dividend", value: costSummary.dividend, color: "text-secondary" },
    { label: "Total Financing", value: costSummary.total_financing, color: "text-secondary" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
            <span className="text-xs">💸</span>
          </div>
          <h4 className="font-semibold text-sm">Cost Breakdown</h4>
          <span className="badge badge-sm badge-ghost">
            {fmtDollars(costSummary.total_all_costs)} total
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Cost Type</th>
                <th className="text-right">Amount ($)</th>
                <th className="text-right">% of Total</th>
                <th className="text-right">Bar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const pct =
                  costSummary.total_all_costs > 0
                    ? (item.value / costSummary.total_all_costs) * 100
                    : 0;
                return (
                  <tr key={item.label}>
                    <td className={item.color}>{item.label}</td>
                    <td className="text-right font-mono">{fmtDollars(item.value)}</td>
                    <td className="text-right font-mono">{pct.toFixed(1)}%</td>
                    <td className="w-24">
                      <div className="w-full bg-base-300 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            item.label === "Market Impact"
                              ? "bg-error/70"
                              : item.label === "Slippage" || item.label === "Spread"
                              ? "bg-warning/70"
                              : item.label.includes("Financing") || item.label === "Borrow" || item.label === "Margin" || item.label === "Dividend"
                              ? "bg-secondary/70"
                              : "bg-info/70"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="font-bold border-t">
                <td>Total Costs</td>
                <td className="text-right font-mono">
                  {fmtDollars(costSummary.total_all_costs)}
                </td>
                <td className="text-right font-mono">100%</td>
                <td />
              </tr>
              {costSummary.total_cost_pct_of_pnl > 0 && (
                <tr>
                  <td colSpan={4} className="text-xs text-base-content/60">
                    Costs = {costSummary.total_cost_pct_of_pnl?.toFixed(1)}% of gross P&amp;L
                    {" | "}Cost per trade: {fmtDollars(costSummary.cost_per_trade)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {items.map((item) => {
            const pct =
              costSummary.total_all_costs > 0
                ? (item.value / costSummary.total_all_costs) * 100
                : 0;
            return (
              <div key={item.label} className="card bg-base-300/50 p-3">
                <div className="flex justify-between items-center">
                  <span className={`font-medium text-sm ${item.color}`}>{item.label}</span>
                  <span className="font-mono text-sm">{fmtDollars(item.value)}</span>
                </div>
                <div className="w-full bg-base-300 rounded-full h-2 mt-1.5">
                  <div
                    className={`h-2 rounded-full ${
                      item.label === "Market Impact"
                        ? "bg-error/70"
                        : item.label === "Slippage" || item.label === "Spread"
                        ? "bg-warning/70"
                        : item.label.includes("Financing") || item.label === "Borrow" || item.label === "Margin" || item.label === "Dividend"
                        ? "bg-secondary/70"
                        : "bg-info/70"
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-base-content/40 text-right">{pct.toFixed(1)}% of total</div>
              </div>
            );
          })}
          <div className="flex justify-between font-bold text-sm px-1 pt-1 border-t border-base-300">
            <span>Total Costs</span>
            <span className="font-mono">{fmtDollars(costSummary.total_all_costs)}</span>
          </div>
          {costSummary.total_cost_pct_of_pnl > 0 && (
            <div className="text-xs text-base-content/60 px-1">
              Costs = {costSummary.total_cost_pct_of_pnl?.toFixed(1)}% of gross P&amp;L | Cost per trade: {fmtDollars(costSummary.cost_per_trade)}
            </div>
          )}
        </div>

        {/* Fill stats inline */}
        {fillStats && (fillStats.avg_fill_probability != null || fillStats.missed_fills > 0) && (
          <div className="mt-3 pt-3 border-t border-base-content/10">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Fill Stats:</span>
              {fillStats.avg_fill_probability != null && (
                <span className="font-mono">
                  Avg fill: {fmtPct(fillStats.avg_fill_probability)}
                </span>
              )}
              {fillStats.missed_fills > 0 && (
                <span className="text-warning font-mono">
                  Missed: {fillStats.missed_fills} ({fmtPct(fillStats.missed_fill_rate)})
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Execution Modeling Summary Card ──────────────────────────────────────

function ExecutionModelingSummaryCard({ executionModeling }) {
  if (!executionModeling) return null;

  const { market_impact, fill_probability, financing, all_models_enabled } = executionModeling;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
            <span className="text-xs">⚡</span>
          </div>
          <h4 className="font-semibold text-sm">Execution Modeling Summary</h4>
          <span className="badge badge-xs badge-ghost">Phase 7</span>
          {all_models_enabled != null && (
            <span className={`badge badge-xs ${all_models_enabled ? "badge-success" : "badge-warning"}`}>
              {all_models_enabled ? "All Enabled" : "Partial"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Market Impact summary */}
          {market_impact && (
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-base-content/50">Market Impact</span>
                {market_impact.impact_enabled != null && (
                  <span className={`badge badge-xs ${market_impact.impact_enabled ? "badge-success" : "badge-ghost"}`}>
                    {market_impact.impact_enabled ? "ON" : "OFF"}
                  </span>
                )}
              </div>
              <div className="text-sm font-mono font-bold text-error">
                {fmtDollars(market_impact.total_impact_cost_dollars)}
              </div>
              {market_impact.avg_impact_bps_per_trade != null && (
                <div className="text-[10px] text-base-content/40">
                  Avg {fmtBps(market_impact.avg_impact_bps_per_trade)}/trade
                </div>
              )}
            </div>
          )}

          {/* Fill Probability summary */}
          {fill_probability && (
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-base-content/50">Fill Probability</span>
                {fill_probability.fill_probability_enabled != null && (
                  <span className={`badge badge-xs ${fill_probability.fill_probability_enabled ? "badge-success" : "badge-ghost"}`}>
                    {fill_probability.fill_probability_enabled ? "ON" : "OFF"}
                  </span>
                )}
              </div>
              <div className="text-sm font-mono font-bold">
                {fmtPct(fill_probability.avg_fill_probability)}
              </div>
            </div>
          )}

          {/* Financing summary */}
          {financing && (
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="text-[10px] text-base-content/50 mb-1">Financing</div>
              <div className="text-sm font-mono font-bold text-error">
                {fmtDollars(financing.total_financing_cost)}
              </div>
              <div className="text-[10px] text-base-content/40">
                {financing.short_trades > 0 && `Short: ${financing.short_trades} | `}
                Long: {financing.long_trades ?? "\u2014"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────

export default function ExecutionModelingPanel({
  costSummary,
  fillStats,
  executionModeling,
  marketImpact,
  fillProbability,
  financingCosts,
}) {
  const hasAnyData =
    costSummary || fillStats || executionModeling || marketImpact || fillProbability || financingCosts;

  if (!hasAnyData) {
    return (
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4 text-center text-base-content/50">
          <span className="text-2xl">⚡</span>
          <p className="text-sm mt-2">No execution modeling data available</p>
          <p className="text-xs text-base-content/30">
            Enable execution modeling parameters (market impact, fill probability, financing costs)
            to see detailed analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ExecutionModelingSummaryCard executionModeling={executionModeling} />
      <MarketImpactCard marketImpact={marketImpact} />
      <FillProbabilityCard fillProbability={fillProbability} />
      <FinancingCostsCard financingCosts={financingCosts} />
      <EnhancedCostBreakdown costSummary={costSummary} fillStats={fillStats} />
    </div>
  );
}
