/**
 * Value at Risk (VaR) Calculation
 *
 * VaR_95 = portfolioValue * z_95 * portfolioVolatility * sqrt(holdingPeriod)
 *
 * z_95 = 1.645 (95% confidence one-tail)
 * z_99 = 2.326 (99% confidence one-tail)
 */

const Z_SCORES = {
  90: 1.282,
  95: 1.645,
  99: 2.326,
} as const;

export interface VaRResult {
  var95: number;
  var99: number;
  portfolioValue: number;
  volatility: number;
}

export function calculateVaR(
  portfolioValue: number,
  dailyReturns: number[],
  holdingPeriodDays: number = 1
): VaRResult {
  if (dailyReturns.length < 2) {
    return { var95: 0, var99: 0, portfolioValue, volatility: 0 };
  }

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) /
    (dailyReturns.length - 1);
  const volatility = Math.sqrt(variance);
  const sqrtT = Math.sqrt(holdingPeriodDays);

  return {
    var95: portfolioValue * Z_SCORES[95] * volatility * sqrtT,
    var99: portfolioValue * Z_SCORES[99] * volatility * sqrtT,
    portfolioValue,
    volatility,
  };
}
