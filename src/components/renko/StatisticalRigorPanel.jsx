"use client";

/**
 * StatisticalRigorPanel — Institutional-grade display of Phase 6 statistical rigor:
 * - Deflated Sharpe Ratio (DSR) detail card
 * - Bootstrap Confidence Intervals table
 * - Multiple Testing Corrections table
 * - Significance Tests (White's Reality Check + Hansen's SPA)
 */

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt(val, digits = 4) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return Number(val).toFixed(digits);
}

function fmtPct(val, digits = 1) {
  if (val == null || Number.isNaN(val)) return "\u2014";
  return `${(Number(val) * 100).toFixed(digits)}%`;
}

function significanceBadge(isSignificant) {
  if (isSignificant == null) return null;
  return isSignificant ? (
    <span className="badge badge-xs badge-success">Significant</span>
  ) : (
    <span className="badge badge-xs badge-error">Not Significant</span>
  );
}

// ── DSR Detail Card ──────────────────────────────────────────────────────

function DSRDetailCard({ dsr }) {
  if (!dsr || dsr.dsr == null) return null;

  const level =
    dsr.is_significant ? "alert-success" : dsr.dsr > 0.75 ? "alert-warning" : "alert-error";

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
            <span className="text-xs">🎯</span>
          </div>
          <h4 className="font-semibold text-sm">Deflated Sharpe Ratio</h4>
          {significanceBadge(dsr.is_significant)}
          <span className="badge badge-xs badge-ghost">Phase 6A</span>
        </div>

        <div className={`alert ${level} alert-sm mb-3`}>
          <div>
            <div className="font-bold text-xs">
              DSR: {fmt(dsr.dsr)}
              {dsr.is_significant && " \u2713"}
            </div>
            <div className="text-xs">{dsr.interpretation}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Observed Sharpe</div>
            <div className="stat-value text-base font-mono">{fmt(dsr.observed_sharpe, 4)}</div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Expected Max (H0)</div>
            <div className="stat-value text-base font-mono">{fmt(dsr.expected_max_sharpe, 4)}</div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">P-Value</div>
            <div className="stat-value text-base font-mono">{fmt(dsr.p_value, 4)}</div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">N Trials</div>
            <div className="stat-value text-base font-mono">{dsr.n_trials ?? "\u2014"}</div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Sample Length</div>
            <div className="stat-value text-base font-mono">
              {dsr.sample_length?.toLocaleString() ?? "\u2014"}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-lg p-2">
            <div className="stat-title text-[10px]">Threshold</div>
            <div className="stat-value text-base font-mono">
              {dsr.is_significant != null ? (dsr.is_significant ? "P < 0.05" : "P >= 0.05") : "\u2014"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bootstrap CI Table ───────────────────────────────────────────────────

function BootstrapCITable({ bootstrapCI }) {
  if (!bootstrapCI || Object.keys(bootstrapCI).length === 0) return null;

  const metrics = Object.entries(bootstrapCI);
  if (metrics.length === 0) return null;

  // Metric display config
  const metricLabels = {
    sharpe_ratio: "Sharpe Ratio",
    win_rate: "Win Rate",
    profit_factor: "Profit Factor",
    max_drawdown: "Max Drawdown",
  };

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-info/15 flex items-center justify-center">
            <span className="text-xs">📐</span>
          </div>
          <h4 className="font-semibold text-sm">Bootstrap Confidence Intervals</h4>
          <span className="badge badge-xs badge-ghost">Phase 6B</span>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="text-right">Point Est.</th>
                <th className="text-right">Percentile CI</th>
                <th className="text-right">SE</th>
                <th className="text-right">Block CI</th>
                <th className="text-right">SE</th>
                <th className="text-right">Level</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([key, ci]) => {
                const pctCI = ci.percentile_ci || ci.percentile || {};
                const blockCI = ci.circular_block_ci || ci.circular_block || {};
                const label = metricLabels[key] || key.replace(/_/g, " ");

                return (
                  <tr key={key}>
                    <td className="font-medium">{label}</td>
                    <td className="text-right font-mono">
                      {fmt(ci.point_estimate, 4)}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {pctCI.lower != null ? (
                        <span>
                          [{fmt(pctCI.lower, 3)}, {fmt(pctCI.upper, 3)}]
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {pctCI.se != null ? fmt(pctCI.se, 4) : "\u2014"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {blockCI.lower != null ? (
                        <span>
                          [{fmt(blockCI.lower, 3)}, {fmt(blockCI.upper, 3)}]
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {blockCI.se != null ? fmt(blockCI.se, 4) : "\u2014"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {fmtPct(ci.confidence_level, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {metrics.map(([key, ci]) => {
            const pctCI = ci.percentile_ci || ci.percentile || {};
            const blockCI = ci.circular_block_ci || ci.circular_block || {};
            const label = metricLabels[key] || key.replace(/_/g, " ");
            return (
              <div key={key} className="card bg-base-300/50 p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-sm">{label}</span>
                  <span className="badge badge-xs badge-ghost">{fmtPct(ci.confidence_level, 0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-base-content/50">Point Est.:</span> <span className="font-mono">{fmt(ci.point_estimate, 4)}</span></div>
                  <div><span className="text-base-content/50">Pct CI:</span> <span className="font-mono text-xs">{pctCI.lower != null ? `[${fmt(pctCI.lower, 3)}, ${fmt(pctCI.upper, 3)}]` : "\u2014"}</span></div>
                  <div><span className="text-base-content/50">Pct SE:</span> <span className="font-mono text-xs">{pctCI.se != null ? fmt(pctCI.se, 4) : "\u2014"}</span></div>
                  <div><span className="text-base-content/50">Block CI:</span> <span className="font-mono text-xs">{blockCI.lower != null ? `[${fmt(blockCI.lower, 3)}, ${fmt(blockCI.upper, 3)}]` : "\u2014"}</span></div>
                  <div><span className="text-base-content/50">Block SE:</span> <span className="font-mono text-xs">{blockCI.se != null ? fmt(blockCI.se, 4) : "\u2014"}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-base-content/40 mt-2">
          Percentile = basic percentile bootstrap; Block = circular block bootstrap
          (preserves autocorrelation).
        </div>
      </div>
    </div>
  );
}

// ── Multiple Testing Card ────────────────────────────────────────────────

function MultipleTestingCard({ multipleTesting }) {
  if (!multipleTesting) return null;

  const corrections = multipleTesting.corrections || multipleTesting;
  const summary = multipleTesting.summary;

  // Build rows from whichever structure is available
  const methods = [];
  if (corrections.bonferroni) methods.push({ key: "bonferroni", label: "Bonferroni", data: corrections.bonferroni });
  if (corrections.holm_bonferroni) methods.push({ key: "holm_bonferroni", label: "Holm-Bonferroni", data: corrections.holm_bonferroni });
  if (corrections.benjamini_hochberg) methods.push({ key: "benjamini_hochberg", label: "Benjamini-Hochberg", data: corrections.benjamini_hochberg });

  // If no corrections object but we have method fields directly
  if (methods.length === 0 && multipleTesting.method) {
    methods.push({ key: multipleTesting.method, label: multipleTesting.method, data: multipleTesting });
  }

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
            <span className="text-xs">🧪</span>
          </div>
          <h4 className="font-semibold text-sm">Multiple Testing Corrections</h4>
          <span className="badge badge-xs badge-ghost">Phase 6C</span>
        </div>

        {/* Summary row */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="stat-title text-[10px]">Raw Significant</div>
              <div className="stat-value text-base font-mono">{summary.raw_significant ?? "\u2014"}</div>
            </div>
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="stat-title text-[10px]">Bonferroni</div>
              <div className="stat-value text-base font-mono">{summary.bonferroni_significant ?? "\u2014"}</div>
            </div>
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="stat-title text-[10px]">Holm</div>
              <div className="stat-value text-base font-mono">{summary.holm_significant ?? "\u2014"}</div>
            </div>
            <div className="stat bg-base-100 rounded-lg p-2">
              <div className="stat-title text-[10px]">BH-FDR</div>
              <div className="stat-value text-base font-mono">{summary.bh_fdr_significant ?? "\u2014"}</div>
            </div>
          </div>
        )}

        {/* Methods table */}
        {methods.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th className="text-right">N Tests</th>
                    <th className="text-right">Alpha</th>
                    <th className="text-right">N Significant</th>
                    <th className="text-right">Adjusted P-Values</th>
                    {methods.some((m) => m.data.fdr_threshold != null) && (
                      <th className="text-right">FDR Threshold</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {methods.map(({ key, label, data }) => (
                    <tr key={key}>
                      <td className="font-medium">{label}</td>
                      <td className="text-right font-mono">{data.n_tests ?? "\u2014"}</td>
                      <td className="text-right font-mono">{data.alpha ?? "\u2014"}</td>
                      <td className="text-right font-mono">
                        {data.n_significant ?? data.significant_count ?? "\u2014"}
                      </td>
                      <td className="text-right font-mono text-xs">
                        {(data.adjusted_p_values || data.corrected_p_values || [])
                          .slice(0, 5)
                          .map((p, i) => fmt(p, 3))
                          .join(", ")}
                        {(data.adjusted_p_values || data.corrected_p_values || []).length > 5 &&
                          ` +${(data.adjusted_p_values || data.corrected_p_values).length - 5} more`}
                      </td>
                      {methods.some((m) => m.data.fdr_threshold != null) && (
                        <td className="text-right font-mono text-xs">
                          {data.fdr_threshold != null ? fmt(data.fdr_threshold, 3) : "\u2014"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {methods.map(({ key, label, data }) => (
                <div key={key} className="card bg-base-300/50 p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-sm">{label}</span>
                    <span className="badge badge-xs badge-ghost">{data.n_tests ?? "\u2014"} tests</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div><span className="text-base-content/50">Alpha:</span> <span className="font-mono">{data.alpha ?? "\u2014"}</span></div>
                    <div><span className="text-base-content/50">Significant:</span> <span className={`font-mono font-bold ${(data.n_significant ?? data.significant_count ?? 0) > 0 ? "text-success" : "text-error"}`}>{data.n_significant ?? data.significant_count ?? "\u2014"}</span></div>
                    {(data.adjusted_p_values || data.corrected_p_values || []).length > 0 && (
                      <div className="col-span-2">
                        <span className="text-base-content/50">Adj. P-Values:</span>{" "}
                        <span className="font-mono text-xs">
                          {(data.adjusted_p_values || data.corrected_p_values || [])
                            .slice(0, 3)
                            .map((p, i) => fmt(p, 3))
                            .join(", ")}
                          {(data.adjusted_p_values || data.corrected_p_values || []).length > 3 &&
                            ` +${(data.adjusted_p_values || data.corrected_p_values).length - 3} more`}
                        </span>
                      </div>
                    )}
                    {data.fdr_threshold != null && (
                      <div><span className="text-base-content/50">FDR Threshold:</span> <span className="font-mono">{fmt(data.fdr_threshold, 3)}</span></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {summary?.interpretation && (
          <div className="text-xs text-base-content/60 mt-2">{summary.interpretation}</div>
        )}
      </div>
    </div>
  );
}

// ── Significance Tests Card ──────────────────────────────────────────────

function SignificanceTestsCard({ significanceTests }) {
  if (!significanceTests) return null;

  const wrc = significanceTests.whites_reality_check;
  const spa = significanceTests.hansen_spa;
  const consensus = significanceTests.consensus;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
            <span className="text-xs">⚖️</span>
          </div>
          <h4 className="font-semibold text-sm">Significance Tests</h4>
          <span className="badge badge-xs badge-ghost">Phase 6D</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* White's Reality Check */}
          {wrc && (
            <div className="stat bg-base-100 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs font-bold">White&apos;s Reality Check</span>
                {significanceBadge(wrc.is_significant)}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>
                  <span className="text-base-content/50">P-Value:</span>{" "}
                  <span className="font-mono">{fmt(wrc.p_value)}</span>
                </div>
                <div>
                  <span className="text-base-content/50">Statistic:</span>{" "}
                  <span className="font-mono">{fmt(wrc.observed_statistic)}</span>
                </div>
                <div>
                  <span className="text-base-content/50">N Strategies:</span>{" "}
                  <span className="font-mono">{wrc.n_strategies ?? "\u2014"}</span>
                </div>
                <div>
                  <span className="text-base-content/50">Bootstrap:</span>{" "}
                  <span className="font-mono">{wrc.n_bootstrap?.toLocaleString() ?? "\u2014"}</span>
                </div>
                {wrc.best_strategy_mean_excess != null && (
                  <div className="col-span-2">
                    <span className="text-base-content/50">Best Excess Return:</span>{" "}
                    <span className="font-mono">{fmt(wrc.best_strategy_mean_excess)}</span>
                  </div>
                )}
              </div>
              {wrc.interpretation && (
                <div className="text-[10px] text-base-content/50 mt-1">{wrc.interpretation}</div>
              )}
            </div>
          )}

          {/* Hansen's SPA */}
          {spa && (
            <div className="stat bg-base-100 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs font-bold">Hansen&apos;s SPA</span>
                {significanceBadge(spa.is_significant)}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>
                  <span className="text-base-content/50">P-Value:</span>{" "}
                  <span className="font-mono">{fmt(spa.p_value)}</span>
                </div>
                <div>
                  <span className="text-base-content/50">Statistic:</span>{" "}
                  <span className="font-mono">{fmt(spa.observed_statistic)}</span>
                </div>
                <div>
                  <span className="text-base-content/50">N Strategies:</span>{" "}
                  <span className="font-mono">{spa.n_strategies ?? "\u2014"}</span>
                </div>
                <div>
                  <span className="text-base-content/50">Bootstrap:</span>{" "}
                  <span className="font-mono">{spa.n_bootstrap?.toLocaleString() ?? "\u2014"}</span>
                </div>
              </div>
              {spa.interpretation && (
                <div className="text-[10px] text-base-content/50 mt-1">{spa.interpretation}</div>
              )}
            </div>
          )}
        </div>

        {/* Consensus */}
        {consensus && (
          <div
            className={`alert ${
              consensus.both_significant
                ? "alert-success"
                : consensus.either_significant
                ? "alert-warning"
                : "alert-error"
            } alert-sm mt-3`}
          >
            <div>
              <div className="font-bold text-xs">
                Consensus:{" "}
                {consensus.both_significant
                  ? "Both tests significant"
                  : consensus.either_significant
                  ? "Mixed results"
                  : "No significance detected"}
              </div>
              {consensus.recommendation && (
                <div className="text-xs">{consensus.recommendation}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────

export default function StatisticalRigorPanel({
  bootstrapCI,
  dsr,
  multipleTesting,
  significanceTests,
}) {
  const hasAnyData = bootstrapCI || dsr || multipleTesting || significanceTests;

  if (!hasAnyData) {
    return (
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-4 text-center text-base-content/50">
          <span className="text-2xl">🔬</span>
          <p className="text-sm mt-2">No statistical rigor data available</p>
          <p className="text-xs text-base-content/30">
            Run a backtest with Phase 6 parameters enabled to see DSR, bootstrap CIs,
            multiple testing corrections, and significance tests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DSRDetailCard dsr={dsr} />
      <BootstrapCITable bootstrapCI={bootstrapCI} />
      <MultipleTestingCard multipleTesting={multipleTesting} />
      <SignificanceTestsCard significanceTests={significanceTests} />
    </div>
  );
}
