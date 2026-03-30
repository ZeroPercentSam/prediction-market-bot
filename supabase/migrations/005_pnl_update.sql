-- =============================================
-- P&L Update Job Support
-- =============================================

-- Allow 'pnl-update' as a pipeline_runs stage
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_stage_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_stage_check
  CHECK (stage IN ('scan', 'research', 'predict', 'execute', 'arb-execute', 'certainty-scan', 'pnl-update', 'compound', 'health'));
