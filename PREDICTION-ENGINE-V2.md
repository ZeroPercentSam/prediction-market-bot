# Prediction Engine V2 — Maximum Accuracy & Profitability Design

## Executive Summary

Based on research into state-of-the-art prediction market bots (including systems that turned $313 into $414K), the current system needs 7 major upgrades to compete with top performers. **Rust is not the answer** — the bottleneck is intelligence quality, not computation speed. Here's what matters.

---

## Current State vs. State of the Art

| Dimension | Current Bot | Top Performers |
|-----------|-------------|----------------|
| **AI Models** | 5 models, simple weighted average | 10+ agents with supervisor reconciliation |
| **Calibration** | Basic Brier score tracking | Platt scaling + historical calibration + auto-retraining |
| **Data Sources** | News API only | On-chain whale data, social sentiment, orderbook flow, alternative data |
| **Execution** | Paper trading, sequential | Sub-second execution, parallel multi-market |
| **Arbitrage** | None | Cross-platform (Polymarket vs Kalshi) |
| **Backtesting** | None | Monte Carlo simulation, CPCV validation |
| **Market Making** | None | Spread capture on both sides |

---

## The 7 Upgrades (Priority Order)

### 1. AGENTIC SEARCH + SUPERVISOR RECONCILIATION
**Impact: Brier score 0.1125 vs current ~0.25 (2x improvement)**

The AIA Forecaster (matches human superforecasters) uses:
- 10 independent AI agents that each conduct their own research
- Each agent generates its own search queries and evaluates evidence
- A **supervisor agent** examines disagreements between agents' reasoning
- Supervisor generates targeted searches to resolve conflicts
- Final probability comes from reconciled reasoning, not simple averaging

**Implementation:**
```
Current: query 5 models → weighted average → done
V2:     query 5 models → examine reasoning traces → supervisor identifies
        disagreements → targeted research on conflict points → reconciled
        probability with confidence bounds
```

**Key insight from research:** Simple averaging gives Brier 0.1199. Supervisor reconciliation gives 0.1125. That gap represents real money.

### 2. PLATT SCALING + ADAPTIVE CALIBRATION
**Impact: Eliminates LLM hedging bias (tendency toward 0.50)**

LLMs are systematically miscalibrated due to RLHF:
- **Overconfident** on high-probability events
- **Underconfident** on narrative-driven events
- Bias toward 0.50 ("hedging")

**Fix: Platt Scaling**
```
calibrated_p = 1 / (1 + exp(-(a * raw_p + b)))
where a ≈ sqrt(3) ≈ 1.73 (fixed parameter from research)
```

Plus:
- Historical calibration using logistic regression on past forecast-outcome pairs
- Evidence quality penalty (weak evidence → shift toward 0.50)
- Contradiction penalty (conflicting sources → increase uncertainty)
- Ensemble spread penalty (disagreement >10% → add uncertainty)
- **Auto-retraining after 30+ resolved markets**

### 3. ON-CHAIN WHALE TRACKING
**Impact: +8% edge boost when whale signals agree with model**

14 of the 20 most profitable Polymarket wallets are bots. Track them.

**Data pipeline:**
- Scan top 50 wallets by profit, top 50 by volume
- Detect position changes: new entries, exits, size changes
- Score conviction: `whale_count × dollar_size`
- Integrate into ensemble: +8% boost if whales agree, -2% if they disagree

**Sources:**
- Polymarket CLOB API → trade history by wallet
- Polygon blockchain RPC → direct on-chain monitoring
- Polywhaler API (if available) → pre-processed whale intelligence

### 4. CROSS-PLATFORM ARBITRAGE ENGINE
**Impact: 10-20% annual returns with near-zero risk**

Same events priced differently on Polymarket vs Kalshi:
- Spreads >5% occur ~15-20% of the time
- February 2026 example: LA Mayoral = 7.53% locked-in return

**Implementation:**
- Map equivalent markets across platforms (question matching via embeddings)
- Monitor combined YES+NO price < $1.00 (= arbitrage opportunity)
- Execute both legs within 2-7 second windows
- Factor in fees: Polymarket ~0.01%, Kalshi ~1.2%
- **Resolution risk check**: verify both platforms use same resolution criteria

### 5. ORDERBOOK FLOW ANALYSIS
**Impact: Early signal detection 30 seconds to 5 minutes before price moves**

Track market microstructure signals:
- **Order flow imbalance**: measure buy vs sell pressure at 1hr/4hr/24hr windows
- **VWAP divergence**: spot price vs volume-weighted average
- **Bid/ask depth pressure**: where is the size sitting?
- **Trade acceleration**: detect when trade frequency is increasing
- **Whale orders**: flag individual orders >$10K

These signals predict price direction before news is fully priced in.

### 6. MULTI-STRATEGY PORTFOLIO
**Impact: Higher returns with lower drawdown**

Don't just do probability arbitrage. Run multiple strategies:

| Strategy | Allocation | Expected Monthly | Max Drawdown |
|----------|-----------|-----------------|--------------|
| AI Probability Arbitrage | 50% | 3-8% | 5% |
| Cross-Platform Arbitrage | 20% | 1-3% | 0.5% |
| Market Making | 20% | 1-3% | 1% |
| Momentum/Flow | 10% | 2-5% | 3% |

**Balanced portfolio target: 8-12% monthly, <4% max drawdown**

### 7. BACKTESTING & VALIDATION FRAMEWORK
**Impact: Know if a strategy works BEFORE risking capital**

- Store all predictions + outcomes in audit trail
- Combinatorial Purged Cross-Validation (CPCV) instead of simple train/test split
- Deflated Sharpe Ratio to account for multiple testing bias
- Monte Carlo simulation (50,000 paths) for position sizing validation
- **Minimum 100 resolved markets** before going live with real money
- Paper trading → micro capital ($100) → scaled capital progression

---

## Technical Architecture (V2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RAILWAY (Pipeline Workers)                        │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Scanner  │  │ Whale    │  │ Orderbook│  │  News/Social       │  │
│  │  Worker   │  │ Tracker  │  │ Analyzer │  │  Sentiment Engine  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬───────────┘  │
│       │              │              │                  │              │
│       └──────────────┴──────────────┴──────────────────┘              │
│                              │                                        │
│                    ┌─────────┴──────────┐                             │
│                    │  AGENTIC PREDICTOR │                             │
│                    │                    │                             │
│                    │  5-10 AI Agents    │                             │
│                    │  Supervisor Agent  │                             │
│                    │  Platt Calibration │                             │
│                    │  Whale Signal Boost│                             │
│                    └─────────┬──────────┘                             │
│                              │                                        │
│              ┌───────────────┼───────────────┐                        │
│              │               │               │                        │
│     ┌────────┴───┐  ┌───────┴──────┐  ┌────┴──────────┐             │
│     │ Prob Arb   │  │ Cross-Plat   │  │ Market Making │             │
│     │ Executor   │  │ Arb Executor │  │ Executor      │             │
│     └────────────┘  └──────────────┘  └───────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                        ┌─────┴─────┐
                        │ Supabase  │
                        └─────┬─────┘
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                    VERCEL (Dashboard)                                 │
│  Everything visible: predictions, research, whale signals,           │
│  arbitrage opportunities, orderbook flow, calibration charts         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## New Database Tables Needed

```sql
-- Whale wallet tracking
whale_wallets (id, address, platform, total_pnl, win_rate, tracked_since)
whale_trades (id, wallet_id, market_id, direction, size, price, timestamp)
whale_signals (id, market_id, conviction_score, whale_count, net_direction)

-- Arbitrage
arb_opportunities (id, polymarket_market_id, kalshi_market_id, spread,
                    combined_price, potential_return, status, detected_at)
arb_trades (id, opportunity_id, leg_platform, direction, price, fill_price)

-- Orderbook analysis
orderbook_snapshots (id, market_id, bid_depth, ask_depth, imbalance,
                     vwap, trade_velocity, timestamp)
flow_signals (id, market_id, signal_type, strength, direction, timestamp)

-- Calibration
calibration_data (id, model, prediction_id, forecast, outcome, resolved_at)
calibration_params (id, model, category, platt_a, platt_b, sample_size, updated_at)

-- Backtesting
backtest_runs (id, strategy, config, start_date, end_date, sharpe,
               win_rate, max_drawdown, total_return, created_at)
```

---

## Implementation Roadmap

### Phase 1 (Week 1-2): Foundation
- [ ] Finish Railway worker migration (from current plan)
- [ ] Implement Platt scaling calibration
- [ ] Add auto-retraining after 30 resolved markets
- [ ] Store all predictions + outcomes for backtesting

### Phase 2 (Week 3-4): Agentic Prediction
- [ ] Upgrade from simple averaging to supervisor reconciliation
- [ ] Each model gets independent research context
- [ ] Supervisor examines reasoning traces for disagreements
- [ ] Targeted re-search on conflict points

### Phase 3 (Week 5-6): Alpha Signals
- [ ] Whale wallet tracker (Polygon RPC + Polymarket API)
- [ ] Orderbook flow analysis (bid/ask depth, imbalance, velocity)
- [ ] Social sentiment pipeline (X/Twitter API integration)
- [ ] Integrate all signals into prediction ensemble

### Phase 4 (Week 7-8): Multi-Strategy
- [ ] Cross-platform arbitrage engine (Polymarket ↔ Kalshi matching)
- [ ] Market making module (spread capture)
- [ ] Portfolio strategy allocator
- [ ] Backtesting framework with CPCV validation

### Phase 5 (Week 9-10): Optimization & Go-Live
- [ ] 100+ paper-traded market resolutions before live
- [ ] Per-category model weight optimization
- [ ] Micro capital deployment ($100-500)
- [ ] Graduated scaling based on performance

---

## Success Targets

| Metric | Current | V2 Target | Top Performers |
|--------|---------|-----------|----------------|
| Brier Score | ~0.25 | <0.15 | 0.11 |
| Win Rate | untested | >65% | 70-85% |
| Monthly Return | untested | 8-12% | 11-23% |
| Max Drawdown | untested | <4% | 3-9% |
| Sharpe Ratio | untested | >2.5 | 2.0-3.5 |
| Markets Analyzed | 72 | 500+ | 300+ |
| Signal Latency | minutes | <30 seconds | <5 seconds |

---

## Key References

- **AIA Forecaster** (arxiv.org/html/2511.07678v1) — matches human superforecasters
- **Polymarket/agents** (github.com) — official trading framework
- **Fully-Autonomous Bot** (github.com/dylanpersonguy) — most comprehensive open-source
- **Polywhaler** (polywhaler.com) — whale tracking
- **ArbBets** — cross-platform arbitrage
- **ForecastBench** (forecastbench.org) — calibration benchmarks
