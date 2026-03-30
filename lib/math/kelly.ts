/**
 * Kelly Criterion Position Sizing
 *
 * f* = (p * b - q) / b
 * where:
 *   p = probability of winning
 *   q = 1 - p (probability of losing)
 *   b = net odds received on the wager (payout ratio)
 */

export interface KellyResult {
  fullKelly: number;
  fractionalKelly: number;
  positionSize: number;
  positionSizePct: number;
}

export function calculateKelly(
  probability: number,
  marketPrice: number,
  bankroll: number,
  kellyFraction: number = 0.25,
  maxPositionPct: number = 0.05,
  side: "yes" | "no" = "yes"
): KellyResult {
  // Input validation: clamp to safe ranges
  const clampedProb = Math.min(0.99, Math.max(0.01, probability));
  const clampedPrice = Math.min(0.99, Math.max(0.01, marketPrice));

  // For buy_no: we're betting on the event NOT happening
  // p = probability of NO outcome, b = payout odds for NO shares
  const p = side === "no" ? 1 - clampedProb : clampedProb;
  const b = side === "no"
    ? (1 / (1 - clampedPrice)) - 1
    : (1 / clampedPrice) - 1;
  const q = 1 - p;

  // Full Kelly fraction
  const fullKelly = Math.max(0, (p * b - q) / b);

  // Apply fractional Kelly for safety
  const fractionalKelly = fullKelly * kellyFraction;

  // Apply position size cap
  const cappedFraction = Math.min(fractionalKelly, maxPositionPct);

  const positionSize = cappedFraction * bankroll;

  return {
    fullKelly,
    fractionalKelly,
    positionSize,
    positionSizePct: cappedFraction,
  };
}
