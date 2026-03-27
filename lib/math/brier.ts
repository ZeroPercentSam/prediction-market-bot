/**
 * Brier Score — measures prediction calibration
 *
 * BS = (1/N) * Σ(forecast_i - outcome_i)²
 *
 * Score ranges: 0 (perfect) to 1 (worst)
 * Target: < 0.25
 */

export interface BrierResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  sampleSize: number;
}

export function calculateBrierScore(
  predictions: { forecast: number; outcome: 0 | 1 }[]
): BrierResult {
  if (predictions.length === 0) {
    return { score: 0, rating: "fair", sampleSize: 0 };
  }

  const sumSquaredErrors = predictions.reduce(
    (sum, { forecast, outcome }) => sum + Math.pow(forecast - outcome, 2),
    0
  );

  const score = sumSquaredErrors / predictions.length;

  let rating: BrierResult["rating"];
  if (score < 0.1) rating = "excellent";
  else if (score < 0.2) rating = "good";
  else if (score < 0.3) rating = "fair";
  else rating = "poor";

  return { score, rating, sampleSize: predictions.length };
}
