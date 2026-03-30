/**
 * Compound Pipeline
 *
 * Analyzes settled trades, classifies outcomes, computes performance
 * metrics, and tracks model accuracy over time.
 */

import { calculateSharpeRatio, calculateMaxDrawdown, calculateProfitFactor } from "@/lib/math/sharpe";
import { calculateBrierScore } from "@/lib/math/brier";
import { createServerClient } from "@/lib/supabase/client";
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
    const resolvedYes = Number(market.current_yes_price) > 0.95;
    const resolvedNo = Number(market.current_yes_price) < 0.05;

    if (!resolvedYes && !resolvedNo) continue; // Market not yet clearly resolved

    const tradeWon =
      (trade.direction === "buy_yes" && resolvedYes) ||
      (trade.direction === "buy_no" && resolvedNo);

    const entryPrice = Number(trade.entry_price);
    const exitPrice = resolvedYes ? 1.0 : 0.0;
    const pnl =
      trade.direction === "buy_yes"
        ? (exitPrice - entryPrice) * Number(trade.position_size) / entryPrice
        : (entryPrice - exitPrice) * Number(trade.position_size) / (1 - entryPrice);

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
      .select("pnl, pnl_pct, classification, position_size, created_at")
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
    let equity = 10000; // starting bankroll
    const equityCurve = [equity];
    for (const pnl of pnls) {
      equity += pnl;
      equityCurve.push(equity);
    }
    const maxDrawdown = calculateMaxDrawdown(equityCurve);

    results[period.name] = { winRate, sharpeRatio, maxDrawdown };

    // Upsert metrics — use insert since onConflict on period needs a unique constraint
    // Delete old and insert new
    await supabase
      .from("performance_metrics")
      .delete()
      .eq("period", period.name);

    await supabase.from("performance_metrics").insert({
      period: period.name,
      win_rate: winRate,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      total_pnl: totalPnl,
      total_trades: trades.length,
      avg_edge_captured: 0,
      profit_factor: profitFactor,
      avg_hold_time_hours: 0,
      brier_score: 0,
      calculated_at: now.toISOString(),
    });
  }

  return {
    allTime: results["all"] || { winRate: 0, sharpeRatio: 0, maxDrawdown: 0 },
  };
}
