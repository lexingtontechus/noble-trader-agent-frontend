-- Circuit Breaker System (P3-5A)
-- Tables for circuit breaker configuration and trading halt state tracking

CREATE TABLE IF NOT EXISTS circuit_breakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  breaker_type TEXT NOT NULL CHECK (breaker_type IN (
    'max_position_size',      -- Max $ value per position
    'max_portfolio_heat',     -- Max total portfolio risk %
    'daily_loss_limit',       -- Max daily loss $ or %
    'max_drawdown',           -- Max drawdown % from peak
    'consecutive_loss_stop',  -- Halt after N consecutive losses
    'max_open_positions',     -- Max concurrent open positions
    'order_rate_limit',       -- Max orders per minute
    'sector_concentration',   -- Max % in single sector
    'single_stock_concentration' -- Max % in single stock
  )),
  threshold_value DOUBLE PRECISION NOT NULL,
  threshold_unit TEXT NOT NULL DEFAULT 'percent' CHECK (threshold_unit IN ('percent', 'dollars', 'count')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  action TEXT NOT NULL DEFAULT 'halt' CHECK (action IN ('reject_order', 'halt', 'alert')),
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, breaker_type)
);

-- Halt state tracking (persists across server restarts)
CREATE TABLE IF NOT EXISTS trading_halts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('global_halt', 'user_halt', 'symbol_halt')),
  scope TEXT NOT NULL,  -- user_id or symbol or 'global'
  reason TEXT NOT NULL CHECK (reason IN ('manual', 'circuit_breaker', 'max_drawdown', 'data_feed_error', 'compliance', 'reconciliation_failure', 'daily_loss_limit', 'consecutive_loss_stop', 'rate_limit')),
  triggered_by TEXT,  -- breaker_type that triggered it
  metadata JSONB DEFAULT '{}',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- RLS
ALTER TABLE circuit_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_halts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON circuit_breakers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON trading_halts FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own breakers" ON circuit_breakers FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "Users can manage own breakers" ON circuit_breakers FOR ALL USING (auth.jwt() ->> 'sub' = user_id) WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can read active halts" ON trading_halts FOR SELECT USING (is_active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_circuit_breakers_user ON circuit_breakers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trading_halts_active ON trading_halts(level, scope, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_trading_halts_user_active ON trading_halts(scope, is_active) WHERE is_active = true AND level = 'user_halt';

-- Auto-update updated_at trigger for circuit_breakers
DROP TRIGGER IF EXISTS trg_circuit_breakers_updated_at ON circuit_breakers;
CREATE TRIGGER trg_circuit_breakers_updated_at
  BEFORE UPDATE ON circuit_breakers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
