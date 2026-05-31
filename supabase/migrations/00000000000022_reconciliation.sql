-- ============================================================
-- Noble Trader — Migration 22: Reconciliation Results
-- P3-5C: Reconciliation Engine persistence + auto-recon config
-- ============================================================

-- Reconciliation results table
-- Stores the outcome of each reconciliation run
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning')),
  total_expected INTEGER NOT NULL DEFAULT 0,
  total_filled INTEGER NOT NULL DEFAULT 0,
  match_rate DECIMAL(5,2),
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  phantom_count INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-reconciliation configuration table
-- Per-user setting for automatic daily reconciliation
CREATE TABLE IF NOT EXISTS reconciliation_auto_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  run_time TEXT NOT NULL DEFAULT '16:05',  -- HH:MM in ET
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_auto_config ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on reconciliation_results" ON reconciliation_results
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reconciliation_auto_config" ON reconciliation_auto_config
  FOR ALL USING (true) WITH CHECK (true);

-- Users can read own results
CREATE POLICY "Users can read own reconciliation results" ON reconciliation_results
  FOR SELECT USING (true);

-- Users can read own auto config
CREATE POLICY "Users can read own auto recon config" ON reconciliation_auto_config
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recon_results_user_date ON reconciliation_results (user_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_recon_results_status ON reconciliation_results (status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_recon_results_created_at ON reconciliation_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_auto_config_user ON reconciliation_auto_config (user_id);

-- Auto-update updated_at trigger for reconciliation_auto_config
DROP TRIGGER IF EXISTS trg_recon_auto_config_updated_at ON reconciliation_auto_config;
CREATE TRIGGER trg_recon_auto_config_updated_at
  BEFORE UPDATE ON reconciliation_auto_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE reconciliation_results IS 'Stores reconciliation run results for trade verification. P3-5C.';
COMMENT ON TABLE reconciliation_auto_config IS 'Per-user auto-reconciliation settings. When enabled, reconciliation runs automatically at market close.';
