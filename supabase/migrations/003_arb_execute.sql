-- =============================================
-- Arb Execution Support
-- =============================================

-- Add missing columns to arb_opportunities for execution tracking
ALTER TABLE arb_opportunities ADD COLUMN IF NOT EXISTS combined_price NUMERIC(5, 4);
ALTER TABLE arb_opportunities ADD COLUMN IF NOT EXISTS potential_return NUMERIC(10, 4);
ALTER TABLE arb_opportunities ADD COLUMN IF NOT EXISTS direction TEXT;

-- Add notes and arb_opportunity_id to trades for linking arb pairs
ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS arb_opportunity_id UUID REFERENCES arb_opportunities(id);
CREATE INDEX IF NOT EXISTS idx_trades_arb_opportunity ON trades(arb_opportunity_id) WHERE arb_opportunity_id IS NOT NULL;

-- Allow 'arb-execute' as a pipeline_runs stage
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_stage_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_stage_check
  CHECK (stage IN ('scan', 'research', 'predict', 'execute', 'arb-execute', 'compound', 'health'));
