/**
 * OpenRouter AI Client (Worker Version)
 *
 * Uses raw REST API instead of SDK to avoid Zod validation issues
 * with certain model response formats.
 *
 * - Per-request timeouts (15s)
 * - Retry with exponential backoff
 * - Cost tracking
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Fail fast if API key is missing
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error(
    "[OpenRouter] OPENROUTER_API_KEY is not set. Add it to your environment variables."
  );
}
const API_KEY = process.env.OPENROUTER_API_KEY;

// Basic rate limiting: minimum delay between concurrent requests
const MIN_REQUEST_INTERVAL_MS = 200;
let lastRequestTime = 0;

async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export type AIModel = "claude" | "gpt4o" | "grok" | "gemini" | "deepseek";

export const MODEL_IDS: Record<AIModel, string> = {
  claude: "anthropic/claude-sonnet-4",
  gpt4o: "openai/gpt-4o",
  grok: "x-ai/grok-3-mini",
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

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

/**
 * Query a single model via OpenRouter REST API
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
      await rateLimitDelay();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://prediction-market-bot-chi.vercel.app",
          "X-Title": "PredictBot",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const latencyMs = Date.now() - startTime;

      const parsed = parsePredictionResponse(text);
      const usage = data.usage || {};
      const costUsd = estimateCost(
        modelId,
        usage.prompt_tokens || 500,
        usage.completion_tokens || 300
      );

      return { model, ...parsed, latencyMs, costUsd };
    } catch (error) {
      const isAbort =
        error instanceof Error && error.name === "AbortError";
      const msg = error instanceof Error ? error.message : "Unknown";

      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 2000;
        console.warn(
          `[OpenRouter] ${model} attempt ${attempt + 1} failed (${isAbort ? "timeout" : msg}), retrying in ${backoff}ms`
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      console.error(
        `[OpenRouter] ${model} failed after ${MAX_RETRIES + 1} attempts: ${msg}`
      );
      return {
        model,
        probability: 0.5,
        confidence: 0,
        reasoning: `Failed: ${msg.slice(0, 200)}`,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }

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

// --- Parsing ---

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

// --- Cost ---

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "x-ai/grok-3-mini": { input: 0.3, output: 0.5 },
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
