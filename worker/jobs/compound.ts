/**
 * Compound Job — Post-trade analysis, performance metrics, calibration retraining
 */

import { supabase, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { retrainCalibration } from "../lib/calibration.js";
import type { AIModel } from "../lib/openrouter.js";

export async function runCompoundJob(): Promise<void> {
  const runId = await startPipelineRun("compound");
  const start = Date.now();

  try {
    // 1. Settle resolved trades
    const tradesSettled = await settleResolvedTrades();

    // 2. Compute performance metrics
    await computeMetrics();

    // 3. Retrain calibration if we have enough data
    await retrainAllModels();

    // 4. Store calibration data for future retraining
    await storeCalibrationData();

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: tradesSettled,
      durationMs: duration,
    });
    console.log(`[compound] ${tradesSettled} trades settled, metrics updated`);
  } catch (error) {
    await completePipelineRun(runId, {
      status: "error",
      marketsProcessed: 0,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

async function settleResolvedTrades(): Promise<number> {
  const { data: openTrades } = await supabase
    .from("trades")
    .select("*, predictions(ensemble_probability)")
    .eq("status", "filled")
    .is("classification", null);

  let settled = 0;
  for (const trade of openTrades || []) {
    const { data: market } = await supabase
      .from("markets")
      .select("current_yes_price, is_active")
      .eq("id", trade.market_id)
      .single();

    if (!market || market.is_active) continue;

    const resolvedYes = Number(market.current_yes_price) > 0.95;
    const resolvedNo = Number(market.current_yes_price) < 0.05;
    if (!resolvedYes && !resolvedNo) continue;

    const tradeWon =
      (trade.direction === "buy_yes" && resolvedYes) ||
      (trade.direction === "buy_no" && resolvedNo);

    const entryPrice = Number(trade.entry_price);
    const exitPrice = resolvedYes ? 1.0 : 0.0;
    const pnl = trade.direction === "buy_yes"
      ? (exitPrice - entryPrice) * Number(trade.position_size) / entryPrice
      : (entryPrice - exitPrice) * Number(trade.position_size) / (1 - entryPrice);

    const classification = tradeWon && pnl > 0
      ? "correct_profitable"
      : tradeWon ? "correct_unprofitable"
      : "incorrect_prediction";

    await supabase.from("trades").update({
      status: "settled",
      exit_price: exitPrice,
      pnl,
      pnl_pct: pnl / Number(trade.position_size),
      classification,
      settled_at: new Date().toISOString(),
    }).eq("id", trade.id);

    settled++;
  }
  return settled;
}

async function computeMetrics(): Promise<void> {
  const periods = [
    { name: "7d", days: 7 },
    { name: "30d", days: 30 },
    { name: "90d", days: 90 },
    { name: "all", days: 3650 },
  ];

  for (const period of periods) {
    const since = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
    const { data: trades } = await supabase
      .from("trades")
      .select("pnl, pnl_pct, classification")
      .eq("status", "settled")
      .gte("created_at", since.toISOString());

    if (!trades || trades.length === 0) continue;

    const pnls = trades.map((t) => Number(t.pnl) || 0);
    const pnlPcts = trades.map((t) => Number(t.pnl_pct) || 0);
    const wins = trades.filter((t) => t.classification === "correct_profitable").length;
    const winRate = wins / trades.length;

    const meanReturn = pnlPcts.reduce((s, r) => s + r, 0) / pnlPcts.length;
    const variance = pnlPcts.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (pnlPcts.length - 1 || 1);
    const sharpe = variance > 0 ? meanReturn / Math.sqrt(variance) : 0;

    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    let peak = 10000, maxDrawdown = 0, equity = 10000;
    for (const pnl of pnls) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    await supabase.from("performance_metrics").delete().eq("period", period.name);
    await supabase.from("performance_metrics").insert({
      period: period.name,
      win_rate: winRate,
      sharpe_ratio: sharpe,
      max_drawdown: maxDrawdown,
      total_pnl: totalPnl,
      total_trades: trades.length,
      avg_edge_captured: 0,
      profit_factor: profitFactor === Infinity ? 999 : profitFactor,
      avg_hold_time_hours: 0,
      brier_score: 0,
      calculated_at: new Date().toISOString(),
    });
  }
}

async function retrainAllModels(): Promise<void> {
  const models: AIModel[] = ["claude", "gpt4o", "grok", "gemini", "deepseek"];
  for (const model of models) {
    try {
      await retrainCalibration(model, "all");
    } catch (e) {
      // Not enough data yet — that's fine
    }
  }
}

async function storeCalibrationData(): Promise<void> {
  // Get resolved predictions that haven't been stored for calibration yet
  const { data: resolvedPredictions } = await supabase
    .from("predictions")
    .select(`
      id, ensemble_probability, market_price, signal_direction,
      markets!inner(current_yes_price, is_active, category),
      model_estimates(model, probability)
    `)
    .eq("markets.is_active", false);

  if (!resolvedPredictions) return;

  for (const pred of resolvedPredictions) {
    const market = Array.isArray(pred.markets) ? pred.markets[0] : pred.markets;
    if (!market) continue;

    const resolvedYes = Number(market.current_yes_price) > 0.95;
    const resolvedNo = Number(market.current_yes_price) < 0.05;
    if (!resolvedYes && !resolvedNo) continue;

    const outcome = resolvedYes ? 1 : 0;

    // Store per-model calibration data
    for (const est of pred.model_estimates || []) {
      // Check if already stored
      const { count } = await supabase
        .from("calibration_data")
        .select("*", { count: "exact", head: true })
        .eq("prediction_id", pred.id)
        .eq("model", est.model);

      if ((count || 0) > 0) continue;

      await supabase.from("calibration_data").insert({
        model: est.model,
        prediction_id: pred.id,
        forecast: est.probability,
        outcome,
        category: market.category || "all",
      });
    }
  }
}
