/**
 * OpenRouter AI Client (Worker Version)
 *
 * Improvements over v1:
 * - Per-request AbortController timeouts (10s default)
 * - Retry with exponential backoff
 * - Cost tracking
 */

import { OpenRouter } from "@openrouter/sdk";

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export type AIModel = "claude" | "gpt4o" | "grok" | "gemini" | "deepseek";

export const MODEL_IDS: Record<AIModel, string> = {
  claude: "anthropic/claude-sonnet-4",
  gpt4o: "openai/gpt-4o",
  grok: "x-ai/grok-3",
  gemini: "google/gemini-2.5-flash-preview",
  deepseek: "deepseek/deepseek-r1",
};

export interface ModelPrediction {
  model: AIModel;
  probability: number;
  confidence: number;
  reasoning: string;
  latencyMs: number;
  costUsd: number;
}

const REQUEST_TIMEOUT_MS = 15_000; // 15s per model call
const MAX_RETRIES = 2;

/**
 * Query a single model with timeout and retry
 */
export async function queryModel(
  model: AIModel,
  systemPrompt: string,
  userPrompt: string
): Promise<ModelPrediction> {
  const modelId = MODEL_IDS[model];
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = client.callModel({
        model: modelId,
        instructions: systemPrompt,
        input: userPrompt,
        temperature: 0.3,
        maxOutputTokens: 1000,
      });

      // Race against timeout
      const text = await Promise.race([
        result.getText(),
        rejectAfterTimeout(REQUEST_TIMEOUT_MS, model),
      ]);

      let response;
      try {
        response = await Promise.race([
          result.getResponse(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Response timeout")), 5000)
          ),
        ]);
      } catch {
        response = { usage: { inputTokens: 500, outputTokens: 300 } };
      }

      const latencyMs = Date.now() - startTime;
      const parsed = parsePredictionResponse(text || "");

      const costUsd = estimateCost(
        modelId,
        response?.usage?.inputTokens || 500,
        response?.usage?.outputTokens || 300
      );

      return { model, ...parsed, latencyMs, costUsd };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(
          `[OpenRouter] ${model} attempt ${attempt + 1} failed, retrying in ${backoff}ms`
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      console.error(`[OpenRouter] ${model} failed after ${MAX_RETRIES + 1} attempts`);
      return {
        model,
        probability: 0.5,
        confidence: 0,
        reasoning: `Failed: ${error instanceof Error ? error.message : "Unknown"}`,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }

  // TypeScript requires this (unreachable)
  return {
    model,
    probability: 0.5,
    confidence: 0,
    reasoning: "Unreachable",
    latencyMs: 0,
    costUsd: 0,
  };
}

/**
 * Query all models in parallel
 */
export async function queryAllModels(
  systemPrompt: string,
  userPrompt: string,
  models: AIModel[] = ["claude", "gpt4o", "grok", "gemini", "deepseek"]
): Promise<ModelPrediction[]> {
  return Promise.all(
    models.map((model) => queryModel(model, systemPrompt, userPrompt))
  );
}

// --- Helpers ---

function rejectAfterTimeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
}

interface ParsedPrediction {
  probability: number;
  confidence: number;
  reasoning: string;
}

function parsePredictionResponse(text: string): ParsedPrediction {
  let probability = 0.5;
  let confidence = 0.5;
  let reasoning = text;

  const probMatch = text.match(/PROBABILITY:\s*([\d.]+)/i);
  if (probMatch) {
    const p = parseFloat(probMatch[1]);
    if (p >= 0.01 && p <= 0.99) probability = p;
  }

  const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
  if (confMatch) {
    const c = parseFloat(confMatch[1]);
    if (c >= 0 && c <= 1) confidence = c;
  }

  const reasonMatch = text.match(/REASONING:\s*([\s\S]+)/i);
  if (reasonMatch) {
    reasoning = reasonMatch[1].trim().slice(0, 500);
  }

  return { probability, confidence, reasoning };
}

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
