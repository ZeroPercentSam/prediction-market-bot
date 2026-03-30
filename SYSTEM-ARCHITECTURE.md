# PredictBot — System Architecture & Feature Document

## 1. System Overview

PredictBot is an autonomous prediction market trading bot that scans markets on **Polymarket** and **Kalshi**, researches events using real-time news and social media, generates probability estimates using a 5-model AI ensemble, and executes paper trades when it detects mispriced markets. It runs three independent trading strategies (prediction, arbitrage, certainty) with full risk management, position sizing via the Kelly Criterion, and a real-time Next.js dashboard for monitoring.

### High-Level Architecture

```
                         +---------------------------+
                         |     Next.js Dashboard     |
                         |   (Vercel / localhost)    |
                         |  - Overview, Trades, Risk |
                         |  - Analytics, Strategies  |
                         |  - Settings, Login        |
                         +------------+--------------+
                                      |
                                      | REST API / Supabase Client
                                      |
                    +-----------------+------------------+
                    |         Supabase PostgreSQL         |
                    |  - markets, trades, predictions     |
                    |  - research, risk_snapshots         |
                    |  - whale_signals, arb_opportunities |
                    |  - system_config, pipeline_runs     |
                    +-----------------+------------------+
                                      |
                                      | Service Role Key
                                      |
                  +-------------------+--------------------+
                  |         Always-On Worker (Node.js)     |
                  |  10 cron jobs running on schedule       |
                  |  - scan, research, predict, execute    |
                  |  - compound, whale-scan, arb-execute   |
                  |  - certainty-scan, pnl-update          |
                  |  - heartbeat (every minute)            |
                  +----+----------+----------+----+--------+
                       |          |          |    |
              +--------+   +-----+---+  +---+--+ +--------+
              |Polymarket|  | Kalshi  |  |OpenRouter|  |NewsAPI |
              |Gamma API |  |REST API |  |  (5 AI   |  |Twitter |
              |CLOB API  |  |         |  | models)  |  |        |
              +----------+  +---------+  +----------+  +--------+
```

### Tech Stack

| Layer       | Technology                                           |
|-------------|------------------------------------------------------|
| Worker      | Node.js + TypeScript, node-cron, tsx                  |
| Dashboard   | Next.js (App Router), React, Tailwind CSS, shadcn/ui |
| Database    | Supabase PostgreSQL (hosted)                          |
| AI Models   | OpenRouter API (Claude, GPT-4o, Grok, Gemini, DeepSeek) |
| Data APIs   | Polymarket Gamma API, Polymarket CLOB API, Kalshi REST API |
| Research    | NewsAPI, Twitter/X API                                |
| Deployment  | Worker: local (start-worker.sh) or Railway; Dashboard: Vercel |

---

## 2. Architecture

### 2.1 Component Architecture

**Worker (Always-On Node.js Process)**
- Entry point: `worker/bootstrap.ts` loads `.env.local`, configures dual logging (stdout + `logs/worker.log`), then imports `worker/index.ts`
- Runs 10 cron-scheduled jobs plus a per-minute heartbeat
- Uses `node-cron` for scheduling with overlap prevention (a `runningJobs` Set tracks in-progress jobs)
- Checks kill switch before every job (except heartbeat)
- Connects to Supabase via service role key for full read/write access

**Dashboard (Next.js on Vercel)**
- App Router with client-side rendering (`"use client"` pages)
- 6 main pages: Overview, Trades, Strategies, Risk, Analytics, Settings
- Plus login page and API routes for auth and configuration
- Uses React Query hooks (`use-dashboard-data.ts`) for real-time data fetching
- Charts: EquityCurve, ModelAccuracy, PnlChart components
- Password-protected via middleware session cookies

**Database (Supabase PostgreSQL)**
- 20+ tables across two migration files
- `system_config` table stores all tunable parameters as JSONB values
- Automatic `updated_at` triggers on markets table
- UUID primary keys, foreign key cascades, check constraints

**External APIs**
- **Polymarket Gamma API** (`gamma-api.polymarket.com`): Market data, prices, volume, price changes
- **Polymarket CLOB API** (`clob.polymarket.com`): Full orderbook depth for flow analysis
- **Polymarket Data API** (`data-api.polymarket.com`): Whale trades ($5K+), top holders
- **Kalshi REST API** (`api.elections.kalshi.com/trade-api/v2`): Markets, events, categories
- **OpenRouter** (`openrouter.ai/api/v1`): Routes to 5 AI models for predictions
- **NewsAPI** (`newsapi.org/v2`): Real-time news articles for research
- **Twitter/X API** (`api.twitter.com/v2`): Recent tweets for sentiment analysis

### 2.2 Data Flow

```
 +------------+     +------------+     +------------+     +-----------+     +------------+
 |   SCAN     | --> |  RESEARCH  | --> |  PREDICT   | --> |  EXECUTE  | --> |  COMPOUND  |
 | (5 min)    |     | (15 min)   |     | (15 min)   |     | (5 min)   |     | (1 hour)   |
 +------------+     +------------+     +------------+     +-----------+     +------------+
       |                  |                  |                  |                  |
  Polymarket +       NewsAPI +          5 AI Models       Kelly sizing       Settle trades
  Kalshi APIs        Twitter API        in parallel       Risk limits       Compute metrics
       |                  |                  |                  |            Retrain models
       v                  v                  v                  v                  |
   markets          research_items      predictions          trades               v
   market_snapshots research_summaries  model_estimates      trade_signals   performance_metrics
   anomalies                            trade_signals                        calibration_data
   arb_opportunities
```

**Parallel pipelines running independently:**

```
  WHALE SCAN (10 min) --> whale_signals, whale_trades, whale_wallets
  CERTAINTY SCAN (10 min) --> predictions, trade_signals, trades
  ARB EXECUTE (5 min) --> trades (paired legs)
  P&L UPDATE (5 min) --> trades (unrealized P&L), risk_snapshots
```

---

## 3. Trading Pipeline

### 3.1 Stage 1: Market Scanner (`worker/jobs/scan.ts`)

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**What it does:**
1. Fetches markets from Polymarket (up to 500, paginated by 100) and Kalshi (up to 500, paginated by 100) in parallel
2. Computes Kalshi price changes from previous snapshots (Kalshi API does not provide price change data)
3. Filters markets by configurable thresholds:
   - Minimum 24h volume: **$200** (default, configurable via `scan_min_volume`)
   - Maximum expiry: **30 days** (default, configurable via `scan_max_expiry_days`)
   - Must not be expired
4. Deduplicates by `platform:platform_market_id`
5. Upserts to `markets` table (on conflict: `platform, platform_market_id`)
6. Writes `market_snapshots` for historical price tracking
7. Detects anomalies:
   - **Price spike**: 1h price change > **10%** (configurable via `anomaly_price_spike_pct`); severity "high" if > 20%
   - **Wide spread**: Spread > **5 cents** (configurable via `anomaly_spread_wide_cents`); severity "high" if > 10 cents
8. Runs arbitrage scan (`findArbOpportunities`) at end of each scan

**Inputs:** Polymarket Gamma API, Kalshi REST API, previous market snapshots
**Outputs:** `markets`, `market_snapshots`, `anomalies`, `arb_opportunities`

### 3.2 Stage 2: Research (`worker/jobs/research.ts`)

**Schedule:** Every 15 minutes at :00, :15, :30, :45

**What it does:**
1. Selects top **15** markets by 24h volume that are active
2. Processes markets in parallel batches of **3**
3. For each market:
   - Fetches real data from NewsAPI (up to 10 articles) and Twitter/X API (up to 10 tweets)
   - Classifies sentiment using **Gemini** (cheapest capable model) in parallel batches of **5**
   - Each source gets: sentiment (bullish/bearish/neutral), score (-1.0 to 1.0), reliability score
4. If no real sources found, falls back to AI-generated research (labeled as `source: "ai"`)
5. Stores individual `research_items` and aggregated `research_summaries`

**Source Reliability Scores:**

| Source  | Reliability |
|---------|-------------|
| News    | 0.7         |
| Web     | 0.5         |
| Twitter | 0.4         |
| Reddit  | 0.3         |
| AI      | 0.3         |

**Outputs:**
- `research_items`: Individual sources with title, content, sentiment, reliability, URL
- `research_summaries`: Aggregate sentiment, breakdown (bullish/bearish/neutral), key themes, narrative gap (difference between sentiment-implied probability and market price)

### 3.3 Stage 3: AI Prediction Engine (`worker/jobs/predict.ts`)

**Schedule:** Every 15 minutes at :05, :20, :35, :50 (offset 5 min from research)

**What it does:**
1. Loads calibration parameters from `calibration_params` table
2. Loads model weights from config (default: see below)
3. Selects top **10** markets by volume with active status
4. Skips markets that already have active trades
5. Processes in parallel batches of **3** markets (5 models each = 15 concurrent AI calls)

**For each market, the prediction pipeline is:**

```
Raw Model Estimates (5 models in parallel)
    |
    v
Platt Calibration (per-model)
    |
    v
Weighted Ensemble Average
    |
    v
Evidence Quality Penalties
    |
    v
Supervisor Reconciliation (if spread > 8%)
    |
    v
Whale Signal Adjustment (Polymarket only)
    |
    v
Orderbook Flow Adjustment (Polymarket only)
    |
    v
Final Ensemble Probability
    |
    v
Edge = ensembleProb - marketPrice
    |
    v
Signal Generation (if |edge| > 4% AND 3+ models agree)
```

**Signal generation criteria:**
- Edge must exceed threshold: **4%** (default, configurable via `edge_threshold`)
- At least **3 out of 5** models must agree on direction
- Market must not already have an active trade (deduplication)

**Outputs:** `predictions`, `model_estimates`, `trade_signals`

### 3.4 Stage 4: Trade Execution (`worker/jobs/execute.ts`)

**Schedule:** Every 5 minutes at :02, :07, :12, etc. (offset from scan)

**What it does:**
1. Loads risk configuration from `system_config`
2. Fetches all pending trade signals with joined predictions and markets
3. Checks daily loss limit before processing
4. For each signal:
   - Fetches **real-time price** from exchange API (falls back to cached if API fails)
   - Recalculates edge with live price; expires signal if edge < **2%**
   - Computes Kelly Criterion position size:
     ```
     fullKelly = max(0, (p * b - q) / b)
     fractionalKelly = fullKelly * 0.25
     cappedFraction = min(fractionalKelly, 0.05)
     positionSize = cappedFraction * bankroll
     ```
   - Skips if position size < $1
   - Skips if duplicate position (same market + platform)
   - Skips if concurrent positions >= max (15)
5. In paper trading mode: inserts trade with `status: "filled"` immediately
6. Live trading: not yet implemented (signals marked as `skipped`)

**Risk checks (in order):**
1. Daily loss limit (15% of bankroll)
2. Concurrent position limit (15)
3. Duplicate position check
4. Minimum edge re-verification (2%)
5. Minimum position size ($1)

**Outputs:** `trades`, updated `trade_signals` status

### 3.5 Stage 5: Compounding (`worker/jobs/compound.ts`)

**Schedule:** Every hour at :30

**What it does:**
1. **Settle resolved trades**: Checks markets with `is_active = false` and price at $1.00/$0.00 (or >$0.95/<$0.05); calculates P&L and classifies trades
2. **Compute performance metrics**: Calculates for periods 7d, 30d, 90d, all-time:
   - Win rate, Sharpe ratio, max drawdown, total P&L
   - Profit factor, average hold time, average edge captured, Brier score
3. **Retrain calibration**: Fits Platt scaling parameters for all 5 models (requires 30+ data points)
4. **Store calibration data**: Saves per-model forecast-outcome pairs for future retraining

**Trade classification:**
- `correct_profitable`: Prediction correct AND profitable
- `correct_unprofitable`: Prediction correct but not profitable (edge captured was negative)
- `incorrect_prediction`: Prediction wrong

**Outputs:** Updated `trades`, `performance_metrics`, `calibration_data`, `calibration_params`

---

## 4. Trading Strategies

### 4.1 Prediction Strategy

The core strategy. Uses a 5-model AI ensemble to identify markets where the true probability diverges from the market price.

**How it works:**
1. Each model independently estimates the probability of the event
2. Estimates are calibrated via Platt scaling, then weighted and averaged
3. The supervisor agent reconciles significant disagreements
4. Whale activity and orderbook flow provide additional adjustments
5. If the final edge exceeds 4% and 3+ models agree, a trade signal is generated
6. Position sized via fractional Kelly Criterion (25% Kelly, max 5% of bankroll)

**Signal types:** `buy_yes` (model thinks YES is underpriced) or `buy_no` (model thinks NO is underpriced)

### 4.2 Arbitrage Strategy

Cross-platform price discrepancy detection between Polymarket and Kalshi.

**How it works:**
1. The scan job matches markets across platforms using keyword similarity (Jaccard > 0.4) followed by AI verification (Gemini, confidence > 0.7)
2. Checks two directions:
   - Buy YES on Polymarket + Buy NO on Kalshi
   - Buy NO on Polymarket + Buy YES on Kalshi
3. Combined cost must be < **$0.97** (minimum 3% profit margin after fees)
4. `arb-execute` job re-validates with live prices before placing paired paper trades

**Position sizing:**
- Fixed **2%** of bankroll per leg
- Max **$500** per single leg
- Max **5** concurrent arb positions

**Key parameters:**
- `ARB_THRESHOLD`: 0.97 (combined cost must be below this)
- `ARB_FRACTION`: 0.02 (2% of bankroll per leg)
- `MAX_LEG_SIZE`: $500
- `MAX_CONCURRENT_ARB_POSITIONS`: 5

### 4.3 Certainty Strategy

Identifies near-resolved markets and captures the remaining spread to $1.00.

**How it works:**
1. Scans for markets priced >= **$0.93** (near YES) or <= **$0.07** (near NO)
2. Must have volume > $100 and at least 1 hour before expiry
3. Verifies outcome certainty with AI (DeepSeek, cheapest model)
4. AI must confirm with confidence >= **90%**
5. Places trade to capture the spread between current price and $1.00

**Position sizing:**
- **3%** of bankroll per trade, max **$1,000**
- Minimum expected profit: **$5**
- Max **10** concurrent certainty positions

---

## 5. Risk Management

### Kelly Criterion Sizing

```
f* = (p * b - q) / b

where:
  p = estimated probability of winning
  q = 1 - p
  b = net odds (1/price - 1)
```

Applied as **fractional Kelly** (default 25%) to reduce volatility. The formula is calculated separately for YES and NO sides.

| Parameter                | Default | Description                          |
|--------------------------|---------|--------------------------------------|
| `kelly_fraction`         | 0.25    | Fraction of full Kelly to use        |
| `max_position_size_pct`  | 0.05    | Max 5% of bankroll per position      |
| `max_concurrent_positions`| 15     | Max open positions at any time       |
| `daily_loss_limit_pct`   | 0.15    | Trading halted if daily loss > 15%   |
| `slippage_abort_pct`     | 0.02    | Abort trade if slippage > 2%         |
| `bankroll`               | 10000   | Starting bankroll for paper trading  |

### Kill Switch

- Stored in `system_config` as `kill_switch_active`
- Checked before every job execution (except heartbeat)
- When active: all jobs skip immediately, no new trades placed
- Can be toggled from the Risk dashboard page
- **Fail-safe**: If the kill switch check fails (DB error), defaults to ACTIVE (safe)

### Slippage Protection

- Before execution, the bot fetches the **real-time price** from the exchange API
- Recalculates edge with live price
- If edge shrinks below 2%, the signal is expired (not executed)
- Configurable abort threshold: `slippage_abort_pct` (default 2%)

### VaR Calculation (`lib/math/var.ts`)

```
VaR_95 = portfolioValue * 1.645 * volatility * sqrt(holdingPeriod)
VaR_99 = portfolioValue * 2.326 * volatility * sqrt(holdingPeriod)
```

Volatility estimated from historical daily returns. Used for risk dashboard display.

---

## 6. AI Model Ensemble

### Models Used

| Model     | OpenRouter ID                        | Weight | Cost (input/output per 1M tokens) |
|-----------|--------------------------------------|--------|------------------------------------|
| Claude    | `anthropic/claude-sonnet-4`          | 0.20   | $3.00 / $15.00                     |
| GPT-4o    | `openai/gpt-4o`                      | 0.20   | $2.50 / $10.00                     |
| Grok      | `x-ai/grok-3-mini`                   | 0.30   | $0.30 / $0.50                      |
| Gemini    | `google/gemini-3-flash-preview`       | 0.15   | $0.15 / $0.60                      |
| DeepSeek  | `deepseek/deepseek-r1`               | 0.15   | $0.55 / $2.19                      |

Grok has the highest default weight (30%) among the ensemble models.

### Request Configuration

- Temperature: **0.3** (low for consistency)
- Max tokens: **1000**
- Timeout: **30 seconds** per request
- Retries: **1** (with exponential backoff starting at 2s)
- Rate limiting: minimum **200ms** between requests

### Platt Scaling Calibration (`worker/lib/calibration.ts`)

LLMs are systematically miscalibrated (overconfident on high-probability events, biased toward 0.50 due to RLHF). Platt scaling corrects this:

```
calibrated_p = sigmoid(a * logit(raw_p) + b)
```

**Default parameters:** `a = 1.73` (sqrt(3)), `b = 0` (from AIA Forecaster research). These "extremize" hedged probabilities, pushing them away from 0.50.

After **30+ resolved markets**, parameters are fitted per-model via gradient descent (500 iterations, learning rate 0.01).

### Evidence Quality Penalties

Applied after ensemble averaging to account for uncertainty:

| Condition                        | Penalty                                      |
|----------------------------------|----------------------------------------------|
| Weak evidence (quality < 0.5)    | Shift toward 0.50 by up to 15%               |
| High contradiction (> 0.3)       | Shift toward 0.50 by up to 20%               |
| High ensemble spread (> 0.1)     | Shift toward 0.50 by up to 30%               |

### Supervisor Reconciliation (`worker/lib/supervisor.ts`)

Based on the AIA Forecaster approach (Brier score 0.1125):

1. **Activates only when** model spread > **8%** (significant disagreement)
2. Uses **Claude** (best at reasoning about reasoning) to:
   - Identify key disagreements between forecasters
   - Determine which model has strongest evidence-based reasoning
   - Generate targeted research queries to resolve conflicts
   - Produce a reconciled probability estimate
3. Final blend: **60% supervisor + 40% ensemble average**

### Confidence Scoring

Each model outputs:
- `PROBABILITY`: 0.01 to 0.99
- `CONFIDENCE`: 0.0 to 1.0
- `REASONING`: 2-3 sentences

The confidence value scales each model's weight in the ensemble. Models that fail (timeout, error) return `confidence: 0` and are excluded from the weighted average.

---

## 7. Market Intelligence

### 7.1 Whale Tracking (`worker/lib/whale-tracker.ts`)

**Schedule:** Whale Scan runs every 10 minutes

**Data source:** Polymarket Data API (`data-api.polymarket.com/trades`)

**How it works:**
1. Scans top **50** Polymarket markets by volume
2. Fetches trades > **$5,000** for each market (up to 100 trades)
3. Aggregates buy vs sell volume across unique whale wallets
4. Determines net direction: bullish if buys > sells * 1.2, bearish if sells > buys * 1.2
5. Computes conviction score: `uniqueWallets * avgTradeSize`

**Signal types (derived from behavior):**
- `accumulation`: Bullish + few whales (< 3)
- `distribution`: Bearish + few whales (< 3)
- `consensus`: Bullish or bearish + 3+ whales agreeing
- `divergence`: Neutral (mixed buying/selling)

**Probability adjustment:**
- Only applies if 2+ whales are active
- Max adjustment: **8%** (capped by `convictionScore / 500,000`)
- If whales agree with model direction: boost edge
- If whales disagree: small **2%** penalty toward whale direction

**Stored in:** `whale_signals`, `whale_trades`, `whale_wallets`

### 7.2 Orderbook Analysis (`worker/lib/orderbook.ts`)

**Data source:** Polymarket CLOB API (`clob.polymarket.com/book`)

**Metrics computed:**
- Bid/ask depth (total USD on each side)
- Order flow imbalance: `(bidDepth - askDepth) / totalDepth` (range: -1 to +1)
- Spread and mid price
- VWAP (volume-weighted average price for top 10 levels each side)
- Largest resting orders (walls)

**Signal determination:**
- Imbalance > **0.2**: Signal = bullish/bearish, strength = |imbalance|
- VWAP divergence (> 1% from mid): Reinforces or initiates signal

**Probability adjustment:**
- Only applies if signal strength >= **0.3**
- Max adjustment: **3%** (short-term signal, intentionally conservative)

**Stored in:** `orderbook_snapshots`

### 7.3 Research Pipeline

**Data sources (in priority order):**
1. **NewsAPI**: Up to 10 articles per market, sorted by relevancy, English only
2. **Twitter/X API**: Up to 10 recent tweets per market
3. **AI fallback**: If no real sources found, Gemini generates research points (labeled as `source: "ai"` with reliability 0.3)

**Sentiment classification:**
- Done by Gemini model (cheapest capable)
- Parallel batches of 5 sources
- Outputs: `SENTIMENT: bullish|bearish|neutral` and `SCORE: -1.0 to 1.0`

**Aggregation:**
- `aggregate_sentiment`: Mean of all source sentiment scores
- `narrative_gap`: `|sentimentProbability - marketPrice|` where `sentimentProbability = (aggSentiment + 1) / 2`

---

## 8. Dashboard

The dashboard is a Next.js application with 6 main pages plus a login page. All pages use client-side rendering with React Query for real-time data fetching from Supabase.

### Pages

| Page | Route | Description |
|------|-------|-------------|
| **Overview** | `/` | KPI cards (bankroll, daily P&L, win rate, Sharpe ratio), secondary stats (open positions, active markets, pending signals), pipeline status, recent activity feed, equity curve chart |
| **Trades** | `/trades` | Live trade table with unrealized P&L (updated every 5 min), strategy filter (prediction/arbitrage/certainty), position sizes, entry/current prices, P&L % |
| **Strategies** | `/strategies` | Per-strategy performance cards (prediction, arbitrage, certainty), comparison table (win rate, total P&L, avg P&L, best/worst trade, volume), recent activity per strategy |
| **Risk** | `/risk` | Exposure cards (total exposure, open positions, VaR, daily P&L), daily loss limit progress bar, exposure by platform breakdown, position limit display, emergency kill switch button |
| **Analytics** | `/analytics` | Performance metrics across 4 periods (7d, 30d, 90d, all-time) in a comparison table, equity curve chart, cumulative P&L chart, model accuracy chart |
| **Settings** | `/settings` | Paper/live trading toggle, trading parameters (edge threshold, Kelly fraction, max position size, max concurrent, scan interval), model weight sliders, risk limits (daily loss limit, slippage abort, AI budget), market filters (min volume, max expiry) |
| **Login** | `/login` | Password-protected entry point |

### Key Features

- **Live P&L tracking**: Unrealized P&L updates every 5 minutes from exchange APIs, reflected across Overview, Trades, Risk, and Analytics pages
- **Equity curve**: Historical bankroll chart with live "now" data point appended when positions are open
- **Strategy breakdown**: All trades classified as prediction, arbitrage, or certainty based on the `notes` field
- **Kill switch**: One-click emergency halt from the Risk page, immediately stops all trading
- **Model accuracy chart**: Per-model prediction accuracy visualization

### Authentication

- Password-based login via `/api/auth` endpoint
- Session stored as SHA-256 hashed cookie (`session` cookie)
- Middleware (`middleware.ts`) intercepts all routes except `/login`, `/api/auth`, `/api/kill-switch`, and static assets
- Invalid/missing sessions redirect to `/login`

---

## 9. Database Schema

### Tables (Migration 001 - Initial)

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `markets` | All tracked markets from both platforms | `platform`, `platform_market_id` (unique together), `question`, `current_yes_price`, `current_no_price`, `volume_24h`, `liquidity`, `expiry_date`, `is_active` |
| `market_snapshots` | Historical price snapshots for tracking changes | `market_id` (FK), `yes_price`, `no_price`, `volume`, `timestamp` |
| `anomalies` | Detected price spikes and wide spreads | `market_id` (FK), `type`, `severity`, `value`, `threshold` |
| `research_items` | Individual news articles, tweets, AI research | `market_id` (FK), `source`, `title`, `content`, `sentiment`, `sentiment_score`, `reliability` |
| `research_summaries` | Aggregated sentiment per market | `market_id` (FK, unique), `aggregate_sentiment`, `sentiment_breakdown`, `key_themes`, `narrative_gap` |
| `predictions` | Ensemble probability estimates | `market_id` (FK), `ensemble_probability`, `market_price`, `edge`, `expected_value`, `signal_generated`, `signal_direction` |
| `model_estimates` | Per-model probability estimates | `prediction_id` (FK), `model`, `probability`, `confidence`, `reasoning`, `weight`, `cost_usd` |
| `trade_signals` | Generated buy/sell signals | `prediction_id` (FK), `market_id` (FK), `direction`, `edge`, `status` |
| `trades` | Executed (paper) trades | `market_id` (FK), `prediction_id` (FK), `platform`, `direction`, `entry_price`, `position_size`, `kelly_fraction`, `status`, `pnl`, `classification` |
| `risk_snapshots` | Portfolio risk snapshots (every 5 min) | `bankroll`, `daily_pnl`, `open_positions`, `total_exposure`, `var_value`, `kill_switch_active` |
| `performance_metrics` | Computed trading performance | `period` (7d/30d/90d/all), `win_rate`, `sharpe_ratio`, `max_drawdown`, `total_pnl`, `brier_score`, `profit_factor` |
| `pipeline_runs` | Execution log for all pipeline stages | `stage`, `status`, `markets_processed`, `duration_ms`, `error` |
| `system_config` | Key-value configuration store | `key` (PK), `value` (JSONB) |
| `api_usage` | API cost tracking | `service`, `tokens_used`, `cost_usd` |

### Tables (Migration 002 - V2)

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `arb_opportunities` | Cross-platform arbitrage detections | `poly_market_id` (FK), `kalshi_market_id` (FK), `spread`, `combined_price`, `potential_return`, `direction`, `status` |
| `calibration_data` | Forecast-outcome pairs for model retraining | `model_id`, `predicted_probability`, `actual_outcome`, `prediction_id` (FK) |
| `calibration_params` | Fitted Platt scaling parameters per model | `model_id` (unique), `param_a`, `param_b`, `sample_count` |
| `whale_wallets` | Known whale wallet addresses | `address` (unique), `label`, `total_volume`, `win_rate` |
| `whale_trades` | Individual whale transactions | `wallet_id` (FK), `market_id` (FK), `side`, `size`, `dollar_value` |
| `whale_signals` | Aggregated whale activity signals | `market_id` (FK), `signal_type`, `conviction_score`, `net_direction` |
| `orderbook_snapshots` | Point-in-time orderbook state | `market_id` (FK), `bid_depth`, `ask_depth`, `imbalance`, `spread` |
| `flow_signals` | Orderbook flow anomaly signals | `market_id` (FK), `signal_type`, `direction`, `strength` |

### Relationships

```
markets
  |-- market_snapshots (1:N)
  |-- anomalies (1:N)
  |-- research_items (1:N)
  |-- research_summaries (1:1)
  |-- predictions (1:N)
  |     |-- model_estimates (1:N)
  |     |-- trade_signals (1:N)
  |     |-- calibration_data (1:N)
  |-- trades (1:N)
  |-- whale_trades (1:N)
  |-- whale_signals (1:N)
  |-- orderbook_snapshots (1:N)
  |-- flow_signals (1:N)
  |-- arb_opportunities (as poly_market_id or kalshi_market_id)

whale_wallets
  |-- whale_trades (1:N)
```

---

## 10. Infrastructure

### 10.1 Worker Deployment

**Local deployment (recommended for development):**

```bash
./start-worker.sh     # Starts worker as background process via nohup
./stop-worker.sh      # Stops the worker (kills PID)
tail -f logs/worker.log   # Watch live logs
```

- Entry: `worker/bootstrap.ts` -> loads `.env.local` -> sets up file logging -> imports `worker/index.ts`
- PID stored in `logs/worker.pid`
- Logs written to both stdout and `logs/worker.log`
- Log format: `[ISO_TIMESTAMP] [LEVEL] message`

**Railway deployment:**
- Runs `npx tsx worker/bootstrap.ts` as the start command
- Environment variables set in Railway dashboard

**Heartbeat monitoring:**
- Worker writes `worker_heartbeat` to `system_config` every minute
- Dashboard can check heartbeat freshness to detect worker crashes

### 10.2 Dashboard Deployment

- Deployed on **Vercel** (or local via `next dev`)
- URL: `prediction-market-bot-chi.vercel.app`

**Required environment variables:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (for dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for worker) |
| `OPENROUTER_API_KEY` | OpenRouter API key (for AI models) |
| `NEWS_API_KEY` | NewsAPI key (optional, for research) |
| `TWITTER_BEARER_TOKEN` | Twitter/X bearer token (optional, for research) |
| `AUTH_PASSWORD` | Dashboard login password |

### 10.3 Authentication

- **Middleware** (`middleware.ts`): Intercepts all requests, checks for valid `session` cookie
- Session format: `token:sha256hash` — the middleware recomputes the hash and compares
- Excluded routes: `/login`, `/api/auth`, `/api/kill-switch`, static assets (`/_next`, favicons, etc.)
- Invalid sessions redirect to `/login`

---

## 11. Configuration

All parameters are stored in the `system_config` table and can be changed via:
1. The **Settings** page in the dashboard (GUI with sliders and inputs)
2. Direct database updates to the `system_config` table

### Configurable Parameters

| Parameter | Config Key | Default | Description |
|-----------|-----------|---------|-------------|
| Scan Interval | `scanIntervalMin` | 5 min | How often to scan for new markets |
| Min Market Volume | `minMarketVolume` / `scan_min_volume` | $200 | Minimum 24h volume to consider a market |
| Max Expiry Days | `maxExpiryDays` / `scan_max_expiry_days` | 30 | Maximum days until market expiry |
| Edge Threshold | `edgeThreshold` / `edge_threshold` | 0.04 (4%) | Minimum edge to generate a trade signal |
| Kelly Fraction | `kellyFraction` / `kelly_fraction` | 0.25 (25%) | Fraction of full Kelly to use |
| Max Position Size | `maxPositionSizePct` / `max_position_size_pct` | 0.05 (5%) | Max single position as % of bankroll |
| Max Concurrent Positions | `maxConcurrentPositions` / `max_concurrent_positions` | 15 | Maximum open positions at once |
| Daily Loss Limit | `dailyLossLimitPct` / `daily_loss_limit_pct` | 0.15 (15%) | Trading halted if daily loss exceeds this |
| Slippage Abort | `slippageAbortPct` / `slippage_abort_pct` | 0.02 (2%) | Abort trade if price moved too much |
| AI Daily Budget | `aiDailyBudgetUsd` / `ai_daily_budget_usd` | $50 | Daily spending cap on AI API calls |
| Paper Trading Mode | `paperTradingMode` / `paper_trading_mode` | true | Simulate trades (no real money) |
| Bankroll | `bankroll` | $10,000 | Starting capital for position sizing |
| Kill Switch | `kill_switch_active` | false | Emergency halt for all trading |
| Price Spike Threshold | `anomaly_price_spike_pct` | 10% | 1h price change to flag as anomaly |
| Wide Spread Threshold | `anomaly_spread_wide_cents` | 5 cents | Spread width to flag as anomaly |
| Model Weights | `model_weights` | See below | Per-model weight in ensemble |

**Default Model Weights:**

| Model    | Weight |
|----------|--------|
| Claude   | 0.20   |
| GPT-4o   | 0.20   |
| Grok     | 0.30   |
| Gemini   | 0.15   |
| DeepSeek | 0.15   |

---

## 12. Job Schedule

All times are minute offsets within each hour. Jobs are staggered to avoid resource contention.

| Job | Cron Expression | Frequency | Offset | Description |
|-----|----------------|-----------|--------|-------------|
| **Scan** | `*/5 * * * *` | Every 5 min | :00, :05, :10, ... | Fetch markets from Polymarket + Kalshi, detect anomalies, find arb opportunities |
| **Research** | `0,15,30,45 * * * *` | Every 15 min | :00, :15, :30, :45 | Gather news + sentiment for top 15 markets |
| **Predict** | `5,20,35,50 * * * *` | Every 15 min | :05, :20, :35, :50 | 5-model ensemble predictions, generate trade signals |
| **Execute** | `2,7,12,...,57 * * * *` | Every 5 min | :02, :07, :12, ... | Process pending signals, size positions, place paper trades |
| **Arb Execute** | `4,9,14,...,59 * * * *` | Every 5 min | :04, :09, :14, ... | Validate and execute cross-platform arb opportunities |
| **Compound** | `30 * * * *` | Every hour | :30 | Settle trades, compute metrics, retrain calibration |
| **Whale Scan** | `3,13,23,...,53 * * * *` | Every 10 min | :03, :13, :23, ... | Scan top 50 markets for whale trades ($5K+) |
| **Certainty Scan** | `8,18,28,...,58 * * * *` | Every 10 min | :08, :18, :28, ... | Find and trade near-resolved markets (>93% or <7%) |
| **P&L Update** | `1,6,11,...,56 * * * *` | Every 5 min | :01, :06, :11, ... | Update unrealized P&L from live prices, take risk snapshots |
| **Heartbeat** | `* * * * *` | Every minute | every minute | Write timestamp to system_config for liveness monitoring |

**Overlap prevention:** Each job is tracked in a `runningJobs` Set. If a previous run is still in progress, the new invocation is skipped.

---

## 13. Performance Metrics

### What's Tracked

| Metric | Formula | Target | Description |
|--------|---------|--------|-------------|
| **Brier Score** | `(1/N) * sum((forecast - outcome)^2)` | < 0.25 (good < 0.2, excellent < 0.1) | Measures prediction calibration; 0 = perfect |
| **Sharpe Ratio** | `(meanReturn - riskFreeRate) / stdDev * sqrt(252)` | > 2.0 | Risk-adjusted return; annualized from daily returns |
| **Win Rate** | `correctProfitable / totalTrades` | > 60% | Percentage of trades classified as `correct_profitable` |
| **Max Drawdown** | `max((peak - trough) / peak)` | < 10% | Largest peak-to-trough decline in equity |
| **Profit Factor** | `grossProfit / grossLoss` | > 1.5 | Ratio of winning $ to losing $ |
| **Total P&L** | Sum of all trade P&L | Positive | Net profit/loss in dollars |
| **Avg Edge Captured** | Mean of `edge` from associated predictions | > 0 | Average model-vs-market edge on executed trades |
| **Avg Hold Time** | Mean of `(settled_at - created_at)` | Varies | How long positions are held (hours) |
| **VaR (95%)** | `portfolio * 1.645 * vol * sqrt(t)` | Informational | Value at Risk at 95% confidence, 1-day horizon |
| **VaR (99%)** | `portfolio * 2.326 * vol * sqrt(t)` | Informational | Value at Risk at 99% confidence, 1-day horizon |

### Calculation Periods

Metrics are computed for 4 rolling periods: **7 days**, **30 days**, **90 days**, and **all-time**. Updated hourly by the compound job.

### Brier Score Rating Scale

| Score Range | Rating    |
|-------------|-----------|
| < 0.10      | Excellent |
| 0.10 - 0.20 | Good     |
| 0.20 - 0.30 | Fair     |
| > 0.30      | Poor      |

### Risk-Free Rate

Sharpe ratio uses a daily risk-free rate of `0.05 / 365` (~5% annualized, approximating US Treasury yields).
