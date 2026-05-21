-- ============================================================
-- Noble Trader — Migration 06: Renko Snapshot Persistence
-- Stores warm-up results per symbol for instant cache loading.
-- ============================================================

CREATE TABLE IF NOT EXISTS ta_renko_snapshot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  brick_size FLOAT NOT NULL DEFAULT 0.5,
  prices_fed INT NOT NULL DEFAULT 0,
  total_bricks INT NOT NULL DEFAULT 0,
  total_trades INT NOT NULL DEFAULT 0,
  total_pnl_bricks FLOAT NOT NULL DEFAULT 0,
  bricks JSONB NOT NULL DEFAULT '[]'::jsonb,
  classified JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  trades JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_range JSONB NOT NULL DEFAULT '{"min":0,"max":0}'::jsonb,
  period TEXT NOT NULL DEFAULT '6mo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, brick_size)
);

-- RLS
ALTER TABLE ta_renko_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to renko snapshots" ON ta_renko_snapshot
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups by symbol
CREATE INDEX IF NOT EXISTS idx_renko_snapshot_symbol ON ta_renko_snapshot(symbol);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_renko_snapshot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS renko_snapshot_updated_at ON ta_renko_snapshot;
CREATE TRIGGER renko_snapshot_updated_at
  BEFORE UPDATE ON ta_renko_snapshot
  FOR EACH ROW EXECUTE FUNCTION update_renko_snapshot_updated_at();
