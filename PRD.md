# Product Requirements Document (PRD)
# AI-Powered Prediction Market Trading Bot

**Version:** 1.0
**Date:** 2026-03-27
**Author:** Sam Ovington
**Status:** Draft

---

## 1. Executive Summary

An autonomous AI-powered prediction market trading bot that identifies mispricings across prediction markets (Polymarket, Kalshi), executes trades based on ensemble AI probability estimates, and provides a real-time dashboard for full transparency into every decision the system makes.

The system runs continuously, scanning markets, conducting research, computing probabilities, managing risk, and executing trades — all visible through a comprehensive web dashboard hosted on Vercel.

---

## 2. Problem Statement

Prediction markets contain mispricings that can be exploited by comparing AI-generated probability estimates against market prices. Manually monitoring 300+ markets, aggregating news/sentiment, computing ensemble probabilities, and executing trades is impossible at scale. An automated system with full observability solves this.

---

## 3. Product Vision

A fully autonomous trading system with a "glass box" dashboard — every prediction, every piece of research, every mathematical calculation, and every market being analyzed is visible in real-time. The user should be able to understand *why* every trade was made and *how* the system arrived at its conclusions.

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js App)                       │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Dashboard   │  │  API Routes  │  │  Edge Functions     │ │
│  │  (React)     │  │  (Next.js)   │  │  (Cron Workers)     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│         │                │                     │              │
│         └────────────────┼─────────────────────┘              │
│                          │                                    │
│                    ┌─────┴─────┐                              │
│                    │ Supabase  │                              │
│                    │ Database  │                              │
│                    └───────────┘                              │
└─────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────┴──────┐ ┌────┴────┐ ┌──────┴──────┐
     │ Polymarket  │ │ Kalshi  │ │ News/Social │
     │ CLOB API    │ │ REST API│ │ APIs        │
     └─────────────┘ └─────────┘ └─────────────┘
```

---

## 5. Core Pipeline (5-Stage Architecture)

### Stage 1: SCAN — Market Discovery & Filtering

**Purpose:** Continuously scan prediction markets to find tradeable opportunities.

**Functional Requirements:**
- Scan Polymarket (CLOB API) and Kalshi (REST API) every 5 minutes
- Filter markets by:
  - Minimum 200 contracts volume
  - Maximum 30-day expiry window
  - Minimum liquidity threshold (configurable)
- Flag anomalies automatically:
  - Price moves >10% in 1 hour
  - Bid-ask spreads >5 cents
  - Volume spikes >3x average
- Store all scanned market data with timestamps
- Track market metadata: category, expiry, current price, volume, liquidity depth

**Dashboard Display:**
- Live market scanner table with sortable columns
- Anomaly alerts feed with severity indicators
- Market category breakdown (politics, sports, crypto, science, etc.)
- Heat map of market activity across platforms
- Total markets tracked vs. markets passing filters

**Data Model:**
```
Market {
  id: string
  platform: "polymarket" | "kalshi"
  question: string
  category: string
  currentYesPrice: number
  currentNoPrice: number
  volume24h: number
  totalVolume: number
  liquidity: number
  expiryDate: datetime
  spreadCents: number
  priceChange1h: number
  priceChange24h: number
  anomalyFlags: string[]
  lastScanned: datetime
  createdAt: datetime
}
```

---

### Stage 2: RESEARCH — Intelligence Gathering

**Purpose:** Aggregate and analyze information from multiple sources to build an informed view of each market.

**Functional Requirements:**
- For each flagged/interesting market, gather data from:
  - Twitter/X API — sentiment analysis on relevant keywords
  - Reddit API — subreddit discussions and sentiment
  - RSS feeds — major news outlets
  - News APIs (NewsAPI, Google News) — headline aggregation
  - Web search — supplementary context
- NLP classification of each source: bullish / bearish / neutral
- Compute aggregate sentiment scores per market
- Identify narrative gaps: where market price diverges from news consensus
- Track source reliability scores over time
- Store all research artifacts for auditability

**Dashboard Display:**
- Research feed per market showing all gathered sources
- Sentiment gauge (bullish/bearish/neutral) per market
- Source breakdown table with reliability scores
- Narrative gap alerts — "Market says X, news says Y"
- Research timeline showing when each piece was gathered
- Word cloud / key themes extraction per market
- Full research drill-down: click any market to see every article, tweet, and Reddit post analyzed

**Data Model:**
```
ResearchItem {
  id: string
  marketId: string
  source: "twitter" | "reddit" | "news" | "rss" | "web"
  sourceUrl: string
  title: string
  content: string (truncated)
  sentiment: "bullish" | "bearish" | "neutral"
  sentimentScore: number (-1 to 1)
  reliability: number (0 to 1)
  publishedAt: datetime
  analyzedAt: datetime
}

MarketResearchSummary {
  marketId: string
  aggregateSentiment: number
  sentimentBreakdown: { bullish: number, bearish: number, neutral: number }
  sourceCount: number
  keyThemes: string[]
  narrativeGap: number (divergence score)
  lastUpdated: datetime
}
```

---

### Stage 3: PREDICT — Ensemble AI Probability Estimation

**Purpose:** Generate calibrated probability estimates using multiple AI models and mathematical frameworks.

**Functional Requirements:**
- Query multiple AI models for probability estimates:
  - Claude (Anthropic) — 20% weight
  - GPT-4o (OpenAI) — 20% weight
  - Grok (xAI) — 30% weight
  - Gemini (Google) — 15% weight
  - DeepSeek — 15% weight
- Each model receives:
  - Market question and context
  - Research summary from Stage 2
  - Historical price data
  - Current market price (for calibration reference)
- Compute weighted ensemble probability
- Calculate key metrics:
  - **Market Edge:** `modelProbability - marketPrice`
  - **Expected Value:** `EV = p * b - (1 - p)` where p = model probability, b = decimal odds - 1
  - **Mispricing Z-Score:** statistical divergence from market consensus
  - **Confidence interval** from model agreement/disagreement
- Only generate trade signals when:
  - Edge > 4% (configurable threshold)
  - Confidence > configurable threshold
  - At least 3/5 models agree on direction
- Track calibration using Brier Score (target < 0.25)

**Dashboard Display:**
- Per-market prediction panel showing:
  - Each AI model's individual estimate with confidence
  - Ensemble weighted probability with breakdown
  - Visual comparison: AI estimate vs. market price (bar chart)
  - Edge calculation with color coding (green = tradeable, red = no edge)
  - EV calculation shown step-by-step
  - Mispricing Z-score gauge
  - Confidence interval visualization
- Model performance leaderboard (which AI is most accurate over time)
- Brier score tracking chart per model and ensemble
- Historical prediction accuracy by category
- Prediction vs. outcome scatter plot (calibration chart)
- Full math breakdown: click any prediction to see all formulas and inputs

**Data Model:**
```
Prediction {
  id: string
  marketId: string
  modelEstimates: {
    claude: { probability: number, confidence: number, reasoning: string }
    gpt4o: { probability: number, confidence: number, reasoning: string }
    grok: { probability: number, confidence: number, reasoning: string }
    gemini: { probability: number, confidence: number, reasoning: string }
    deepseek: { probability: number, confidence: number, reasoning: string }
  }
  ensembleProbability: number
  marketPrice: number
  edge: number
  expectedValue: number
  mispricingZScore: number
  confidenceInterval: [number, number]
  signalGenerated: boolean
  signalDirection: "buy_yes" | "buy_no" | null
  brierId: string (linked to outcome for scoring)
  createdAt: datetime
}
```

---

### Stage 4: RISK & EXECUTE — Position Sizing & Trade Execution

**Purpose:** Size positions using Kelly Criterion, enforce risk limits, and execute trades.

**Functional Requirements:**
- **Kelly Criterion Position Sizing:**
  - Formula: `f* = (p * b - q) / b`
  - Use fractional Kelly (0.25 to 0.5 multiplier) for safety
  - p = ensemble probability, q = 1-p, b = decimal odds - 1
- **Risk Limits (Hard Caps):**
  - Max 5% of bankroll per trade
  - Max 15 concurrent positions
  - Daily loss limit: 15% of bankroll
  - Slippage abort: if fill price deviates >2% from signal price
- **Pre-execution Checks:**
  - Edge still exists (re-check market price)
  - Value at Risk (VaR) calculation within limits
  - Portfolio correlation check (avoid overexposure to one category)
  - Sufficient bankroll after position size
- **Execution:**
  - Place limit orders via Polymarket CLOB API / Kalshi REST API
  - Monitor fill status
  - Record all execution details
- **Kill Switch:**
  - File-drop mechanism or dashboard button to immediately halt all trading
  - Triggered automatically if daily loss limit hit

**Dashboard Display:**
- Active positions table with P&L (real-time)
- Position sizing calculator showing Kelly formula inputs/outputs
- Risk dashboard:
  - Current portfolio exposure by category (pie chart)
  - Daily P&L curve
  - VaR meter
  - Distance to daily loss limit (progress bar)
  - Correlation matrix across positions
- Order book / execution log showing every order placed
- Slippage tracking per trade
- Kill switch button (prominent, red)
- Bankroll chart over time

**Data Model:**
```
Trade {
  id: string
  marketId: string
  predictionId: string
  platform: "polymarket" | "kalshi"
  direction: "buy_yes" | "buy_no"
  entryPrice: number
  fillPrice: number
  slippage: number
  positionSize: number (dollar amount)
  positionSizePct: number (% of bankroll)
  kellyFraction: number
  kellyFullSize: number
  status: "pending" | "filled" | "partial" | "cancelled" | "settled"
  exitPrice: number | null
  pnl: number | null
  settledAt: datetime | null
  createdAt: datetime
}

RiskSnapshot {
  id: string
  bankroll: number
  dailyPnl: number
  dailyPnlPct: number
  openPositions: number
  totalExposure: number
  exposureByCategory: Record<string, number>
  varValue: number
  timestamp: datetime
}
```

---

### Stage 5: COMPOUND — Post-Trade Analysis & Learning

**Purpose:** Analyze completed trades, classify outcomes, track performance, and improve the system over time.

**Functional Requirements:**
- Classify every closed trade:
  - Correct prediction + profitable
  - Correct prediction + unprofitable (execution issue)
  - Incorrect prediction (model error)
  - Edge disappeared (market moved before fill)
- Performance metrics (rolling windows: 7d, 30d, 90d, all-time):
  - Win rate (target: 60%+)
  - Sharpe ratio (target: >2.0)
  - Max drawdown (target: <8%)
  - Average edge captured
  - Profit factor
  - Average hold time
- Model-specific performance tracking
- Category-specific performance tracking
- Automated weight adjustment suggestions based on model accuracy
- Generate daily/weekly performance reports

**Dashboard Display:**
- Performance overview cards (win rate, Sharpe, drawdown, total P&L)
- Equity curve chart
- Trade history table with full details
- Classification breakdown (pie chart of outcome types)
- Performance by category bar chart
- Model accuracy comparison over time (line chart)
- Drawdown chart
- Monthly returns heatmap
- Trade distribution histogram (P&L per trade)
- Automated insights feed ("Claude outperformed Grok by 12% this week on political markets")

---

## 6. Dashboard Pages & Layout

### 6.1 Pages

| Page | Route | Purpose |
|------|-------|---------|
| Overview | `/` | High-level KPIs, equity curve, active alerts |
| Market Scanner | `/markets` | Live scanner, filters, anomaly feed |
| Market Detail | `/markets/[id]` | Deep dive: research, predictions, trades for one market |
| Research Hub | `/research` | All research activity, sentiment trends |
| Predictions | `/predictions` | All AI predictions, model comparison, math breakdowns |
| Active Trades | `/trades` | Open positions, P&L, risk metrics |
| Trade History | `/history` | Closed trades, classification, performance |
| Analytics | `/analytics` | Performance charts, model leaderboard, calibration |
| Risk Dashboard | `/risk` | Portfolio exposure, VaR, limits, kill switch |
| Settings | `/settings` | API keys, thresholds, model weights, risk limits |
| Logs | `/logs` | Full system activity log, errors, pipeline runs |

### 6.2 Global Elements
- Top navigation bar with page links
- Real-time status indicator (pipeline running / paused / error)
- Bankroll display in header
- Notification bell for alerts and anomalies
- Dark mode / light mode toggle
- Kill switch accessible from every page

---

## 7. Technical Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **UI Library:** React 19
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts + Tremor components
- **State Management:** React Query (TanStack Query) for server state
- **Real-time:** Server-Sent Events (SSE) or polling for live updates
- **Components:** shadcn/ui

### Backend (Vercel)
- **API Routes:** Next.js Route Handlers (`/app/api/...`)
- **Edge Functions:** Vercel Edge Functions for cron-triggered pipeline stages
- **Cron Jobs:** Vercel Cron (vercel.json) to trigger pipeline on schedule:
  - Scan: every 5 minutes
  - Research: every 15 minutes (for flagged markets)
  - Predict: every 15 minutes (after research completes)
  - Execute: every 5 minutes (check for actionable signals)
  - Compound: every 1 hour (analyze settled trades)

### Database
- **Primary:** Supabase (PostgreSQL)
  - All market data, research, predictions, trades, risk snapshots
  - Real-time subscriptions for dashboard updates
  - Row-level security for API key protection

### External APIs
| Service | Purpose | Rate Limits to Handle |
|---------|---------|----------------------|
| Polymarket CLOB API | Market data + order execution | TBD |
| Kalshi REST API | Market data + order execution | TBD |
| Anthropic (Claude) API | AI probability estimation | Token-based |
| OpenAI (GPT-4o) API | AI probability estimation | Token-based |
| xAI (Grok) API | AI probability estimation | Token-based |
| Google (Gemini) API | AI probability estimation | Token-based |
| DeepSeek API | AI probability estimation | Token-based |
| Twitter/X API | Sentiment data | Rate limited |
| Reddit API | Sentiment data | Rate limited |
| NewsAPI | News aggregation | 1000 req/day (free) |

### Infrastructure
- **Hosting:** Vercel (Pro plan recommended for cron frequency)
- **Database:** Supabase (free tier to start, scale as needed)
- **Version Control:** GitHub (frequent commits)
- **AI API Budget:** $50/day cap (configurable)

---

## 8. Vercel Edge Function Architecture

```
vercel.json crons:
├── /api/cron/scan          (every 5 min)  → Scan markets
├── /api/cron/research      (every 15 min) → Research flagged markets
├── /api/cron/predict       (every 15 min) → Generate predictions
├── /api/cron/execute       (every 5 min)  → Check signals & execute
├── /api/cron/compound      (every 1 hour) → Post-trade analysis
└── /api/cron/health        (every 1 min)  → System health check
```

Each cron endpoint is a Vercel Edge Function that:
1. Reads current state from Supabase
2. Performs its pipeline stage
3. Writes results back to Supabase
4. Logs all activity for dashboard consumption

---

## 9. Database Schema (Supabase/PostgreSQL)

### Tables
- `markets` — All tracked markets from all platforms
- `market_snapshots` — Price/volume snapshots over time
- `anomalies` — Detected anomalies with severity
- `research_items` — Individual research artifacts (articles, tweets, etc.)
- `research_summaries` — Aggregated research per market
- `predictions` — AI model predictions with all math
- `model_estimates` — Individual model outputs per prediction
- `trade_signals` — Generated trade signals
- `trades` — Executed trades with full lifecycle
- `risk_snapshots` — Periodic risk state captures
- `performance_metrics` — Computed performance metrics
- `pipeline_runs` — Log of every pipeline execution
- `system_config` — Configurable thresholds and settings
- `api_usage` — Track AI API costs

---

## 10. Security & Safeguards

### Trading Safeguards
- Fractional Kelly sizing (never full Kelly)
- Hard position limits enforced in code
- Daily loss circuit breaker (auto-halt at 15%)
- Slippage protection (abort if >2% deviation)
- Kill switch (dashboard button + file-drop mechanism)
- Paper trading mode for testing

### API Security
- All API keys stored as Vercel environment variables
- Supabase Row Level Security enabled
- No API keys in client-side code
- Rate limiting on all API routes
- CORS configured for dashboard domain only

### Operational
- AI API cost cap ($50/day, configurable)
- Error alerting (pipeline failures trigger notifications)
- Health check endpoint monitors all external dependencies
- Full audit trail of every decision

---

## 11. Configuration & Settings (User-Configurable)

| Setting | Default | Range |
|---------|---------|-------|
| Scan interval | 5 min | 1-60 min |
| Min market volume | 200 contracts | 50-10000 |
| Max expiry window | 30 days | 1-90 days |
| Edge threshold | 4% | 1-20% |
| Kelly fraction | 0.25 | 0.1-0.5 |
| Max position size | 5% of bankroll | 1-10% |
| Max concurrent positions | 15 | 1-50 |
| Daily loss limit | 15% | 5-25% |
| Slippage abort threshold | 2% | 0.5-5% |
| AI daily budget | $50 | $10-$500 |
| Model weights | See Stage 3 | Adjustable per model |
| Paper trading mode | ON | ON/OFF |

---

## 12. Development Phases

### Phase 1: Foundation (Week 1)
- [x] Project setup (Next.js, Tailwind, shadcn/ui)
- [ ] Supabase database schema creation
- [ ] Authentication & settings page
- [ ] Dashboard layout shell with navigation
- [ ] Basic market scanner page (static/mock data)

### Phase 2: Market Scanner (Week 2)
- [ ] Polymarket API integration
- [ ] Kalshi API integration
- [ ] Market scan Edge Function (cron)
- [ ] Anomaly detection logic
- [ ] Live market scanner dashboard page
- [ ] Market detail page

### Phase 3: Research Engine (Week 3)
- [ ] News API integration
- [ ] Twitter/Reddit sentiment pipeline
- [ ] NLP sentiment classification
- [ ] Research Edge Function (cron)
- [ ] Research hub dashboard page
- [ ] Market detail: research tab

### Phase 4: Prediction Engine (Week 4)
- [ ] Multi-model AI integration (Claude, GPT-4o, Grok, Gemini, DeepSeek)
- [ ] Ensemble probability calculation
- [ ] Edge & EV computation
- [ ] Prediction Edge Function (cron)
- [ ] Predictions dashboard page with math breakdowns
- [ ] Model comparison & calibration charts

### Phase 5: Risk & Execution (Week 5)
- [ ] Kelly Criterion position sizing
- [ ] Risk limit enforcement
- [ ] Trade execution via Polymarket/Kalshi APIs
- [ ] Execute Edge Function (cron)
- [ ] Active trades page
- [ ] Risk dashboard with kill switch
- [ ] Paper trading mode

### Phase 6: Compound & Analytics (Week 6)
- [ ] Trade outcome classification
- [ ] Performance metric computation
- [ ] Compound Edge Function (cron)
- [ ] Analytics dashboard (equity curve, Sharpe, drawdown)
- [ ] Trade history page
- [ ] Model leaderboard

### Phase 7: Polish & Go-Live (Week 7)
- [ ] Real-time updates (SSE/polling)
- [ ] Notification system
- [ ] Error handling & alerting
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Paper trading validation
- [ ] Go-live with conservative settings

---

## 13. Key Metrics & Formulas Reference

### Market Edge
```
edge = ensembleProbability - marketPrice
Trade if: edge > 0.04 (4%)
```

### Expected Value
```
EV = p * b - (1 - p)
where:
  p = ensemble probability
  b = (1 / marketPrice) - 1  (decimal odds minus 1)
```

### Kelly Criterion
```
f* = (p * b - q) / b
where:
  p = probability of winning
  q = 1 - p
  b = net odds (payout ratio)

Fractional Kelly: position = f* * kellyFraction * bankroll
```

### Brier Score
```
BS = (1/N) * Σ(forecast_i - outcome_i)²
Target: < 0.25
```

### Mispricing Z-Score
```
z = (modelProbability - marketPrice) / standardError
```

### Sharpe Ratio
```
Sharpe = (meanReturn - riskFreeRate) / stdDeviation
Target: > 2.0
```

### Value at Risk (VaR)
```
VaR_95 = portfolioValue * z_95 * portfolioVolatility * sqrt(holdingPeriod)
```

---

## 14. File Structure

```
prediction-market-bot/
├── app/
│   ├── layout.tsx                 # Root layout with nav
│   ├── page.tsx                   # Overview dashboard
│   ├── markets/
│   │   ├── page.tsx               # Market scanner
│   │   └── [id]/page.tsx          # Market detail
│   ├── research/page.tsx          # Research hub
│   ├── predictions/page.tsx       # Predictions & math
│   ├── trades/page.tsx            # Active trades
│   ├── history/page.tsx           # Trade history
│   ├── analytics/page.tsx         # Performance analytics
│   ├── risk/page.tsx              # Risk dashboard
│   ├── settings/page.tsx          # Configuration
│   ├── logs/page.tsx              # System logs
│   └── api/
│       ├── cron/
│       │   ├── scan/route.ts      # Market scanning
│       │   ├── research/route.ts  # Research gathering
│       │   ├── predict/route.ts   # AI predictions
│       │   ├── execute/route.ts   # Trade execution
│       │   ├── compound/route.ts  # Post-trade analysis
│       │   └── health/route.ts    # Health check
│       ├── markets/route.ts       # Market CRUD
│       ├── trades/route.ts        # Trade management
│       ├── predictions/route.ts   # Prediction queries
│       ├── research/route.ts      # Research queries
│       ├── risk/route.ts          # Risk data
│       ├── settings/route.ts      # Config management
│       └── kill-switch/route.ts   # Emergency halt
├── components/
│   ├── ui/                        # shadcn/ui components
│   ├── dashboard/                 # Dashboard-specific components
│   ├── charts/                    # Chart components
│   └── layout/                    # Navigation, header, etc.
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Supabase client
│   │   ├── schema.ts              # Type definitions
│   │   └── queries.ts             # Database queries
│   ├── pipeline/
│   │   ├── scanner.ts             # Market scanning logic
│   │   ├── researcher.ts          # Research aggregation
│   │   ├── predictor.ts           # AI ensemble predictions
│   │   ├── risk-manager.ts        # Risk calculations
│   │   ├── executor.ts            # Trade execution
│   │   └── compounder.ts          # Post-trade analysis
│   ├── api/
│   │   ├── polymarket.ts          # Polymarket API client
│   │   ├── kalshi.ts              # Kalshi API client
│   │   ├── anthropic.ts           # Claude API client
│   │   ├── openai.ts              # GPT-4o API client
│   │   ├── xai.ts                 # Grok API client
│   │   ├── google.ts              # Gemini API client
│   │   ├── deepseek.ts            # DeepSeek API client
│   │   ├── twitter.ts             # Twitter API client
│   │   ├── reddit.ts              # Reddit API client
│   │   └── news.ts                # News API client
│   ├── math/
│   │   ├── kelly.ts               # Kelly Criterion
│   │   ├── brier.ts               # Brier Score
│   │   ├── expected-value.ts      # EV calculations
│   │   ├── var.ts                 # Value at Risk
│   │   └── sharpe.ts              # Sharpe Ratio
│   └── utils/
│       ├── constants.ts           # App constants
│       ├── formatting.ts          # Number/date formatting
│       └── logger.ts              # Logging utility
├── types/
│   └── index.ts                   # TypeScript type definitions
├── public/                        # Static assets
├── supabase/
│   └── migrations/                # Database migrations
├── vercel.json                    # Cron job configuration
├── next.config.ts                 # Next.js config
├── tailwind.config.ts             # Tailwind config
├── tsconfig.json                  # TypeScript config
├── package.json
├── PRD.md                         # This document
└── .env.local.example             # Environment variables template
```

---

## 15. Environment Variables Required

```env
# Database
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Prediction Market APIs
POLYMARKET_API_KEY=
POLYMARKET_PRIVATE_KEY=
KALSHI_API_KEY=
KALSHI_API_SECRET=

# AI Model APIs
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
GOOGLE_AI_API_KEY=
DEEPSEEK_API_KEY=

# Social/News APIs
TWITTER_BEARER_TOKEN=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
NEWS_API_KEY=

# App Config
CRON_SECRET=               # Vercel cron authentication
NEXT_PUBLIC_APP_URL=       # Dashboard URL
```

---

## 16. Success Criteria

| Metric | Target |
|--------|--------|
| Win rate | > 60% |
| Sharpe ratio | > 2.0 |
| Max drawdown | < 8% |
| Brier score (ensemble) | < 0.25 |
| System uptime | > 99% |
| Pipeline latency (scan → signal) | < 5 min |
| Dashboard load time | < 2 sec |
| Paper trading validation | 2 weeks minimum before live |

---

## 17. Risk Warnings

- **Financial Risk:** Prediction market trading involves substantial financial risk. Past performance (including the referenced 68.4% win rate backtest) does not guarantee future results.
- **Regulatory Risk:** Prediction market legality varies by jurisdiction. Polymarket is crypto-native; Kalshi is US-regulated. Verify compliance.
- **API Risk:** External APIs can change, rate-limit, or go down. The system must handle degradation gracefully.
- **AI Risk:** AI models can be confidently wrong. The ensemble approach and calibration tracking mitigate but don't eliminate this.
- **Start with Paper Trading:** Always validate with paper trading before deploying real capital.

---

## 18. Open Questions / Decisions Needed

1. **Starting bankroll amount** — needed for risk calculations
2. **Which Polymarket markets to focus on** — all categories or specific ones?
3. **Kalshi account setup** — requires US verification
4. **AI API budget allocation** — how to split $50/day across 5 models
5. **Alert preferences** — email, SMS, or dashboard-only notifications?
6. **Authentication** — single-user (just you) or multi-user support?
7. **Mobile app** — dashboard only via web, or future mobile app consideration?
