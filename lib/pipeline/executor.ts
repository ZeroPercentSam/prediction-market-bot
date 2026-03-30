/**
 * Execution Pipeline
 *
 * Processes pending trade signals, sizes positions using Kelly Criterion,
 * enforces risk limits, and executes trades (paper or live).
 */

import { calculateKelly } from "@/lib/math/kelly";
import { createServerClient } from "@/lib/supabase/client";

interface ExecutionConfig {
  kellyFraction: number;
  maxPositionSizePct: number;
  maxConcurrentPositions: number;
  dailyLossLimitPct: number;
  slippageAbortPct: number;
  paperTradingMode: boolean;
  bankroll: number;
}

export interface ExecutionResult {
  signalsProcessed: number;
  tradesExecuted: number;
  tradesSkipped: number;
  reasons: string[];
}

/**
 * Process pending trade signals and execute trades
 */
export async function runExecution(
  config: ExecutionConfig
): Promise<ExecutionResult> {
  const supabase = createServerClient();
  const result: ExecutionResult = {
    signalsProcessed: 0,
    tradesExecuted: 0,
    tradesSkipped: 0,
    reasons: [],
  };

  // Fetch pending signals
  const { data: signals } = await supabase
    .from("trade_signals")
    .select(
      `
      *,
      predictions(ensemble_probability, market_price, edge, expected_value),
      markets(id, question, platform, platform_market_id, current_yes_price, current_no_price, category)
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!signals || signals.length === 0) {
    return result;
  }

  // Check risk limits before processing
  const riskCheck = await checkRiskLimits(config);
  if (!riskCheck.canTrade) {
    result.reasons.push(`Risk limit hit: ${riskCheck.reason}`);
    // Mark all signals as cancelled
    await supabase
      .from("trade_signals")
      .update({ status: "cancelled" })
      .in(
        "id",
        signals.map((s) => s.id)
      );
    result.signalsProcessed = signals.length;
    result.tradesSkipped = signals.length;
    return result;
  }

  for (const signal of signals) {
    result.signalsProcessed++;

    const prediction = signal.predictions;
    const market = signal.markets;

    if (!prediction || !market) {
      result.tradesSkipped++;
      result.reasons.push(`Signal ${signal.id}: missing prediction or market data`);
      continue;
    }

    // Re-check edge (market may have moved since signal was generated)
    const currentPrice =
      signal.direction === "buy_yes"
        ? Number(market.current_yes_price)
        : Number(market.current_no_price);

    const currentEdge =
      signal.direction === "buy_yes"
        ? Number(prediction.ensemble_probability) - currentPrice
        : currentPrice - Number(prediction.ensemble_probability);

    if (Math.abs(currentEdge) < 0.02) {
      // Edge has shrunk below 2%
      await supabase
        .from("trade_signals")
        .update({ status: "expired" })
        .eq("id", signal.id);
      result.tradesSkipped++;
      result.reasons.push(
        `Signal ${signal.id}: edge evaporated (${(currentEdge * 100).toFixed(1)}%)`
      );
      continue;
    }

    // Calculate position size with Kelly
    const kelly = calculateKelly(
      Number(prediction.ensemble_probability),
      currentPrice,
      config.bankroll,
      config.kellyFraction,
      config.maxPositionSizePct
    );

    if (kelly.positionSize < 1) {
      result.tradesSkipped++;
      result.reasons.push(`Signal ${signal.id}: position size too small`);
      continue;
    }

    // Check concurrent position limit
    const { count: openPositions } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "filled", "partial"]);

    if ((openPositions || 0) >= config.maxConcurrentPositions) {
      result.tradesSkipped++;
      result.reasons.push(
        `Signal ${signal.id}: max concurrent positions reached (${openPositions})`
      );
      continue;
    }

    // Execute trade (paper or live)
    if (config.paperTradingMode) {
      // Paper trade: simulate fill at current price
      const { error } = await supabase.from("trades").insert({
        market_id: market.id,
        prediction_id: signal.prediction_id,
        platform: market.platform,
        direction: signal.direction,
        entry_price: currentPrice,
        fill_price: currentPrice,
        slippage: 0,
        position_size: kelly.positionSize,
        position_size_pct: kelly.positionSizePct,
        kelly_fraction: kelly.fractionalKelly,
        kelly_full_size: kelly.fullKelly * config.bankroll,
        status: "filled",
      });

      if (error) {
        console.error("[Executor] Failed to insert paper trade:", error);
        result.tradesSkipped++;
        continue;
      }

      // Mark signal as executed
      await supabase
        .from("trade_signals")
        .update({ status: "executed" })
        .eq("id", signal.id);

      result.tradesExecuted++;
      result.reasons.push(
        `PAPER TRADE: ${signal.direction} on "${market.question}" at $${currentPrice.toFixed(4)}, size $${kelly.positionSize.toFixed(2)} (${(kelly.positionSizePct * 100).toFixed(1)}% of bankroll)`
      );
    } else {
      // TODO: Live execution via Polymarket/Kalshi APIs
      // For now, skip live trades and log
      result.tradesSkipped++;
      result.reasons.push(
        `Signal ${signal.id}: live trading not yet implemented`
      );
    }
  }

  // Take risk snapshot after execution
  await takeRiskSnapshot(config);

  return result;
}

/**
 * Check if we can trade based on risk limits
 */
async function checkRiskLimits(
  config: ExecutionConfig
): Promise<{ canTrade: boolean; reason: string }> {
  const supabase = createServerClient();

  // Check daily P&L
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayTrades } = await supabase
    .from("trades")
    .select("pnl")
    .gte("created_at", today.toISOString())
    .not("pnl", "is", null);

  const dailyPnl = (todayTrades || []).reduce(
    (sum, t) => sum + (Number(t.pnl) || 0),
    0
  );
  const dailyPnlPct = dailyPnl / config.bankroll;

  if (dailyPnlPct < -config.dailyLossLimitPct) {
    return {
      canTrade: false,
      reason: `Daily loss limit hit (${(dailyPnlPct * 100).toFixed(1)}% > ${(config.dailyLossLimitPct * 100).toFixed(0)}% limit)`,
    };
  }

  return { canTrade: true, reason: "OK" };
}

/**
 * Record current risk state
 */
async function takeRiskSnapshot(config: ExecutionConfig) {
  const supabase = createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get open positions
  const { data: openTrades, count: openCount } = await supabase
    .from("trades")
    .select("*, markets(category)", { count: "exact" })
    .in("status", ["pending", "filled", "partial"]);

  const totalExposure = (openTrades || []).reduce(
    (sum, t) => sum + Number(t.position_size),
    0
  );

  // Exposure by category
  const exposureByCategory: Record<string, number> = {};
  for (const trade of openTrades || []) {
    const category = trade.markets?.category || "other";
    exposureByCategory[category] =
      (exposureByCategory[category] || 0) + Number(trade.position_size);
  }

  // Daily P&L
  const { data: todayTrades } = await supabase
    .from("trades")
    .select("pnl")
    .gte("created_at", today.toISOString())
    .not("pnl", "is", null);

  const dailyPnl = (todayTrades || []).reduce(
    (sum, t) => sum + (Number(t.pnl) || 0),
    0
  );

  await supabase.from("risk_snapshots").insert({
    bankroll: config.bankroll,
    daily_pnl: dailyPnl,
    daily_pnl_pct: dailyPnl / config.bankroll,
    open_positions: openCount || 0,
    total_exposure: totalExposure,
    exposure_by_category: exposureByCategory,
    var_value: 0, // TODO: Calculate VaR from historical returns
    kill_switch_active: false,
  });
}
