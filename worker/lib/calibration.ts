/**
 * Platt Scaling Calibration
 *
 * LLMs are systematically miscalibrated:
 * - Overconfident on high-probability events
 * - Underconfident on narrative events
 * - Biased toward 0.50 due to RLHF
 *
 * Platt scaling: calibrated_p = 1 / (1 + exp(-(a * raw_p + b)))
 * Default a ≈ sqrt(3) ≈ 1.73, b = 0 (from AIA Forecaster research)
 *
 * After 30+ resolved markets, we fit a/b from historical data.
 */

import { supabase } from "./config.js";
import type { AIModel } from "./openrouter.js";

interface CalibrationParams {
  a: number;
  b: number;
  sampleSize: number;
}

// Default Platt scaling parameters (before we have enough data to fit)
const DEFAULT_PARAMS: CalibrationParams = {
  a: 1.73, // sqrt(3) — "extremizes" hedged probabilities
  b: 0,
  sampleSize: 0,
};

// Cache calibration params per model+category
const paramsCache = new Map<string, CalibrationParams>();

/**
 * Apply Platt scaling to a raw probability estimate
 */
export function calibrate(
  rawProbability: number,
  model: AIModel,
  category: string = "all"
): number {
  const params = getParams(model, category);
  const logit = params.a * logit_transform(rawProbability) + params.b;
  const calibrated = sigmoid(logit);

  // Clamp to [0.01, 0.99]
  return Math.max(0.01, Math.min(0.99, calibrated));
}

/**
 * Apply additional penalties based on evidence quality
 */
export function applyEvidencePenalties(
  probability: number,
  options: {
    evidenceQuality?: number; // 0 = no evidence, 1 = strong evidence
    contradictionLevel?: number; // 0 = no contradictions, 1 = fully contradictory
    ensembleSpread?: number; // standard deviation across models
  }
): number {
  let p = probability;

  // Evidence quality penalty: weak evidence → shift toward 0.50
  if (options.evidenceQuality !== undefined && options.evidenceQuality < 0.5) {
    const penalty = (0.5 - options.evidenceQuality) * 0.3;
    p = p + (0.5 - p) * penalty;
  }

  // Contradiction penalty: conflicting sources → increase uncertainty
  if (
    options.contradictionLevel !== undefined &&
    options.contradictionLevel > 0.3
  ) {
    const penalty = options.contradictionLevel * 0.2;
    p = p + (0.5 - p) * penalty;
  }

  // Ensemble spread penalty: high disagreement → increase uncertainty
  if (options.ensembleSpread !== undefined && options.ensembleSpread > 0.1) {
    const penalty = Math.min(0.3, options.ensembleSpread);
    p = p + (0.5 - p) * penalty;
  }

  return Math.max(0.01, Math.min(0.99, p));
}

/**
 * Load calibration params from Supabase (or use defaults)
 */
export async function loadCalibrationParams(): Promise<void> {
  const { data } = await supabase.from("calibration_params").select("*");

  if (data) {
    for (const row of data) {
      const key = `${row.model}:${row.category}`;
      paramsCache.set(key, {
        a: Number(row.platt_a),
        b: Number(row.platt_b),
        sampleSize: Number(row.sample_size),
      });
    }
    console.log(
      `[Calibration] Loaded ${data.length} calibration parameter sets`
    );
  }
}

/**
 * Retrain calibration params from historical data
 * Should be called after 30+ resolved markets
 */
export async function retrainCalibration(
  model: AIModel,
  category: string = "all"
): Promise<CalibrationParams> {
  // Fetch resolved predictions for this model
  const { data } = await supabase
    .from("calibration_data")
    .select("forecast, outcome")
    .eq("model", model)
    .eq("category", category);

  if (!data || data.length < 30) {
    console.log(
      `[Calibration] Not enough data for ${model}/${category} (${data?.length || 0}/30)`
    );
    return DEFAULT_PARAMS;
  }

  // Fit Platt scaling via gradient descent (simple logistic regression)
  const params = fitPlattScaling(
    data.map((d) => ({ forecast: Number(d.forecast), outcome: Number(d.outcome) }))
  );

  // Store in database
  await supabase.from("calibration_params").upsert(
    {
      model,
      category,
      platt_a: params.a,
      platt_b: params.b,
      sample_size: data.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "model,category" }
  );

  // Update cache
  paramsCache.set(`${model}:${category}`, params);
  console.log(
    `[Calibration] Retrained ${model}/${category}: a=${params.a.toFixed(4)}, b=${params.b.toFixed(4)} (n=${data.length})`
  );

  return params;
}

// --- Internal ---

function getParams(model: AIModel, category: string): CalibrationParams {
  // Try model+category specific, then model-level, then default
  return (
    paramsCache.get(`${model}:${category}`) ||
    paramsCache.get(`${model}:all`) ||
    DEFAULT_PARAMS
  );
}

function logit_transform(p: number): number {
  // Clamp to avoid log(0) or log(infinity)
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Fit Platt scaling parameters (a, b) using Newton's method
 * Minimizes: -sum(y*log(sigmoid(a*logit(f)+b)) + (1-y)*log(1-sigmoid(a*logit(f)+b)))
 */
function fitPlattScaling(
  data: Array<{ forecast: number; outcome: number }>
): CalibrationParams {
  let a = 1.73; // Start from default
  let b = 0;
  const lr = 0.01;
  const iterations = 500;

  for (let i = 0; i < iterations; i++) {
    let gradA = 0;
    let gradB = 0;

    for (const { forecast, outcome } of data) {
      const logitF = logit_transform(forecast);
      const z = a * logitF + b;
      const pred = sigmoid(z);
      const error = pred - outcome;
      gradA += error * logitF;
      gradB += error;
    }

    gradA /= data.length;
    gradB /= data.length;

    a -= lr * gradA;
    b -= lr * gradB;
  }

  return { a, b, sampleSize: data.length };
}
