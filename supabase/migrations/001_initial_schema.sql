-- =============================================
-- Prediction Market Bot - Initial Database Schema
-- =============================================

-- Markets table
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('polymarket', 'kalshi')),
  platform_market_id TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  current_yes_price NUMERIC(10, 6) NOT NULL DEFAULT 0,
  current_no_price NUMERIC(10, 6) NOT NULL DEFAULT 0,
  volume_24h NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_volume NUMERIC(18, 2) NOT NULL DEFAULT 0,
  liquidity NUMERIC(18, 2) NOT NULL DEFAULT 0,
  expiry_date TIMESTAMPTZ,
  spread_cents NUMERIC(10, 4) NOT NULL DEFAULT 0,
  price_change_1h NUMERIC(10, 4) NOT NULL DEFAULT 0,
  price_change_24h NUMERIC(10, 4) NOT NULL DEFAULT 0,
  anomaly_flags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_scanned TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_market_id)
);

-- Market price snapshots
CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  yes_price NUMERIC(10, 6) NOT NULL,
  no_price NUMERIC(10, 6) NOT NULL,
  volume NUMERIC(18, 2) NOT NULL DEFAULT 0,
  liquidity NUMERIC(18, 2) NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_snapshots_market_ts ON market_snapshots(market_id, timestamp DESC);

-- Anomalies
CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('price_spike', 'spread_wide', 'volume_surge')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT NOT NULL,
  value NUMERIC(18, 6) NOT NULL,
  threshold NUMERIC(18, 6) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anomalies_market ON anomalies(market_id, detected_at DESC);

-- Research items (individual articles, tweets, etc.)
CREATE TABLE research_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('twitter', 'reddit', 'news', 'rss', 'web')),
  source_url TEXT DEFAULT '',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  sentiment_score NUMERIC(6, 4) NOT NULL DEFAULT 0,
  reliability NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  published_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_items_market ON research_items(market_id, analyzed_at DESC);

-- Research summaries (aggregated per market)
CREATE TABLE research_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  aggregate_sentiment NUMERIC(6, 4) NOT NULL DEFAULT 0,
  sentiment_breakdown JSONB NOT NULL DEFAULT '{"bullish": 0, "bearish": 0, "neutral": 0}',
  source_count INTEGER NOT NULL DEFAULT 0,
  key_themes TEXT[] DEFAULT '{}',
  narrative_gap NUMERIC(6, 4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id)
);

-- Predictions
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  ensemble_probability NUMERIC(10, 6) NOT NULL,
  market_price NUMERIC(10, 6) NOT NULL,
  edge NUMERIC(10, 6) NOT NULL,
  expected_value NUMERIC(10, 6) NOT NULL,
  mispricing_z_score NUMERIC(10, 4) NOT NULL DEFAULT 0,
  confidence_interval NUMERIC(10, 6)[] DEFAULT '{}',
  signal_generated BOOLEAN NOT NULL DEFAULT false,
  signal_direction TEXT CHECK (signal_direction IN ('buy_yes', 'buy_no')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_predictions_market ON predictions(market_id, created_at DESC);
CREATE INDEX idx_predictions_signals ON predictions(signal_generated, created_at DESC) WHERE signal_generated = true;

-- Individual model estimates per prediction
CREATE TABLE model_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (model IN ('claude', 'gpt4o', 'grok', 'gemini', 'deepseek')),
  probability NUMERIC(10, 6) NOT NULL,
  confidence NUMERIC(10, 6) NOT NULL DEFAULT 0,
  reasoning TEXT DEFAULT '',
  weight NUMERIC(6, 4) NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_model_estimates_prediction ON model_estimates(prediction_id);

-- Trade signals
CREATE TABLE trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('buy_yes', 'buy_no')),
  edge NUMERIC(10, 6) NOT NULL,
  expected_value NUMERIC(10, 6) NOT NULL,
  recommended_size NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trade_signals_status ON trade_signals(status, created_at DESC);

-- Trades (executed)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES predictions(id),
  platform TEXT NOT NULL CHECK (platform IN ('polymarket', 'kalshi')),
  direction TEXT NOT NULL CHECK (direction IN ('buy_yes', 'buy_no')),
  entry_price NUMERIC(10, 6) NOT NULL,
  fill_price NUMERIC(10, 6),
  slippage NUMERIC(10, 6),
  position_size NUMERIC(18, 2) NOT NULL,
  position_size_pct NUMERIC(10, 6) NOT NULL,
  kelly_fraction NUMERIC(10, 6) NOT NULL,
  kelly_full_size NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'partial', 'cancelled', 'settled')),
  exit_price NUMERIC(10, 6),
  pnl NUMERIC(18, 2),
  pnl_pct NUMERIC(10, 6),
  classification TEXT CHECK (classification IN ('correct_profitable', 'correct_unprofitable', 'incorrect_prediction', 'edge_disappeared')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trades_status ON trades(status, created_at DESC);
CREATE INDEX idx_trades_market ON trades(market_id, created_at DESC);

-- Risk snapshots
CREATE TABLE risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll NUMERIC(18, 2) NOT NULL,
  daily_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
  daily_pnl_pct NUMERIC(10, 6) NOT NULL DEFAULT 0,
  open_positions INTEGER NOT NULL DEFAULT 0,
  total_exposure NUMERIC(18, 2) NOT NULL DEFAULT 0,
  exposure_by_category JSONB NOT NULL DEFAULT '{}',
  var_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  kill_switch_active BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_snapshots_ts ON risk_snapshots(timestamp DESC);

-- Performance metrics
CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL CHECK (period IN ('7d', '30d', '90d', 'all')),
  win_rate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  sharpe_ratio NUMERIC(10, 4) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(10, 6) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  avg_edge_captured NUMERIC(10, 6) NOT NULL DEFAULT 0,
  profit_factor NUMERIC(10, 4) NOT NULL DEFAULT 0,
  avg_hold_time_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  brier_score NUMERIC(10, 6) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_performance_metrics_period ON performance_metrics(period, calculated_at DESC);

-- Pipeline runs
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage TEXT NOT NULL CHECK (stage IN ('scan', 'research', 'predict', 'execute', 'compound', 'health')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  markets_processed INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_pipeline_runs_stage ON pipeline_runs(stage, started_at DESC);

-- System configuration
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default config
INSERT INTO system_config (key, value) VALUES
  ('scan_interval_min', '5'),
  ('min_market_volume', '200'),
  ('max_expiry_days', '30'),
  ('edge_threshold', '0.04'),
  ('kelly_fraction', '0.25'),
  ('max_position_size_pct', '0.05'),
  ('max_concurrent_positions', '15'),
  ('daily_loss_limit_pct', '0.15'),
  ('slippage_abort_pct', '0.02'),
  ('ai_daily_budget_usd', '50'),
  ('paper_trading_mode', 'true'),
  ('kill_switch_active', 'false'),
  ('bankroll', '10000'),
  ('model_weights', '{"claude": 0.20, "gpt4o": 0.20, "grok": 0.30, "gemini": 0.15, "deepseek": 0.15}');

-- API usage tracking
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_usage_service ON api_usage(service, timestamp DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
