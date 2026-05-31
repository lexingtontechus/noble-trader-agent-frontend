-- Migration 23: Smoke Test Results Table
-- P3-5E: Paper Trading E2E Smoke Test
-- Stores results from comprehensive end-to-end smoke tests

CREATE TABLE IF NOT EXISTS smoke_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  overall TEXT NOT NULL CHECK (overall IN ('pass', 'fail', 'partial')),
  tests JSONB NOT NULL DEFAULT '[]',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_user_id ON smoke_test_results (user_id);

-- Index for sorting by most recent
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_created_at ON smoke_test_results (created_at DESC);

-- Index for filtering by overall status
CREATE INDEX IF NOT EXISTS idx_smoke_test_results_overall ON smoke_test_results (overall);

-- RLS: Users can only see their own results
ALTER TABLE smoke_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY smoke_test_results_select ON smoke_test_results
  FOR SELECT USING (true); -- Service role handles auth filtering; viewer+ can see their own via BFF

CREATE POLICY smoke_test_results_insert ON smoke_test_results
  FOR INSERT WITH CHECK (true); -- Inserted via service role from BFF

-- Add comment
COMMENT ON TABLE smoke_test_results IS 'P3-5E: Stores results from paper trading E2E smoke tests';
