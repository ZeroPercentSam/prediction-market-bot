/**
 * Compound Pipeline
 *
 * Analyzes settled trades, classifies outcomes, computes performance
 * metrics, and tracks model accuracy over time.
 */

import { calculateSharpeRatio, calculateMaxDrawdown, calculateProfitFactor } from "@/lib/math/sharpe";
import { calculateBrierScore } from "@/lib/math/brier";
import { createServerClient } from "@/lib/supabase/client";
import { getConfig } from "@/lib/supabase/queries";
import type { TradeClassification } from "@/types";

export interface CompoundResult {
  tradesAnalyzed: number;
  metricsUpdated: boolean;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

/**
 * Run compound analysis on settled trades
 */
export async function runCompound(): Promise<CompoundResult> {
  const supabase = createServerClient();

  // Find trades that need classification (settled but not classified)
  const { data: unsettledTrades } = await supabase
    .from("trades")
    .select("*, predictions(ensemble_probability, market_price)")
    .eq("status", "filled")
    .is("classification", null);

  // For paper trading, simulate settlement of older trades
  // In production, this would check market resolution
  let tradesAnalyzed = 0;

  for (const trade of unsettledTrades || []) {
    // For paper trades, we can't know real outcomes yet
    // Mark as settled with simulated outcome based on current market price
    // In production, check if market has resolved
    const prediction = trade.predictions;
    if (!prediction) continue;

    // Check if market has resolved by looking at the market
    const { data: market } = await supabase
      .from("markets")
      .select("current_yes_price, is_active")
      .eq("id", trade.market_id)
      .single();

    if (!market) continue;

    // If market is still active, skip (not settled yet)
    if (market.is_active) continue;

    // Market has resolved — determine outcome
    // Prefer exact settlement prices (1.0 / 0.0), fall back to price heuristic
    const price = Number(market.current_yes_price);
    const resolvedYes = price === 1 || price > 0.95;
    const resolvedNo = price === 0 || price < 0.05;

    if (!resolvedYes && !resolvedNo) continue; // Market not yet clearly resolved

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
      // Bought NO at noPrice = entryPrice (the NO price).
      // If NO resolves ($1), profit = (1/entryPrice - 1) * positionSize
      // If YES resolves, lose positionSize
      pnl = resolvedNo
        ? (1 / entryPrice - 1) * positionSize
        : -positionSize;
    }

    // Classify the trade
    let classification: TradeClassification;
    if (tradeWon && pnl > 0) {
      classification = "correct_profitable";
    } else if (tradeWon && pnl <= 0) {
      classification = "correct_unprofitable";
    } else {
      classification = "incorrect_prediction";
    }

    // Update trade
    await supabase
      .from("trades")
      .update({
        status: "settled",
        exit_price: exitPrice,
        pnl,
        pnl_pct: pnl / Number(trade.position_size),
        classification,
        settled_at: new Date().toISOString(),
      })
      .eq("id", trade.id);

    tradesAnalyzed++;
  }

  // Compute performance metrics for all periods
  const metrics = await computePerformanceMetrics();

  return {
    tradesAnalyzed,
    metricsUpdated: true,
    winRate: metrics.allTime.winRate,
    sharpeRatio: metrics.allTime.sharpeRatio,
    maxDrawdown: metrics.allTime.maxDrawdown,
  };
}

/**
 * Compute performance metrics across different time periods
 */
async function computePerformanceMetrics() {
  const supabase = createServerClient();
  const now = new Date();
  const bankroll = Number(await getConfig("bankroll", 10000));

  const periods = [
    { name: "7d" as const, daysBack: 7 },
    { name: "30d" as const, daysBack: 30 },
    { name: "90d" as const, daysBack: 90 },
    { name: "all" as const, daysBack: 3650 },
  ];

  const results: Record<string, {
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
  }> = {};

  for (const period of periods) {
    const since = new Date(now.getTime() - period.daysBack * 24 * 60 * 60 * 1000);

    const { data: trades } = await supabase
      .from("trades")
      .select("pnl, pnl_pct, classification, position_size, created_at, settled_at, prediction_id")
      .eq("status", "settled")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    if (!trades || trades.length === 0) {
      results[period.name] = { winRate: 0, sharpeRatio: 0, maxDrawdown: 0 };

      await supabase.from("performance_metrics").upsert(
        {
          period: period.name,
          win_rate: 0,
          sharpe_ratio: 0,
          max_drawdown: 0,
          total_pnl: 0,
          total_trades: 0,
          avg_edge_captured: 0,
          profit_factor: 0,
          avg_hold_time_hours: 0,
          brier_score: 0,
          calculated_at: now.toISOString(),
        },
        { onConflict: "period" }
      );
      continue;
    }

    const pnls = trades.map((t) => Number(t.pnl) || 0);
    const pnlPcts = trades.map((t) => Number(t.pnl_pct) || 0);
    const wins = trades.filter(
      (t) => t.classification === "correct_profitable"
    ).length;

    const winRate = wins / trades.length;
    const sharpeRatio = calculateSharpeRatio(pnlPcts);
    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const profitFactor = calculateProfitFactor(pnls);

    // Build equity curve for drawdown
    let equity = bankroll;
    const equityCurve = [equity];
    for (const pnl of pnls) {
      equity += pnl;
      equityCurve.push(equity);
    }
    const maxDrawdown = calculateMaxDrawdown(equityCurve);

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

    results[period.name] = { winRate, sharpeRatio, maxDrawdown };

    // Upsert metrics atomically
    await supabase.from("performance_metrics").upsert(
      {
        period: period.name,
        win_rate: winRate,
        sharpe_ratio: sharpeRatio,
        max_drawdown: maxDrawdown,
        total_pnl: totalPnl,
        total_trades: trades.length,
        avg_edge_captured: avgEdgeCaptured,
        profit_factor: profitFactor,
        avg_hold_time_hours: avgHoldTimeHours,
        brier_score: brierScore,
        calculated_at: now.toISOString(),
      },
      { onConflict: "period" }
    );
  }

  return {
    allTime: results["all"] || { winRate: 0, sharpeRatio: 0, maxDrawdown: 0 },
  };
}
