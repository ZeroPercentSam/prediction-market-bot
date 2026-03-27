// ============================================
// Core Domain Types for Prediction Market Bot
// ============================================

// --- Platform Types ---
export type Platform = "polymarket" | "kalshi";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type TradeDirection = "buy_yes" | "buy_no";
export type TradeStatus = "pending" | "filled" | "partial" | "cancelled" | "settled";
export type PipelineStage = "scan" | "research" | "predict" | "execute" | "compound";
export type AIModel = "claude" | "gpt4o" | "grok" | "gemini" | "deepseek";

// --- Market ---
export interface Market {
  id: string;
  platform: Platform;
  platformMarketId: string;
  question: string;
  description: string;
  category: string;
  currentYesPrice: number;
  currentNoPrice: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  expiryDate: string;
  spreadCents: number;
  priceChange1h: number;
  priceChange24h: number;
  anomalyFlags: string[];
  isActive: boolean;
  lastScanned: string;
  createdAt: string;
  updatedAt: string;
}

// --- Market Snapshot ---
export interface MarketSnapshot {
  id: string;
  marketId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  timestamp: string;
}

// --- Anomaly ---
export interface Anomaly {
  id: string;
  marketId: string;
  type: "price_spike" | "spread_wide" | "volume_surge";
  severity: "low" | "medium" | "high";
  description: string;
  value: number;
  threshold: number;
  detectedAt: string;
}

// --- Research ---
export interface ResearchItem {
  id: string;
  marketId: string;
  source: "twitter" | "reddit" | "news" | "rss" | "web";
  sourceUrl: string;
  title: string;
  content: string;
  sentiment: Sentiment;
  sentimentScore: number; // -1 to 1
  reliability: number; // 0 to 1
  publishedAt: string;
  analyzedAt: string;
}

export interface ResearchSummary {
  id: string;
  marketId: string;
  aggregateSentiment: number;
  sentimentBreakdown: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  sourceCount: number;
  keyThemes: string[];
  narrativeGap: number;
  lastUpdated: string;
}

// --- Prediction ---
export interface ModelEstimate {
  model: AIModel;
  probability: number;
  confidence: number;
  reasoning: string;
  weight: number;
  latencyMs: number;
  costUsd: number;
}

export interface Prediction {
  id: string;
  marketId: string;
  modelEstimates: ModelEstimate[];
  ensembleProbability: number;
  marketPrice: number;
  edge: number;
  expectedValue: number;
  mispricingZScore: number;
  confidenceInterval: [number, number];
  signalGenerated: boolean;
  signalDirection: TradeDirection | null;
  createdAt: string;
}

// --- Trade ---
export interface Trade {
  id: string;
  marketId: string;
  predictionId: string;
  platform: Platform;
  direction: TradeDirection;
  entryPrice: number;
  fillPrice: number | null;
  slippage: number | null;
  positionSize: number;
  positionSizePct: number;
  kellyFraction: number;
  kellyFullSize: number;
  status: TradeStatus;
  exitPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  classification: TradeClassification | null;
  settledAt: string | null;
  createdAt: string;
}

export type TradeClassification =
  | "correct_profitable"
  | "correct_unprofitable"
  | "incorrect_prediction"
  | "edge_disappeared";

// --- Risk ---
export interface RiskSnapshot {
  id: string;
  bankroll: number;
  dailyPnl: number;
  dailyPnlPct: number;
  openPositions: number;
  totalExposure: number;
  exposureByCategory: Record<string, number>;
  varValue: number;
  killSwitchActive: boolean;
  timestamp: string;
}

// --- Performance ---
export interface PerformanceMetrics {
  id: string;
  period: "7d" | "30d" | "90d" | "all";
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalPnl: number;
  totalTrades: number;
  avgEdgeCaptured: number;
  profitFactor: number;
  avgHoldTimeHours: number;
  brierScore: number;
  calculatedAt: string;
}

// --- Pipeline ---
export interface PipelineRun {
  id: string;
  stage: PipelineStage;
  status: "running" | "success" | "error";
  marketsProcessed: number;
  duration: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// --- System Config ---
export interface SystemConfig {
  scanIntervalMin: number;
  minMarketVolume: number;
  maxExpiryDays: number;
  edgeThreshold: number;
  kellyFraction: number;
  maxPositionSizePct: number;
  maxConcurrentPositions: number;
  dailyLossLimitPct: number;
  slippageAbortPct: number;
  aiDailyBudgetUsd: number;
  paperTradingMode: boolean;
  modelWeights: Record<AIModel, number>;
}

export const DEFAULT_CONFIG: SystemConfig = {
  scanIntervalMin: 5,
  minMarketVolume: 200,
  maxExpiryDays: 30,
  edgeThreshold: 0.04,
  kellyFraction: 0.25,
  maxPositionSizePct: 0.05,
  maxConcurrentPositions: 15,
  dailyLossLimitPct: 0.15,
  slippageAbortPct: 0.02,
  aiDailyBudgetUsd: 50,
  paperTradingMode: true,
  modelWeights: {
    claude: 0.20,
    gpt4o: 0.20,
    grok: 0.30,
    gemini: 0.15,
    deepseek: 0.15,
  },
};

// --- Dashboard ---
export interface DashboardOverview {
  bankroll: number;
  dailyPnl: number;
  dailyPnlPct: number;
  openPositions: number;
  activeMarkets: number;
  pendingSignals: number;
  winRate: number;
  sharpeRatio: number;
  pipelineStatus: Record<PipelineStage, "idle" | "running" | "error">;
  killSwitchActive: boolean;
  lastUpdated: string;
}
