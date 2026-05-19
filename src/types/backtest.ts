// ── Renko Backtest Type Contracts ──────────────────────────────────────
// These interfaces define the data contract between the FastAPI backend
// and the Next.js BFF/frontend. They mirror the Pydantic models in
// renko/router.py and the dataclasses in renko/trade_journal.py.

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
}

export interface RenkoBacktestResponse {
  symbol: string;
  total_ticks: number;
  total_bricks: number;
  config_used: RenkoConfig;
  stats: BacktestJournalStats;
  trades: TradeRecord[];
  cached: boolean;
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
}

export interface RenkoBacktestOptimizeResponse {
  results: OptimizeResultRow[];
  best_by_sharpe: OptimizeResultRow | null;
  best_by_return: OptimizeResultRow | null;
  n_combinations: number;
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
