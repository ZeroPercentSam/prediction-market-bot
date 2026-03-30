/**
 * Compound Job — Post-trade analysis, performance metrics, calibration retraining
 */

import { supabase, startPipelineRun, completePipelineRun, getConfig } from "../lib/config.js";
import { retrainCalibration } from "../lib/calibration.js";
import { calculateBrierScore } from "../lib/math/brier.js";
import type { AIModel } from "../lib/openrouter.js";

export async function runCompoundJob(): Promise<void> {
  const runId = await startPipelineRun("compound");
  const start = Date.now();

  try {
    // 0. Clean up stale "running" pipeline_runs (older than 15 minutes)
    const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { error: cleanupErr } = await supabase
      .from("pipeline_runs")
      .update({ status: "error", error: "Stale: never completed", completed_at: new Date().toISOString() })
      .eq("status", "running")
      .lt("started_at", staleThreshold);
    if (cleanupErr) {
      console.error("[compound] Failed to clean stale pipeline_runs:", cleanupErr.message);
    }

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
  const { data: openTrades, error: tradesError } = await supabase
    .from("trades")
    .select("*, predictions(ensemble_probability)")
    .eq("status", "filled")
    .is("classification", null);
  if (tradesError) {
    console.error(`[compound] Failed to fetch open trades:`, tradesError.message);
  }

  let settled = 0;
  for (const trade of openTrades || []) {
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("current_yes_price, is_active")
      .eq("id", trade.market_id)
      .single();
    if (marketError) {
      console.error(`[compound] Failed to fetch market ${trade.market_id}:`, marketError.message);
    }

    if (!market || market.is_active) continue;

    // Prefer exact settlement prices (1.0 / 0.0), fall back to price heuristic
    const price = Number(market.current_yes_price);
    const resolvedYes = price === 1 || price > 0.95;
    const resolvedNo = price === 0 || price < 0.05;
    if (!resolvedYes && !resolvedNo) continue;

    const tradeWon =
      (trade.direction === "buy_yes" && resolvedYes) ||
      (trade.direction === "buy_no" && resolvedNo);

    const entryPrice = Number(trade.entry_price);
    const positionSize = Number(trade.position_size);
    const exitPrice = resolvedYes ? 1.0 : 0.0;
    let pnl: number;

    if (trade.direction === "buy_yes") {
      // Bought YES at entryPrice. If YES resolves ($1), profit = (1/entryPrice - 1) * positionSize
      // If NO resolves ($0), lose positionSize
      pnl = resolvedYes
        ? (1 / entryPrice - 1) * positionSize
        : -positionSize;
    } else {
      // Bought NO at noPrice = entryPrice.
      // If NO resolves ($1), profit = (1/entryPrice - 1) * positionSize
      // If YES resolves, lose positionSize
      pnl = resolvedNo
        ? (1 / entryPrice - 1) * positionSize
        : -positionSize;
    }

    const classification = tradeWon && pnl > 0
      ? "correct_profitable"
      : tradeWon ? "correct_unprofitable"
      : "incorrect_prediction";

    const { error: settleError } = await supabase.from("trades").update({
      status: "settled",
      exit_price: exitPrice,
      pnl,
      pnl_pct: pnl / Number(trade.position_size),
      classification,
      settled_at: new Date().toISOString(),
    }).eq("id", trade.id);
    if (settleError) {
      console.error(`[compound] Failed to settle trade ${trade.id}:`, settleError.message);
    }

    settled++;
  }
  return settled;
}

async function computeMetrics(): Promise<void> {
  const bankroll = Number(await getConfig("bankroll").catch(() => 10000));

  const periods = [
    { name: "7d", days: 7 },
    { name: "30d", days: 30 },
    { name: "90d", days: 90 },
    { name: "all", days: 3650 },
  ];

  for (const period of periods) {
    const since = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
    const { data: trades, error: tradesErr } = await supabase
      .from("trades")
      .select("pnl, pnl_pct, classification, prediction_id, created_at, settled_at")
      .eq("status", "settled")
      .gte("created_at", since.toISOString());
    if (tradesErr) {
      console.error(`[compound] Failed to fetch trades for ${period.name}:`, tradesErr.message);
    }

    if (!trades || trades.length === 0) continue;

    const pnls = trades.map((t) => Number(t.pnl) || 0);
    const pnlPcts = trades.map((t) => Number(t.pnl_pct) || 0);
    const wins = trades.filter((t) => t.classification === "correct_profitable").length;
    const winRate = wins / trades.length;

    const meanReturn = pnlPcts.reduce((s, r) => s + r, 0) / pnlPcts.length;
    const variance = pnlPcts.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (pnlPcts.length - 1 || 1);
    const dailySharpe = variance > 0 ? meanReturn / Math.sqrt(variance) : 0;
    const sharpe = dailySharpe * Math.sqrt(252);

    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    let peak = bankroll, maxDrawdown = 0, equity = bankroll;
    for (const pnl of pnls) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Compute avg hold time (hours between created_at and settled_at)
    const holdTimes = trades
      .filter((t) => t.created_at && t.settled_at)
      .map((t) => (new Date(t.settled_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
    const avgHoldTimeHours = holdTimes.length > 0
      ? holdTimes.reduce((s, h) => s + h, 0) / holdTimes.length
      : 0;

    // Compute avg edge captured from predictions
    const predictionIds = trades.map((t) => t.prediction_id).filter(Boolean);
    let avgEdgeCaptured = 0;
    if (predictionIds.length > 0) {
      const { data: predictions } = await supabase
        .from("predictions")
        .select("edge")
        .in("id", predictionIds);
      if (predictions && predictions.length > 0) {
        const edges = predictions.map((p) => Number(p.edge) || 0);
        avgEdgeCaptured = edges.reduce((s, e) => s + e, 0) / edges.length;
      }
    }

    // Compute Brier score from resolved predictions
    let brierScore = 0;
    if (predictionIds.length > 0) {
      const { data: resolvedPreds } = await supabase
        .from("predictions")
        .select("ensemble_probability, markets!inner(current_yes_price, is_active)")
        .in("id", predictionIds)
        .eq("markets.is_active", false);

      if (resolvedPreds && resolvedPreds.length > 0) {
        const brierInputs = resolvedPreds
          .map((p) => {
            const market = Array.isArray(p.markets) ? p.markets[0] : p.markets;
            if (!market) return null;
            const price = Number(market.current_yes_price);
            const resolvedYes = price === 1 || price > 0.95;
            const resolvedNo = price === 0 || price < 0.05;
            if (!resolvedYes && !resolvedNo) return null;
            return {
              forecast: Number(p.ensemble_probability),
              outcome: (resolvedYes ? 1 : 0) as 0 | 1,
            };
          })
          .filter((x): x is { forecast: number; outcome: 0 | 1 } => x !== null);

        const brierResult = calculateBrierScore(brierInputs);
        brierScore = brierResult?.score ?? 0;
      }
    }

    const { error: upsertErr } = await supabase.from("performance_metrics").upsert(
      {
        period: period.name,
        win_rate: winRate * 100,         // Store as percentage (0-100)
        sharpe_ratio: sharpe,
        max_drawdown: maxDrawdown * 100, // Store as percentage (0-100)
        total_pnl: totalPnl,
        total_trades: trades.length,
        avg_edge_captured: avgEdgeCaptured,
        profit_factor: profitFactor,
        avg_hold_time_hours: avgHoldTimeHours,
        brier_score: brierScore,
        calculated_at: new Date().toISOString(),
      },
      { onConflict: "period" }
    );
    if (upsertErr) {
      console.error(`[compound] Failed to upsert metrics for ${period.name}:`, upsertErr.message);
    }
  }
}

async function retrainAllModels(): Promise<void> {
  const models: AIModel[] = ["claude", "gpt4o", "grok", "gemini", "deepseek"];
  for (const model of models) {
    try {
      await retrainCalibration(model, "all");
    } catch (e) {
      console.error(`[compound] Failed to retrain ${model}:`, e instanceof Error ? e.message : e);
    }
  }
}

async function storeCalibrationData(): Promise<void> {
  // Get resolved predictions that haven't been stored for calibration yet
  const { data: resolvedPredictions, error: predError } = await supabase
    .from("predictions")
    .select(`
      id, ensemble_probability, market_price, signal_direction,
      markets!inner(current_yes_price, is_active, category),
      model_estimates(model, probability)
    `)
    .eq("markets.is_active", false);
  if (predError) {
    console.error(`[compound] Failed to fetch resolved predictions:`, predError.message);
  }

  if (!resolvedPredictions) return;

  // Batch: collect all (prediction_id, model) pairs to check for duplicates in one query
  const allPairs: { predId: string; model: string }[] = [];
  for (const pred of resolvedPredictions) {
    for (const est of pred.model_estimates || []) {
      allPairs.push({ predId: pred.id, model: est.model });
    }
  }

  // Fetch all existing calibration data for these predictions in a single query
  const predIds = [...new Set(allPairs.map((p) => p.predId))];
  const existingSet = new Set<string>();
  if (predIds.length > 0) {
    const { data: existing } = await supabase
      .from("calibration_data")
      .select("prediction_id, model")
      .in("prediction_id", predIds);
    if (existing) {
      for (const row of existing) {
        existingSet.add(`${row.prediction_id}:${row.model}`);
      }
    }
  }

  for (const pred of resolvedPredictions) {
    const market = Array.isArray(pred.markets) ? pred.markets[0] : pred.markets;
    if (!market) continue;

    // Prefer exact settlement prices (1.0 / 0.0), fall back to price heuristic
    const price = Number(market.current_yes_price);
    const resolvedYes = price === 1 || price > 0.95;
    const resolvedNo = price === 0 || price < 0.05;
    if (!resolvedYes && !resolvedNo) continue;

    const outcome = resolvedYes ? 1 : 0;

    // Store per-model calibration data
    for (const est of pred.model_estimates || []) {
      if (existingSet.has(`${pred.id}:${est.model}`)) continue;

      const { error: calInsertErr } = await supabase.from("calibration_data").insert({
        model: est.model,
        prediction_id: pred.id,
        forecast: est.probability,
        outcome,
        category: market.category || "all",
      });
      if (calInsertErr) {
        console.error(`[compound] Failed to insert calibration_data:`, calInsertErr.message);
      }
    }
  }
}
