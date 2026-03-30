/**
 * Prediction Pipeline
 *
 * Queries multiple AI models via OpenRouter, computes weighted ensemble
 * probability, calculates edge and EV, and generates trade signals.
 */

import { queryAllModels, type ModelPrediction } from "@/lib/api/openrouter";
import { calculateExpectedValue, calculateMispricingZScore } from "@/lib/math/expected-value";
import { createServerClient } from "@/lib/supabase/client";
import type { AIModel } from "@/types";

interface PredictionConfig {
  edgeThreshold: number;
  modelWeights: Record<AIModel, number>;
  minModelAgreement: number; // minimum models that must agree on direction
}

const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  edgeThreshold: 0.04,
  modelWeights: {
    claude: 0.2,
    gpt4o: 0.2,
    grok: 0.3,
    gemini: 0.15,
    deepseek: 0.15,
  },
  minModelAgreement: 3,
};

export interface PredictionResult {
  marketId: string;
  marketQuestion: string;
  modelEstimates: ModelPrediction[];
  ensembleProbability: number;
  marketPrice: number;
  edge: number;
  expectedValue: number;
  mispricingZScore: number;
  confidenceInterval: [number, number];
  signalGenerated: boolean;
  signalDirection: "buy_yes" | "buy_no" | null;
  totalCostUsd: number;
}

/**
 * Run predictions for a batch of markets
 */
export async function runPredictions(
  markets: Array<{
    id: string;
    question: string;
    current_yes_price: number;
    researchContext?: string;
  }>,
  config: Partial<PredictionConfig> = {}
): Promise<PredictionResult[]> {
  const cfg = { ...DEFAULT_PREDICTION_CONFIG, ...config };
  const results: PredictionResult[] = [];

  // Process markets sequentially to respect API rate limits
  for (const market of markets) {
    try {
      const result = await predictMarket(market, cfg);
      results.push(result);

      // Store prediction in Supabase
      await storePrediction(result);
    } catch (error) {
      console.error(`[Predictor] Failed for market ${market.id}:`, error);
    }
  }

  return results;
}

/**
 * Predict a single market
 */
async function predictMarket(
  market: {
    id: string;
    question: string;
    current_yes_price: number;
    researchContext?: string;
  },
  cfg: PredictionConfig
): Promise<PredictionResult> {
  const marketPrice = Number(market.current_yes_price);

  // Query all models in parallel
  const modelEstimates = await queryAllModels(
    market.question,
    market.researchContext || "",
    marketPrice
  );

  // Compute weighted ensemble probability
  const ensembleProbability = computeEnsemble(modelEstimates, cfg.modelWeights);

  // Calculate edge and EV
  const evResult = calculateExpectedValue(ensembleProbability, marketPrice);
  const zScore = calculateMispricingZScore(ensembleProbability, marketPrice);

  // Compute confidence interval from model disagreement
  const confidenceInterval = computeConfidenceInterval(modelEstimates);

  // Check model agreement
  const modelsAboveMarket = modelEstimates.filter(
    (m) => m.probability > marketPrice && m.confidence > 0
  ).length;
  const modelsBelowMarket = modelEstimates.filter(
    (m) => m.probability < marketPrice && m.confidence > 0
  ).length;

  // Generate signal
  const edge = evResult.edge;
  const absEdge = Math.abs(edge);
  let signalGenerated = false;
  let signalDirection: "buy_yes" | "buy_no" | null = null;

  if (absEdge > cfg.edgeThreshold) {
    if (edge > 0 && modelsAboveMarket >= cfg.minModelAgreement) {
      signalGenerated = true;
      signalDirection = "buy_yes";
    } else if (edge < 0 && modelsBelowMarket >= cfg.minModelAgreement) {
      signalGenerated = true;
      signalDirection = "buy_no";
    }
  }

  const totalCostUsd = modelEstimates.reduce((sum, m) => sum + m.costUsd, 0);

  return {
    marketId: market.id,
    marketQuestion: market.question,
    modelEstimates,
    ensembleProbability,
    marketPrice,
    edge,
    expectedValue: evResult.expectedValue,
    mispricingZScore: zScore,
    confidenceInterval,
    signalGenerated,
    signalDirection,
    totalCostUsd,
  };
}

/**
 * Compute weighted ensemble probability
 */
function computeEnsemble(
  estimates: ModelPrediction[],
  weights: Record<AIModel, number>
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const est of estimates) {
    // Skip failed models (confidence = 0)
    if (est.confidence === 0) continue;

    const weight = weights[est.model] || 0;
    // Adjust weight by model confidence
    const effectiveWeight = weight * est.confidence;
    weightedSum += est.probability * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return 0.5; // No valid estimates
  return weightedSum / totalWeight;
}

/**
 * Compute confidence interval from model agreement/disagreement
 */
function computeConfidenceInterval(
  estimates: ModelPrediction[]
): [number, number] {
  const validEstimates = estimates.filter((e) => e.confidence > 0);
  if (validEstimates.length === 0) return [0, 1];

  const probs = validEstimates.map((e) => e.probability);
  const mean = probs.reduce((s, p) => s + p, 0) / probs.length;
  const variance =
    probs.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / probs.length;
  const stdDev = Math.sqrt(variance);

  // 95% confidence interval
  const margin = 1.96 * stdDev;
  return [
    Math.max(0.01, mean - margin),
    Math.min(0.99, mean + margin),
  ];
}

/**
 * Store prediction results in Supabase
 */
async function storePrediction(result: PredictionResult) {
  const supabase = createServerClient();

  // Insert prediction
  const { data: prediction, error: predError } = await supabase
    .from("predictions")
    .insert({
      market_id: result.marketId,
      ensemble_probability: result.ensembleProbability,
      market_price: result.marketPrice,
      edge: result.edge,
      expected_value: result.expectedValue,
      mispricing_z_score: result.mispricingZScore,
      confidence_interval: result.confidenceInterval,
      signal_generated: result.signalGenerated,
      signal_direction: result.signalDirection,
    })
    .select("id")
    .single();

  if (predError) {
    console.error("[Predictor] Failed to store prediction:", predError);
    return;
  }

  // Insert model estimates
  const modelRows = result.modelEstimates.map((est) => ({
    prediction_id: prediction.id,
    model: est.model,
    probability: est.probability,
    confidence: est.confidence,
    reasoning: est.reasoning,
    weight: DEFAULT_PREDICTION_CONFIG.modelWeights[est.model],
    latency_ms: est.latencyMs,
    cost_usd: est.costUsd,
  }));

  const { error: estError } = await supabase
    .from("model_estimates")
    .insert(modelRows);

  if (estError) {
    console.error("[Predictor] Failed to store model estimates:", estError);
  }

  // If signal generated, create trade signal
  if (result.signalGenerated && result.signalDirection) {
    const { error: sigError } = await supabase
      .from("trade_signals")
      .insert({
        prediction_id: prediction.id,
        market_id: result.marketId,
        direction: result.signalDirection,
        edge: result.edge,
        expected_value: result.expectedValue,
        recommended_size: 0, // Will be calculated by executor
        status: "pending",
      });

    if (sigError) {
      console.error("[Predictor] Failed to store trade signal:", sigError);
    }
  }

  // Track API costs
  for (const est of result.modelEstimates) {
    if (est.costUsd > 0) {
      await supabase.from("api_usage").insert({
        service: `openrouter:${est.model}`,
        endpoint: "prediction",
        cost_usd: est.costUsd,
      });
    }
  }
}
