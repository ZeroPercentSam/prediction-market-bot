-- =============================================
-- Whale signals: add unique index on market_id
-- so upserts can work if needed in the future
-- =============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_whale_signals_market_unique
  ON whale_signals(market_id);
