/**
 * TypeScript type definitions for P&L Dashboard data.
 *
 * Mirrors the Pydantic models defined in:
 *   - regime_platform/routers/pnl.py (IntradayPnlResponse, HistoricalPnlResponse, AlertThresholdResponse)
 *   - regime_platform/models/schemas.py (RiskDashboardResponse)
 *   - regime_platform/services/alpaca_stream.py (SSE event types)
 */

// ─── Risk Dashboard ──────────────────────────────────────────────────────────

export interface RiskDashboardResponse {
  total_return: number;
  total_return_pct: number;
  annual_return_pct: number;
  daily_return_avg: number;
  annual_vol: number;
  downside_vol: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  current_drawdown: number;
  current_drawdown_pct: number;
  avg_drawdown: number;
  var_95: number;
  var_99: number;
  cvar_95: number;
  cvar_99: number;
  win_days: number;
  loss_days: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  n_data_points: number;
  period_days: number;
  start_equity: number;
  end_equity: number;
  computed_at: string;
}

// ─── Intraday P&L ────────────────────────────────────────────────────────────

export interface IntradayBucket {
  timestamp: number;
  date: string;
  equity: number;
  pnl: number;
  pnl_pct: number;
}

export interface IntradayPnlResponse {
  timeframe: string;
  period: string;
  buckets: IntradayBucket[];
  count: number;
}

// ─── Historical P&L ──────────────────────────────────────────────────────────

export interface HistoricalPnlResponse {
  period: string;
  timestamps: number[];
  equity: number[];
  pnl: number[];
  pnl_pct: number[];
  cumulative_pnl: number[];
  drawdown: number[];
  drawdown_pct: number[];
  dates: string[];
  start_equity: number;
  end_equity: number;
}

// ─── Alert Thresholds ────────────────────────────────────────────────────────

export type AlertMetric = "day_pnl" | "unrealized_pnl" | "drawdown_pct" | "var_breach" | "equity_change_pct";
export type AlertOperator = "lt" | "gt" | "lte" | "gte" | "crosses_below" | "crosses_above";
export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertThresholdResponse {
  id: string;
  user_id: string;
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
  severity: AlertSeverity;
  enabled: boolean;
  cooldown_minutes: number;
  created_at: number;
  last_triggered: number;
}

export interface AlertThresholdRequest {
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
  severity?: AlertSeverity;
  enabled?: boolean;
  cooldown_minutes?: number;
}

// ─── SSE Event Types ─────────────────────────────────────────────────────────

export interface PositionUpdateEvent {
  event: "position_update";
  timestamp: number;
  data: {
    symbol: string;
    qty: string;
    side: string;
    avg_entry_price: string;
    current_price: string;
    market_value: string;
    unrealized_pl: string;
    unrealized_plpc: string;
  };
}

export interface PriceTickEvent {
  event: "price_tick";
  timestamp: number;
  data: {
    symbol: string;
    price: string;
    bid: string;
    ask: string;
    volume: number;
  };
}

export interface PnlSnapshotEvent {
  event: "pnl_snapshot";
  timestamp: number;
  data: {
    total_unrealized_pnl: number;
    total_unrealized_pnl_pc: number;
    total_market_value: number;
    day_pnl: number;
    day_pnl_pc: number;
    positions_count: number;
  };
}

export interface AccountUpdateEvent {
  event: "account_update";
  timestamp: number;
  data: {
    equity: string;
    cash: string;
    buying_power: string;
    long_market_value: string;
    short_market_value: string;
    last_equity: string;
  };
}

export interface PnlAlertEvent {
  event: "pnl_alert";
  timestamp: number;
  data: {
    alert_id: string;
    metric: string;
    operator: string;
    threshold_value: number;
    current_value: number;
    severity: AlertSeverity;
    message: string;
  };
}

export interface CredentialsErrorEvent {
  event: "credentials_error";
  timestamp: number;
  data: {
    reason: string;
    stream_type: "trade" | "data";
  };
}

export interface ConnectedEvent {
  event: "connected";
  timestamp: number;
  data: Record<string, unknown>;
}

export type PnlSSEEvent =
  | PositionUpdateEvent
  | PriceTickEvent
  | PnlSnapshotEvent
  | AccountUpdateEvent
  | PnlAlertEvent
  | CredentialsErrorEvent
  | ConnectedEvent;
