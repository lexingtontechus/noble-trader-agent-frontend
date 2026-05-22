"use client";

import { useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

/**
 * ParameterSweep — Grid search results visualization.
 *
 * Sections:
 *   1. Best Result Cards (by Sharpe, by Return)
 *   2. 2D Heatmap — X/Y params, color = P&L or Sharpe
 *   3. Individual Parameter Sensitivity — bar chart of P&L per param value
 *   4. Full Results Table
 */

// ── Color helpers ─────────────────────────────────────────────────────────

const COLOR_SCALE = [
  "#dc2626", // deep red (worst)
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#16a34a", // deep green (best)
];

function valueToColor(value, min, max) {
  if (max === min) return COLOR_SCALE[4];
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.round(ratio * (COLOR_SCALE.length - 1));
  return COLOR_SCALE[idx];
}

function formatNum(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n === Infinity) return "∞";
  return n.toFixed(decimals);
}

// ── Section Header ────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
        <span className="text-xs">{icon}</span>
      </div>
      <h4 className="font-semibold text-sm">{title}</h4>
      {badge && (
        <span className="badge badge-xs badge-ghost ml-auto">{badge}</span>
      )}
    </div>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────

function BestCard({ label, icon, result, colorClass = "" }) {
  if (!result) return null;
  const { params = {}, sharpe_estimate, total_pnl_bricks, win_rate, profit_factor, max_drawdown_bricks, total_trades } = result;
  return (
    <div className={`card bg-base-200 shadow-lg border-l-4 ${colorClass}`} style={{ borderLeftColor: colorClass ? undefined : "#3b82f6" }}>
      <div className="card-body p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs">{icon}</span>
          <span className="font-semibold text-xs">{label}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-base-300/30 rounded p-2">
            <div className="text-[9px] text-base-content/30 uppercase">Sharpe</div>
            <div className={`font-mono font-bold text-sm ${(sharpe_estimate ?? 0) >= 1 ? "text-success" : "text-warning"}`}>
              {formatNum(sharpe_estimate ?? 0)}
            </div>
          </div>
          <div className="bg-base-300/30 rounded p-2">
            <div className="text-[9px] text-base-content/30 uppercase">P&L (br)</div>
            <div className={`font-mono font-bold text-sm ${(total_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}`}>
              {formatNum(total_pnl_bricks ?? 0, 1)}
            </div>
          </div>
          <div className="bg-base-300/30 rounded p-2">
            <div className="text-[9px] text-base-content/30 uppercase">Win Rate</div>
            <div className={`font-mono font-bold text-sm ${(win_rate ?? 0) >= 0.5 ? "text-success" : "text-error"}`}>
              {formatNum((win_rate ?? 0) * 100, 1)}%
            </div>
          </div>
          <div className="bg-base-300/30 rounded p-2">
            <div className="text-[9px] text-base-content/30 uppercase">Profit Factor</div>
            <div className={`font-mono font-bold text-sm ${(profit_factor ?? 0) >= 1 ? "text-success" : "text-error"}`}>
              {formatNum(profit_factor ?? 0)}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(params).map(([k, v]) => (
            <span key={k} className="badge badge-xs badge-outline font-mono">
              {k}: {typeof v === "boolean" ? (v ? "✓" : "✗") : String(v)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Scatter Heatmap Tooltip ───────────────────────────────────────────────

function HeatmapTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <div className="font-semibold mb-1">Params</div>
      {Object.entries(point.params || {}).map(([k, v]) => (
        <div key={k} className="font-mono">
          {k}: <span className="font-bold">{typeof v === "boolean" ? (v ? "✓" : "✗") : String(v)}</span>
        </div>
      ))}
      <div className="border-t border-base-300 mt-1 pt-1">
        <div className="font-mono">Sharpe: <span className="font-bold">{formatNum(point.sharpe_estimate ?? 0)}</span></div>
        <div className="font-mono">P&L: <span className="font-bold">{formatNum(point.total_pnl_bricks ?? 0, 1)} br</span></div>
        <div className="font-mono">Win Rate: <span className="font-bold">{formatNum((point.win_rate ?? 0) * 100, 1)}%</span></div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ParameterSweep({ result, symbol = "SPY", config = {} }) {
  const { results = [], best_by_sharpe = null, best_by_return = null, n_combinations = 0 } = result;

  // Color metric selector
  const [colorMetric, setColorMetric] = useState("total_pnl_bricks");

  // Swept params (keys that vary across results)
  const sweptParams = useMemo(() => {
    if (!results.length) return [];
    const paramKeys = new Set();
    results.forEach((r) => {
      Object.keys(r.params || {}).forEach((k) => paramKeys.add(k));
    });
    return Array.from(paramKeys);
  }, [results]);

  // 2D scatter data for heatmap
  const scatterData = useMemo(() => {
    if (sweptParams.length < 2) return [];
    const xParam = sweptParams[0];
    const yParam = sweptParams[1];
    return results.map((r) => ({
      x: r.params?.[xParam] ?? 0,
      y: r.params?.[yParam] ?? 0,
      [colorMetric]: r[colorMetric] ?? 0,
      params: r.params,
      sharpe_estimate: r.sharpe_estimate,
      total_pnl_bricks: r.total_pnl_bricks,
      win_rate: r.win_rate,
      profit_factor: r.profit_factor,
    }));
  }, [results, sweptParams, colorMetric]);

  // Min/max for color scale
  const colorRange = useMemo(() => {
    if (!results.length) return { min: 0, max: 1 };
    const values = results.map((r) => r[colorMetric] ?? 0);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [results, colorMetric]);

  // Sensitivity data: group by each param, average metric per value
  const sensitivityData = useMemo(() => {
    const out = {};
    sweptParams.forEach((param) => {
      const byValue = {};
      results.forEach((r) => {
        const val = r.params?.[param];
        if (val === undefined) return;
        if (!byValue[val]) byValue[val] = { values: [], count: 0 };
        byValue[val].values.push(r[colorMetric] ?? 0);
        byValue[val].count++;
      });
      out[param] = Object.entries(byValue)
        .map(([val, data]) => ({
          value: typeof Number(val) === "number" && !isNaN(Number(val)) ? Number(val) : val,
          avg: data.values.reduce((a, b) => a + b, 0) / data.values.length,
          count: data.count,
          label: String(val),
        }))
        .sort((a, b) => (a.value > b.value ? 1 : -1));
    });
    return out;
  }, [results, sweptParams, colorMetric]);

  // Bar chart tooltip
  function SensitivityTooltip({ active, payload, label: tooltipLabel }) {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-base-200 border border-base-300 rounded-lg px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold">{tooltipLabel}</div>
        <div className="font-mono">Avg {colorMetric}: <span className="font-bold">{formatNum(payload[0]?.value ?? 0)}</span></div>
        <div className="text-base-content/50">{payload[0]?.payload?.count ?? 0} combinations</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Section 1: Best Result Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BestCard label="Best by Sharpe" icon="📈" result={best_by_sharpe} />
        <BestCard label="Best by Return" icon="💰" result={best_by_return} />
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="badge badge-sm badge-primary">{n_combinations} combinations tested</span>
        <span className="badge badge-sm badge-ghost">{sweptParams.length} parameters swept</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-base-content/50">Color by:</span>
          <select
            className="select select-xs select-bordered"
            value={colorMetric}
            onChange={(e) => setColorMetric(e.target.value)}
          >
            <option value="total_pnl_bricks">P&L (bricks)</option>
            <option value="sharpe_estimate">Sharpe Estimate</option>
            <option value="win_rate">Win Rate</option>
            <option value="profit_factor">Profit Factor</option>
          </select>
        </div>
      </div>

      {/* ── Section 2: 2D Scatter Heatmap ─────────────────────────────────── */}
      {sweptParams.length >= 2 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader
              icon="🗺️"
              title="2D Parameter Heatmap"
              badge={`${sweptParams[0]} × ${sweptParams[1]}`}
            />
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis
                  dataKey="x"
                  name={sweptParams[0]}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                  label={{ value: sweptParams[0], position: "insideBottomRight", offset: -5, fontSize: 10 }}
                />
                <YAxis
                  dataKey="y"
                  name={sweptParams[1]}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  opacity={0.3}
                  label={{ value: sweptParams[1], angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <Tooltip content={<HeatmapTooltip />} />
                <Scatter name="Parameter Combos" data={scatterData}>
                  {scatterData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={valueToColor(entry[colorMetric], colorRange.min, colorRange.max)}
                      stroke="none"
                      r={8}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            {/* Color legend */}
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-[10px] text-base-content/30 font-mono">
                {formatNum(colorRange.min, 1)}
              </span>
              <div className="flex h-3 rounded-full overflow-hidden" style={{ width: 120 }}>
                {COLOR_SCALE.map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[10px] text-base-content/30 font-mono">
                {formatNum(colorRange.max, 1)}
              </span>
              <span className="text-[10px] text-base-content/20 ml-2">{colorMetric}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Parameter Sensitivity Charts ───────────────────────── */}
      {sweptParams.length > 0 && (
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <SectionHeader icon="📊" title="Parameter Sensitivity" badge={`Avg ${colorMetric} per value`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sweptParams.map((param) => {
                const data = sensitivityData[param] || [];
                if (data.length < 2) return null;
                return (
                  <div key={param} className="bg-base-300/30 rounded-lg p-3">
                    <div className="text-xs font-semibold mb-2">{param}</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.3} />
                        <YAxis tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.3} />
                        <Tooltip content={<SensitivityTooltip />} />
                        <Bar
                          dataKey="avg"
                          name={`Avg ${colorMetric}`}
                          fill="#3b82f6"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 6: Statistical Rigor ────────────────────────────────────── */}
      {(() => {
        const dsrResult = result.deflated_sharpe_result;
        const mtResults = result.multiple_testing_results;
        const sigResults = result.significance_test_results;
        const hasAny = dsrResult || mtResults || sigResults;
        if (!hasAny) return null;

        return (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body p-4">
              <SectionHeader icon="🔬" title="Statistical Rigor" badge="Phase 6" />

              {/* DSR */}
              {dsrResult && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Deflated Sharpe Ratio</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-base-300/30 rounded p-2">
                      <div className="text-[9px] text-base-content/30 uppercase">DSR</div>
                      <div className={`font-mono font-bold text-lg ${dsrResult.dsr >= 0.95 ? "text-success" : dsrResult.dsr >= 0.9 ? "text-warning" : "text-error"}`}>
                        {formatNum(dsrResult.dsr, 4)}
                      </div>
                    </div>
                    <div className="bg-base-300/30 rounded p-2">
                      <div className="text-[9px] text-base-content/30 uppercase">Observed SR</div>
                      <div className="font-mono font-bold text-lg">{formatNum(dsrResult.observed_sharpe, 3)}</div>
                    </div>
                    <div className="bg-base-300/30 rounded p-2">
                      <div className="text-[9px] text-base-content/30 uppercase">Expected Max SR</div>
                      <div className="font-mono font-bold text-lg">{formatNum(dsrResult.expected_max_sharpe, 3)}</div>
                    </div>
                    <div className="bg-base-300/30 rounded p-2">
                      <div className="text-[9px] text-base-content/30 uppercase">Verdict</div>
                      <div className={`font-mono font-bold text-lg ${dsrResult.is_significant ? "text-success" : "text-error"}`}>
                        {dsrResult.is_significant ? "Significant" : "Not Significant"}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-base-content/30 mt-1">
                    {dsrResult.n_trials} independent trials tested. DSR adjusts the best observed Sharpe for the expected maximum from {dsrResult.n_trials} random draws.
                  </div>
                </div>
              )}

              {/* Multiple Testing Correction */}
              {mtResults && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Multiple Testing Correction</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {["bonferroni", "holm_bonferroni", "benjamini_hochberg"].map((method) => {
                      const data = mtResults[method];
                      if (!data) return null;
                      const label = method === "bonferroni" ? "Bonferroni" : method === "holm_bonferroni" ? "Holm-Bonferroni" : "Benjamini-Hochberg";
                      return (
                        <div key={method} className="bg-base-300/30 rounded p-3">
                          <div className="text-xs font-semibold mb-1">{label}</div>
                          <div className="text-[10px] text-base-content/40 mb-2">
                            {method === "benjamini_hochberg" ? "Controls FDR" : "Controls FWER"}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-base-content/30 text-[9px] uppercase">Tests</div>
                              <div className="font-mono font-bold">{data.n_tests}</div>
                            </div>
                            <div>
                              <div className="text-base-content/30 text-[9px] uppercase">Significant</div>
                              <div className={`font-mono font-bold ${data.significant_count > 0 ? "text-success" : "text-error"}`}>
                                {data.significant_count}/{data.n_tests}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Significance Tests */}
              {sigResults && Object.keys(sigResults).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-base-content/70 mb-2">Strategy Significance Tests</div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th className="text-xs">Test</th>
                          <th className="text-xs">Statistic</th>
                          <th className="text-xs">P-Value</th>
                          <th className="text-xs">Significant</th>
                          <th className="text-xs">Bootstraps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(sigResults).map(([testName, testData]) => (
                          <tr key={testName}>
                            <td className="font-mono text-xs font-semibold">{testName.replace(/_/g, " ")}</td>
                            <td className="font-mono text-xs">{formatNum(testData.statistic, 4)}</td>
                            <td className="font-mono text-xs">
                              <span className={testData.p_value < 0.05 ? "text-success" : "text-error"}>
                                {formatNum(testData.p_value, 4)}
                              </span>
                            </td>
                            <td className="font-mono text-xs">
                              {testData.is_significant ? (
                                <span className="badge badge-xs badge-success">Yes</span>
                              ) : (
                                <span className="badge badge-xs badge-error">No</span>
                              )}
                            </td>
                            <td className="font-mono text-xs text-base-content/40">{testData.n_bootstrap}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile card list */}
                  <div className="sm:hidden space-y-2">
                    {Object.entries(sigResults).map(([testName, testData]) => (
                      <div key={testName} className="card bg-base-300/50 p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono font-bold text-sm">{testName.replace(/_/g, " ")}</span>
                          {testData.is_significant ? (
                            <span className="badge badge-xs badge-success">Yes</span>
                          ) : (
                            <span className="badge badge-xs badge-error">No</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div><span className="text-base-content/50">Statistic:</span> <span className="font-mono">{formatNum(testData.statistic, 4)}</span></div>
                          <div><span className="text-base-content/50">P-Value:</span> <span className={`font-mono ${testData.p_value < 0.05 ? "text-success" : "text-error"}`}>{formatNum(testData.p_value, 4)}</span></div>
                          <div><span className="text-base-content/50">Bootstraps:</span> <span className="font-mono text-base-content/40">{testData.n_bootstrap}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Section 4: Full Results Table ──────────────────────────────────── */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          <SectionHeader icon="📋" title="All Combinations" badge={`${results.length} results`} />
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className="text-xs">#</th>
                  {sweptParams.map((p) => (
                    <th key={p} className="text-xs font-mono">{p}</th>
                  ))}
                  <th className="text-xs">P&L (br)</th>
                  <th className="text-xs">Win Rate</th>
                  <th className="text-xs">Sharpe</th>
                  <th className="text-xs">PF</th>
                  <th className="text-xs">Max DD</th>
                  <th className="text-xs">Trades</th>
                  <th className="text-xs">P-Value</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const isBestSharpe = best_by_sharpe && Object.entries(best_by_sharpe.params || {}).every(
                    ([k, v]) => r.params?.[k] === v
                  );
                  const isBestReturn = best_by_return && Object.entries(best_by_return.params || {}).every(
                    ([k, v]) => r.params?.[k] === v
                  );
                  return (
                    <tr key={i} className={`${isBestSharpe ? "bg-primary/10" : ""} ${isBestReturn ? "bg-success/10" : ""}`}>
                      <td className="font-mono text-xs">
                        {i + 1}
                        {isBestSharpe && <span className="text-primary ml-1">S</span>}
                        {isBestReturn && <span className="text-success ml-1">R</span>}
                      </td>
                      {sweptParams.map((p) => (
                        <td key={p} className="font-mono text-xs">
                          {typeof r.params?.[p] === "boolean" ? (r.params[p] ? "✓" : "✗") : String(r.params?.[p] ?? "—")}
                        </td>
                      ))}
                      <td>
                        <span className={`font-mono text-xs ${(r.total_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}`}>
                          {formatNum(r.total_pnl_bricks ?? 0, 1)}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(r.win_rate ?? 0) >= 0.5 ? "text-success" : "text-error"}>
                          {formatNum((r.win_rate ?? 0) * 100, 1)}%
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(r.sharpe_estimate ?? 0) >= 1 ? "text-success" : "text-warning"}>
                          {formatNum(r.sharpe_estimate ?? 0)}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className={(r.profit_factor ?? 0) >= 1 ? "text-success" : "text-error"}>
                          {formatNum(r.profit_factor ?? 0)}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-error">
                        {formatNum(r.max_drawdown_bricks ?? 0, 1)}
                      </td>
                      <td className="font-mono text-xs">{r.total_trades ?? "—"}</td>
                      <td className="font-mono text-xs">
                        <span className={(r.raw_p_value ?? 1) < 0.05 ? "text-success" : "text-base-content/40"}>
                          {formatNum(r.raw_p_value ?? 1, 3)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
            {results.map((r, i) => {
              const isBestSharpe = best_by_sharpe && Object.entries(best_by_sharpe.params || {}).every(
                ([k, v]) => r.params?.[k] === v
              );
              const isBestReturn = best_by_return && Object.entries(best_by_return.params || {}).every(
                ([k, v]) => r.params?.[k] === v
              );
              return (
                <div key={i} className={`card bg-base-300/50 p-3 ${isBestSharpe ? "border-l-2 border-primary" : ""} ${isBestReturn ? "border-l-2 border-success" : ""}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-bold text-sm">
                      #{i + 1}
                      {isBestSharpe && <span className="text-primary ml-1">S</span>}
                      {isBestReturn && <span className="text-success ml-1">R</span>}
                    </span>
                    <span className={`font-mono text-sm font-bold ${(r.total_pnl_bricks ?? 0) >= 0 ? "text-success" : "text-error"}`}>
                      {formatNum(r.total_pnl_bricks ?? 0, 1)} br
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {sweptParams.map((p) => (
                      <span key={p} className="badge badge-xs badge-outline font-mono">
                        {p}: {typeof r.params?.[p] === "boolean" ? (r.params[p] ? "✓" : "✗") : String(r.params?.[p] ?? "—")}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div><span className="text-base-content/50">Win Rate:</span> <span className={`font-mono ${(r.win_rate ?? 0) >= 0.5 ? "text-success" : "text-error"}`}>{formatNum((r.win_rate ?? 0) * 100, 1)}%</span></div>
                    <div><span className="text-base-content/50">Sharpe:</span> <span className={`font-mono ${(r.sharpe_estimate ?? 0) >= 1 ? "text-success" : "text-warning"}`}>{formatNum(r.sharpe_estimate ?? 0)}</span></div>
                    <div><span className="text-base-content/50">PF:</span> <span className={`font-mono ${(r.profit_factor ?? 0) >= 1 ? "text-success" : "text-error"}`}>{formatNum(r.profit_factor ?? 0)}</span></div>
                    <div><span className="text-base-content/50">Max DD:</span> <span className="font-mono text-error">{formatNum(r.max_drawdown_bricks ?? 0, 1)}</span></div>
                    <div><span className="text-base-content/50">Trades:</span> <span className="font-mono">{r.total_trades ?? "—"}</span></div>
                    <div><span className="text-base-content/50">P-Value:</span> <span className={`font-mono ${(r.raw_p_value ?? 1) < 0.05 ? "text-success" : "text-base-content/40"}`}>{formatNum(r.raw_p_value ?? 1, 3)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-base-content/30 mt-1">
            S = Best by Sharpe | R = Best by Return
          </div>
        </div>
      </div>
    </div>
  );
}
