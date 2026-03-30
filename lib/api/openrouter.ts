/**
 * OpenRouter AI Client
 *
 * Uses the OpenRouter SDK to query multiple AI models for prediction estimates.
 * All 5 models (Claude, GPT-4o, Grok, Gemini, DeepSeek) are accessed through
 * a single OpenRouter API key.
 */

import { OpenRouter } from "@openrouter/sdk";
import type { AIModel } from "@/types";

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Model mappings to OpenRouter model IDs
export const MODEL_IDS: Record<AIModel, string> = {
  claude: "anthropic/claude-sonnet-4",
  gpt4o: "openai/gpt-4o",
  grok: "x-ai/grok-3",
  gemini: "google/gemini-2.5-flash-preview",
  deepseek: "deepseek/deepseek-r1",
};

export interface ModelPrediction {
  model: AIModel;
  modelId: string;
  probability: number;
  confidence: number;
  reasoning: string;
  latencyMs: number;
  costUsd: number;
}

/**
 * Query a single model for a probability estimate on a prediction market question
 */
export async function queryModel(
  model: AIModel,
  marketQuestion: string,
  researchContext: string,
  currentMarketPrice: number
): Promise<ModelPrediction> {
  const modelId = MODEL_IDS[model];
  const startTime = Date.now();

  const prompt = buildPredictionPrompt(
    marketQuestion,
    researchContext,
    currentMarketPrice
  );

  try {
    const callPromise = client.callModel({
      model: modelId,
      instructions: PREDICTION_SYSTEM_PROMPT,
      input: prompt,
      temperature: 0.3,
      maxOutputTokens: 1000,
    });

    // Enforce a 30-second timeout on the model call
    const result = await Promise.race([
      callPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out after 30s")), 30_000)
      ),
    ]);

    const text = await result.getText();
    const response = await result.getResponse();
    const latencyMs = Date.now() - startTime;

    // Parse structured response
    const parsed = parsePredictionResponse(text || "");

    // Estimate cost from token usage
    const costUsd = estimateCost(
      modelId,
      response.usage?.inputTokens || 0,
      response.usage?.outputTokens || 0
    );

    return {
      model,
      modelId,
      probability: parsed.probability,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      latencyMs,
      costUsd,
    };
  } catch (error) {
    console.error(`[OpenRouter] ${model} (${modelId}) failed:`, error);
    // Return a low-confidence neutral estimate on failure
    return {
      model,
      modelId,
      probability: 0.5,
      confidence: 0,
      reasoning: `Model query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      latencyMs: Date.now() - startTime,
      costUsd: 0,
    };
  }
}

/**
 * Query all models in parallel and return results
 */
export async function queryAllModels(
  marketQuestion: string,
  researchContext: string,
  currentMarketPrice: number,
  modelsToQuery: AIModel[] = ["claude", "gpt4o", "grok", "gemini", "deepseek"]
): Promise<ModelPrediction[]> {
  const promises = modelsToQuery.map((model) =>
    queryModel(model, marketQuestion, researchContext, currentMarketPrice)
  );

  return Promise.all(promises);
}

// --- Prompts ---

const PREDICTION_SYSTEM_PROMPT = `You are a prediction market analyst. Your job is to estimate the probability of an event occurring based on available evidence.

You MUST respond in this exact format:
PROBABILITY: <number between 0.01 and 0.99>
CONFIDENCE: <number between 0.0 and 1.0>
REASONING: <2-3 sentences explaining your estimate>

Rules:
- Never output exactly 0.0 or 1.0 — use 0.01 or 0.99 at most
- PROBABILITY is your best estimate of the event happening
- CONFIDENCE is how certain you are in your estimate (1.0 = very certain, 0.0 = pure guess)
- Base your estimate on the provided evidence, not the current market price
- Be calibrated: if you say 70%, events like this should happen ~70% of the time`;

function buildPredictionPrompt(
  question: string,
  researchContext: string,
  marketPrice: number
): string {
  return `Prediction Market Question: "${question}"

Current Market Price (YES): $${marketPrice.toFixed(4)} (implied probability: ${(marketPrice * 100).toFixed(1)}%)

Research Context:
${researchContext || "No additional research available."}

Based on the evidence above, what is the probability that this event will resolve YES? Respond in the required format.`;
}

// --- Response Parsing ---

interface ParsedPrediction {
  probability: number;
  confidence: number;
  reasoning: string;
}

function parsePredictionResponse(text: string): ParsedPrediction {
  let probability = 0.5;
  let confidence = 0.5;
  let reasoning = text;

  // Parse PROBABILITY
  const probMatch = text.match(/PROBABILITY:\s*([\d.]+)/i);
  if (probMatch) {
    const p = parseFloat(probMatch[1]);
    if (p >= 0.01 && p <= 0.99) probability = p;
  }

  // Parse CONFIDENCE
  const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
  if (confMatch) {
    const c = parseFloat(confMatch[1]);
    if (c >= 0 && c <= 1) confidence = c;
  }

  // Parse REASONING
  const reasonMatch = text.match(/REASONING:\s*([\s\S]+)/i);
  if (reasonMatch) {
    reasoning = reasonMatch[1].trim().slice(0, 500);
  }

  return { probability, confidence, reasoning };
}

// --- Cost Estimation ---

// Approximate cost per 1M tokens (input/output)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "x-ai/grok-3": { input: 3.0, output: 15.0 },
  "google/gemini-2.5-flash-preview": { input: 0.15, output: 0.6 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
};

function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[modelId] || { input: 1.0, output: 3.0 };
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}
