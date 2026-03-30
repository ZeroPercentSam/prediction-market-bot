-- =============================================
-- Prediction Market Bot - V2 Tables
-- =============================================

-- Arbitrage opportunities
CREATE TABLE IF NOT EXISTS arb_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poly_market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  kalshi_market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  poly_yes_price NUMERIC(5, 4),
  kalshi_yes_price NUMERIC(5, 4),
  spread NUMERIC(5, 4),
  estimated_profit NUMERIC(10, 2),
  confidence NUMERIC(3, 2),
  status TEXT DEFAULT 'detected' CHECK (status IN ('detected', 'verified', 'executing', 'completed', 'expired')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_poly_market ON arb_opportunities(poly_market_id);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_kalshi_market ON arb_opportunities(kalshi_market_id);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_status ON arb_opportunities(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_created ON arb_opportunities(created_at DESC);

-- Calibration data (forecast-outcome pairs)
CREATE TABLE IF NOT EXISTS calibration_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  predicted_probability NUMERIC(5, 4) NOT NULL,
  actual_outcome INTEGER NOT NULL CHECK (actual_outcome IN (0, 1)),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calibration_data_model ON calibration_data(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_data_market ON calibration_data(market_id);

-- Calibration parameters (fitted Platt scaling params)
CREATE TABLE IF NOT EXISTS calibration_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  param_a NUMERIC(10, 6) NOT NULL DEFAULT 0,
  param_b NUMERIC(10, 6) NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  last_trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calibration_params_model ON calibration_params(model_id);

-- Whale tracking tables
CREATE TABLE IF NOT EXISTS whale_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL UNIQUE,
  label TEXT,
  total_volume NUMERIC(15, 2) NOT NULL DEFAULT 0,
  win_rate NUMERIC(5, 4),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whale_wallets_address ON whale_wallets(address);
CREATE INDEX IF NOT EXISTS idx_whale_wallets_last_active ON whale_wallets(last_active_at DESC);

CREATE TABLE IF NOT EXISTS whale_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES whale_wallets(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  side TEXT CHECK (side IN ('buy_yes', 'buy_no', 'sell_yes', 'sell_no')),
  size NUMERIC(15, 2),
  price NUMERIC(5, 4),
  dollar_value NUMERIC(15, 2),
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whale_trades_wallet ON whale_trades(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whale_trades_market ON whale_trades(market_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whale_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  signal_type TEXT CHECK (signal_type IN ('accumulation', 'distribution', 'consensus', 'divergence')),
  conviction_score NUMERIC(10, 2),
  whale_count INTEGER,
  net_direction TEXT CHECK (net_direction IN ('bullish', 'bearish', 'neutral')),
  adjustment NUMERIC(5, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whale_signals_market ON whale_signals(market_id, created_at DESC);

-- Orderbook snapshots
CREATE TABLE IF NOT EXISTS orderbook_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  bid_depth NUMERIC(15, 2),
  ask_depth NUMERIC(15, 2),
  spread NUMERIC(5, 4),
  mid_price NUMERIC(5, 4),
  imbalance NUMERIC(5, 4),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orderbook_snapshots_market ON orderbook_snapshots(market_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS flow_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  signal_type TEXT CHECK (signal_type IN ('sweep', 'absorption', 'imbalance_shift', 'momentum')),
  direction TEXT CHECK (direction IN ('bullish', 'bearish')),
  strength NUMERIC(3, 2),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_signals_market ON flow_signals(market_id, created_at DESC);

-- Updated_at trigger for calibration_params
CREATE TRIGGER calibration_params_updated_at
  BEFORE UPDATE ON calibration_params
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
