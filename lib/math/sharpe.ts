/**
 * Sharpe Ratio
 *
 * Sharpe = (meanReturn - riskFreeRate) / stdDeviation
 * Target: > 2.0
 */

export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.05 / 365 // ~5% annualized, daily
): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) /
    (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  const dailySharpe = (mean - riskFreeRate) / stdDev;
  return dailySharpe * Math.sqrt(252);
}

/**
 * Calculate max drawdown from an equity curve
 */
export function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;

  let peak = equityCurve[0];
  let maxDrawdown = 0;

  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

/**
 * Calculate profit factor (gross profit / gross loss)
 */
export function calculateProfitFactor(pnls: number[]): number {
  const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(
    pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0)
  );

  if (grossLoss === 0) return grossProfit > 0 ? 999 : 0;
  return grossProfit / grossLoss;
}
