// ── Renko Backtest Type Contracts ──────────────────────────────────────
// These interfaces define the data contract between the FastAPI backend
// and the Next.js BFF/frontend. They mirror the Pydantic models in
// renko/router.py and the dataclasses in renko/trade_journal.py.

export type UniverseMode = "current_constituents" | "pit_constituents";
export type PriceAdjustment = "raw" | "split_adjusted" | "fully_adjusted";

export interface SurvivorshipBiasInfo {
  mode: UniverseMode;
  warning: boolean;
  message: string;
  index_name?: string | null;
}

export interface CorporateActionAdjustment {
  type: "split" | "dividend" | "spinoff";
  ex_date: string;
  factor?: number;
  amount?: number;
  description: string;
  indices_affected: number;
}

export interface LookAheadAuditResult {
  enabled: boolean;
  clean: boolean;
  warning_count: number;
  warnings: Array<{
    data_name: string;
    current_tick: number;
    accessed_tick: number;
    look_ahead_by: number;
    context: string;
  }>;
  access_count: number;
  message: string;
}

export interface DataSourceMetadata {
  source: string;
  symbol: string;
  price_count: number;
  price_adjustment: PriceAdjustment;
  universe_mode: UniverseMode;
  index_name?: string | null;
  fetch_date: string;
}

// ── Enums ──────────────────────────────────────────────────────────────

export type BrickSizeMode = "fixed" | "atr" | "dynamic";
export type OrderType = "market" | "limit";
export type OcoPriority = "sl_first" | "tp_first" | "worst_case";
export type PositionStatus =
  | "open"
  | "closed_tp"
  | "closed_sl"
  | "closed_sl_gap"
  | "closed_trail"
  | "closed_time"
  | "closed_manual"
  | "closed_oco_sl"
  | "closed_oco_tp";
export type SignalDirection = "LONG" | "SHORT";
export type PatternType =
  | "bull_run"
  | "bear_run"
  | "reversal"
  | "double_top"
  | "double_bottom"
  | "consolidation_break";

// ── Config ─────────────────────────────────────────────────────────────

export interface RenkoConfig {
  brick_size: number;
  brick_size_mode: BrickSizeMode;
  reversal_bricks: number;
  bull_trigger_n: number;
  bear_trigger_n: number;
  sl_bricks: number;
  tp_bricks: number;
  trailing_stop: boolean;
  trail_after_bricks: number;
  trail_distance_bricks: number;
  max_trades_per_session: number;
  max_daily_loss_bricks: number;
  max_consecutive_losses: number;
  cooldown_seconds: number;
  regime_gate: boolean;
  slippage_bps: number;
  commission_bps: number;
  spread_bps: number;
  oco_priority: OcoPriority;
  initial_capital: number;
  symbol: string;
}

// ── Trade ──────────────────────────────────────────────────────────────

export interface TradeRecord {
  trade_id: string;
  symbol: string;
  direction: SignalDirection;
  pattern_type: PatternType;
  entry_price: number;
  exit_price: number;
  entry_ts: number;
  exit_ts: number;
  pnl_bricks: number;
  pnl_dollars: number;
  gross_pnl_dollars: number;
  status: PositionStatus;
  bricks_held: number;
  signal_strength: number;
  regime?: string | null;
  regime_aligned: boolean;
  kelly_fraction: number;
  velocity: number;
  label_sequence: string[];
  filters_passed: string[];
  commission: number;
  slippage_cost: number;
  total_cost: number;
  entry_slippage: number;
  exit_slippage: number;
  net_pnl_dollars: number;
}

// ── Stats ──────────────────────────────────────────────────────────────

export interface DollarStats {
  initial_capital: number;
  total_pnl_dollars: number;
  total_gross_pnl_dollars: number;
  avg_pnl_dollars: number;
  avg_win_dollars: number;
  avg_loss_dollars: number;
  max_drawdown_dollars: number;
  return_pct: number;
  sharpe_dollars: number;
  profit_factor_dollars: number;
  equity_curve_dollars: number[];
}

export interface CostSummaryByExitType {
  count: number;
  commission: number;
  slippage: number;
  total_cost: number;
}

export interface CostSummary {
  total_commission: number;
  total_slippage_cost: number;
  total_transaction_costs: number;
  total_gross_pnl_dollars: number;
  total_net_pnl_dollars: number;
  cost_drag_pct: number;
  avg_cost_per_trade: number;
  by_exit_type: Record<string, CostSummaryByExitType>;
}

export interface RegimeBreakdown {
  count: number;
  wins: number;
  pnl_bricks: number;
  pnl_dollars: number;
  commission: number;
  slippage: number;
  total_cost: number;
  win_rate: number;
  avg_pnl_bricks: number;
  avg_pnl_dollars: number;
  return_pct: number;
}

export interface PatternBreakdown {
  count: number;
  win_rate: number;
  avg_pnl_bricks: number;
  total_pnl_dollars: number;
  avg_pnl_dollars: number;
}

export interface DirectionBreakdown {
  count: number;
  win_rate: number;
  avg_pnl: number;
  total_pnl_dollars: number;
}

export interface KellyInputs {
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  implied_kelly: number;
}

export interface BacktestJournalStats {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  total_pnl_bricks: number;
  avg_pnl_bricks: number;
  avg_win_bricks: number;
  avg_loss_bricks: number;
  max_drawdown_bricks: number;
  sharpe_estimate: number;
  avg_bricks_held: number;
  avg_duration_seconds: number;
  dollar_stats: DollarStats;
  by_pattern: Record<string, PatternBreakdown>;
  by_direction: {
    long: DirectionBreakdown;
    short: DirectionBreakdown;
  };
  by_regime: Record<string, RegimeBreakdown>;
  rolling_win_rate_20: number;
  kelly_inputs: KellyInputs;
  cost_summary: CostSummary;
}

// ── Request/Response ───────────────────────────────────────────────────

export interface RenkoBacktestRequest {
  prices: number[];
  symbol: string;
  brick_size: number;
  brick_size_mode: BrickSizeMode;
  reversal_bricks: number;
  bull_trigger_n: number;
  bear_trigger_n: number;
  sl_bricks: number;
  tp_bricks: number;
  trailing_stop: boolean;
  trail_after_bricks: number;
  trail_distance_bricks: number;
  max_trades_per_session: number;
  max_daily_loss_bricks: number;
  max_consecutive_losses: number;
  cooldown_seconds: number;
  regime_gate: boolean;
  slippage_bps: number;
  commission_bps: number;
  spread_bps: number;
  oco_priority: OcoPriority;
  initial_capital: number;
  timestamps?: number[] | null;
  regimes?: string[] | null;
  signal_confidence_min?: number | null;
  // Phase 5: Data Quality
  universe_mode?: UniverseMode;
  index_name?: string | null;
  price_adjustment?: PriceAdjustment;
  look_ahead_audit?: boolean;
  // Phase 7: Execution Modeling
  enable_market_impact?: boolean;
  avg_daily_volume?: number;
  impact_gamma?: number;
  impact_eta?: number;
  enable_fill_probability?: boolean;
  enable_borrow_costs?: boolean;
  borrow_rate_annual?: number;
  hard_to_borrow?: boolean;
  htb_premium_rate?: number;
  enable_margin_costs?: boolean;
  margin_rate_annual?: number;
  margin_requirement?: number;
}

export interface RenkoBacktestResponse {
  symbol: string;
  total_ticks: number;
  total_bricks: number;
  config_used: RenkoConfig;
  stats: BacktestJournalStats;
  trades: TradeRecord[];
  cached: boolean;
  // Phase 5: Data Quality
  data_hash?: string | null;
  data_source?: DataSourceMetadata;
  survivorship_bias?: SurvivorshipBiasInfo | null;
  price_adjustments_applied?: CorporateActionAdjustment[];
  data_quality_warnings?: string[];
  look_ahead_audit_result?: LookAheadAuditResult | null;
  // Phase 6: Statistical Rigor
  bootstrap_ci?: Record<string, BootstrapCIMetric> | null;
  bootstrap_cis?: Record<string, BootstrapCIMetric> | null;
  deflated_sharpe?: DeflatedSharpeResult | null;
  deflated_sharpe_result?: DeflatedSharpeResult | null;
  significance_tests?: SignificanceTestResults | null;
  // Phase 7: Execution Modeling
  execution_modeling?: ExecutionModelingSummary | null;
  execution_model?: ExecutionModelingSummary | null;
  market_impact?: MarketImpactResult | null;
  fill_probability?: FillProbabilityResult | null;
  financing_costs?: FinancingCostsResult | null;
}

export interface RenkoCompareConfig {
  label: string;
  brick_size: number;
  sl_bricks: number;
  tp_bricks: number;
  trailing_stop: boolean;
  trail_after_bricks: number;
  trail_distance_bricks: number;
  bull_trigger_n: number;
  bear_trigger_n: number;
  regime_gate: boolean;
  max_trades_per_session: number;
  max_daily_loss_bricks: number;
  max_consecutive_losses: number;
  slippage_bps: number;
  commission_bps: number;
  spread_bps: number;
  oco_priority: OcoPriority;
}

export interface RenkoBacktestCompareRequest {
  prices: number[];
  symbol: string;
  configs: RenkoCompareConfig[];
  timestamps?: number[] | null;
  regimes?: string[] | null;
}

export interface RenkoBacktestCompareResponse {
  comparisons: RenkoBacktestResponse[];
  diff: Record<string, { first: number; best: number; delta: number | null }>;
}

export interface RenkoBacktestOptimizeRequest {
  prices: number[];
  symbol: string;
  param_grid: Record<string, number[]>;
  brick_size: number;
  sl_bricks: number;
  tp_bricks: number;
  regime_gate: boolean;
  slippage_bps: number;
  commission_bps: number;
  spread_bps: number;
  oco_priority: OcoPriority;
  [key: string]: unknown; // Additional fixed params
}

export interface OptimizeResultRow {
  params: Record<string, number>;
  total_pnl_bricks: number;
  win_rate: number;
  sharpe_estimate: number;
  profit_factor: number;
  max_drawdown_bricks: number;
  total_trades: number;
  raw_p_value?: number;
}

export interface RenkoBacktestOptimizeResponse {
  results: OptimizeResultRow[];
  best_by_sharpe: OptimizeResultRow | null;
  best_by_return: OptimizeResultRow | null;
  n_combinations: number;
  deflated_sharpe?: DeflatedSharpeResult | null;
  deflated_sharpe_result?: DeflatedSharpeResult | null;
  multiple_testing?: MultipleTestingResults | null;
  multiple_testing_results?: MultipleTestingResults | null;
  significance_tests?: SignificanceTestResults | null;
  significance_test_results?: Record<string, SignificanceTestResult> | null;
}

// ── Phase 6: Statistical Rigor ────────────────────────────────────────

export interface BootstrapCIMethod {
  lower: number;
  upper: number;
  se?: number;
}

export interface BootstrapCIMetric {
  point_estimate: number;
  percentile_ci?: BootstrapCIMethod;
  percentile?: BootstrapCIMethod;
  circular_block_ci?: BootstrapCIMethod;
  circular_block?: BootstrapCIMethod;
  confidence_level: number;
  _display?: Record<string, string>;
}

export interface BootstrapCIResult {
  metric: string;
  point_estimate: number;
  ci_lower: number;
  ci_upper: number;
  confidence_level: number;
  method: string;
  n_resamples: number;
}

export interface DeflatedSharpeResult {
  dsr: number;
  observed_sharpe: number;
  expected_max_sharpe: number;
  variance_of_sharpe?: number;
  n_trials: number;
  sample_length: number;
  skewness?: number;
  kurtosis?: number;
  is_significant: boolean;
  significance_level?: number;
  p_value?: number;
  interpretation?: string;
}

export interface MultipleTestingMethod {
  method: string;
  corrected_p_values?: number[];
  adjusted_p_values?: number[];
  significant_count?: number;
  n_significant?: number;
  alpha: number;
  n_tests: number;
  is_significant?: boolean[];
  fdr_threshold?: number;
}

export interface MultipleTestingSummary {
  raw_significant: number;
  bonferroni_significant: number;
  holm_significant: number;
  bh_fdr_significant: number;
  interpretation?: string;
}

export interface MultipleTestingResults {
  bonferroni?: MultipleTestingMethod;
  holm_bonferroni?: MultipleTestingMethod;
  benjamini_hochberg?: MultipleTestingMethod;
  corrections?: {
    bonferroni?: MultipleTestingMethod;
    holm_bonferroni?: MultipleTestingMethod;
    benjamini_hochberg?: MultipleTestingMethod;
  };
  raw_p_values?: number[];
  n_raw_significant?: number;
  summary?: MultipleTestingSummary;
}

export interface SignificanceTestResult {
  test_name?: string;
  test?: string;
  statistic?: number;
  observed_statistic?: number;
  p_value: number;
  is_significant: boolean;
  n_bootstrap?: number;
  n_strategies?: number;
  n_periods?: number;
  best_strategy_index?: number;
  best_strategy_mean_excess?: number;
  interpretation?: string;
}

export interface SignificanceTestResults {
  whites_reality_check?: SignificanceTestResult;
  hansen_spa?: SignificanceTestResult;
  consensus?: {
    both_significant: boolean;
    either_significant: boolean;
    recommendation?: string;
  };
}

// ── Phase 7: Execution Modeling ───────────────────────────────────────

export interface MarketImpactResult {
  participation_rate?: number;
  permanent_impact_bps?: number;
  temporary_impact_bps?: number;
  total_impact_bps?: number;
  impact_cost_dollars?: number;
  impact_cost_pct?: number;
}

export interface MarketImpactSummary {
  total_impact_cost_dollars: number;
  avg_impact_bps_per_trade: number;
  impact_enabled: boolean;
}

export interface FillProbabilityResult {
  fill_probability?: number;
  order_type?: string;
  distance_from_mid_pct?: number;
  distance_in_sigmas?: number;
  expected_fill_price_offset_bps?: number;
  interpretation?: string;
}

export interface FillProbabilitySummary {
  avg_fill_probability: number;
  fill_probability_enabled: boolean;
}

export interface BorrowCostResult {
  daily_borrow_cost?: number;
  total_borrow_cost?: number;
  effective_annual_rate_bps?: number;
  is_hard_to_borrow?: boolean;
  holding_days?: number;
  position_notional?: number;
}

export interface MarginCostResult {
  daily_margin_cost?: number;
  total_margin_cost?: number;
  margin_rate_bps?: number;
  holding_days?: number;
  borrowed_amount?: number;
}

export interface DividendCostResult {
  daily_dividend_cost?: number;
  total_dividend_cost?: number;
  dividend_yield_bps?: number;
  prob_ex_dividend_during_hold?: number;
}

export interface FinancingCostsResult {
  direction?: string;
  position_notional?: number;
  holding_days?: number;
  total_financing_cost?: number;
  daily_financing_cost?: number;
  financing_cost_bps_daily?: number;
  components?: {
    borrow?: BorrowCostResult;
    margin?: MarginCostResult;
    dividend?: DividendCostResult;
  };
}

export interface FinancingSummary {
  total_borrow_cost: number;
  total_margin_cost: number;
  total_dividend_cost: number;
  total_financing_cost: number;
  long_trades: number;
  short_trades: number;
  avg_borrow_rate_annual: number;
  avg_margin_rate_annual: number;
}

export interface ExecutionModelingSummary {
  market_impact: MarketImpactSummary;
  fill_probability: FillProbabilitySummary;
  financing: FinancingSummary;
  all_models_enabled: boolean;
}

export interface ExecutionModelDetail {
  market_impact?: MarketImpactResult;
  fill_probability?: FillProbabilityResult;
  financing_costs?: FinancingCostsResult;
  execution_modeling?: ExecutionModelingSummary;
}

// Walk-Forward
export interface WalkForwardWindow {
  window: number;
  is_range: [number, number];
  oos_range: [number, number];
  is_stats: BacktestJournalStats;
  oos_stats: BacktestJournalStats;
  is_total_pnl_bricks: number;
  oos_total_pnl_bricks: number;
  is_sharpe: number;
  oos_sharpe: number;
  is_trades: number;
  oos_trades: number;
}

export interface WalkForwardAggregate {
  total_windows: number;
  total_oos_trades: number;
  avg_oos_pnl_bricks: number;
  avg_is_pnl_bricks: number;
  avg_oos_sharpe: number;
  avg_oos_win_rate: number;
  degradation_ratio: number;
}

export interface RenkoWalkForwardResponse {
  windows: WalkForwardWindow[];
  aggregate: WalkForwardAggregate;
  config_used: RenkoConfig;
  total_ticks: number;
}

// Monte Carlo
export interface MonteCarloConfidenceBands {
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  original: number[];
}

export interface RenkoMonteCarloResponse {
  original: BacktestJournalStats;
  confidence_bands: MonteCarloConfidenceBands;
  dollar_bands: Record<string, number>;
  original_total_pnl_bricks: number;
  original_total_pnl_dollars: number;
  p_profitable: number;
  p_beat_original: number;
  p5_final_pnl: number;
  p95_final_pnl: number;
  mean_final_pnl: number;
  simulation_count: number;
  n_trades: number;
  config_used: RenkoConfig;
}
