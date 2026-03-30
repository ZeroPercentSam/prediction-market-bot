/**
 * Expected Value Calculations
 *
 * EV = p * b - (1 - p)
 * where:
 *   p = model probability
 *   b = (1 / marketPrice) - 1 (decimal odds minus 1)
 */

export interface EVResult {
  expectedValue: number;
  edge: number;
  edgePct: number;
  decimalOdds: number;
  impliedProbability: number;
}

export function calculateExpectedValue(
  modelProbability: number,
  marketPrice: number
): EVResult {
  // Guard against division by zero when marketPrice is 0 or 1
  const safePrice = Math.min(0.99, Math.max(0.01, marketPrice));

  const b = (1 / safePrice) - 1;
  const ev = modelProbability * b - (1 - modelProbability);
  const edge = modelProbability - safePrice;

  return {
    expectedValue: ev,
    edge,
    edgePct: edge * 100,
    decimalOdds: 1 / safePrice,
    impliedProbability: safePrice,
  };
}

/**
 * Calculate mispricing Z-score
 * Measures how many standard deviations the model estimate
 * is from the market price
 */
export function calculateMispricingZScore(
  modelProbability: number,
  marketPrice: number,
  standardError: number = 0.05
): number {
  return (modelProbability - marketPrice) / standardError;
}
