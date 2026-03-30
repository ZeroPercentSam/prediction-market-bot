/**
 * Execute Job — Process trade signals, size positions, execute trades
 */

import { supabase, startPipelineRun, completePipelineRun, getConfig } from "../lib/config.js";

export async function runExecuteJob(): Promise<void> {
  const runId = await startPipelineRun("execute");
  const start = Date.now();

  try {
    const [
      kellyFraction,
      maxPositionSizePct,
      maxConcurrentPositions,
      dailyLossLimitPct,
      paperTradingMode,
      bankroll,
    ] = await Promise.all([
      getConfig("kelly_fraction").catch(() => 0.25),
      getConfig("max_position_size_pct").catch(() => 0.05),
      getConfig("max_concurrent_positions").catch(() => 15),
      getConfig("daily_loss_limit_pct").catch(() => 0.15),
      getConfig("paper_trading_mode").catch(() => true),
      getConfig("bankroll").catch(() => 10000),
    ]);

    const cfg = {
      kellyFraction: Number(kellyFraction),
      maxPositionSizePct: Number(maxPositionSizePct),
      maxConcurrentPositions: Number(maxConcurrentPositions),
      dailyLossLimitPct: Number(dailyLossLimitPct),
      paperTradingMode: paperTradingMode === true || paperTradingMode === "true",
      bankroll: Number(bankroll),
    };

    // Fetch pending signals
    const { data: signals } = await supabase
      .from("trade_signals")
      .select(`
        *,
        predictions(ensemble_probability, market_price, edge),
        markets(id, question, platform, platform_market_id, current_yes_price, current_no_price, category)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!signals || signals.length === 0) {
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    // Check daily loss limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayTrades } = await supabase
      .from("trades")
      .select("pnl")
      .gte("created_at", today.toISOString())
      .not("pnl", "is", null);

    const dailyPnl = (todayTrades || []).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    if (dailyPnl / cfg.bankroll < -cfg.dailyLossLimitPct) {
      console.log("[execute] Daily loss limit hit, cancelling all signals");
      await supabase
        .from("trade_signals")
        .update({ status: "cancelled" })
        .in("id", signals.map((s) => s.id));
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: signals.length,
        durationMs: Date.now() - start,
      });
      return;
    }

    let executed = 0;
    let skipped = 0;

    for (const signal of signals) {
      const prediction = signal.predictions;
      const market = signal.markets;
      if (!prediction || !market) { skipped++; continue; }

      // Check concurrent positions
      const { count: openCount } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "filled", "partial"]);

      if ((openCount || 0) >= cfg.maxConcurrentPositions) {
        skipped++;
        continue;
      }

      // Re-check edge
      const currentPrice = signal.direction === "buy_yes"
        ? Number(market.current_yes_price)
        : Number(market.current_no_price);
      const currentEdge = signal.direction === "buy_yes"
        ? Number(prediction.ensemble_probability) - currentPrice
        : currentPrice - Number(prediction.ensemble_probability);

      if (Math.abs(currentEdge) < 0.02) {
        await supabase.from("trade_signals").update({ status: "expired" }).eq("id", signal.id);
        skipped++;
        continue;
      }

      // Kelly sizing
      const p = Number(prediction.ensemble_probability);
      const b = (1 / currentPrice) - 1;
      const q = 1 - p;
      const fullKelly = Math.max(0, (p * b - q) / b);
      const fracKelly = fullKelly * cfg.kellyFraction;
      const cappedFrac = Math.min(fracKelly, cfg.maxPositionSizePct);
      const positionSize = cappedFrac * cfg.bankroll;

      if (positionSize < 1) { skipped++; continue; }

      if (cfg.paperTradingMode) {
        await supabase.from("trades").insert({
          market_id: market.id,
          prediction_id: signal.prediction_id,
          platform: market.platform,
          direction: signal.direction,
          entry_price: currentPrice,
          fill_price: currentPrice,
          slippage: 0,
          position_size: positionSize,
          position_size_pct: cappedFrac,
          kelly_fraction: fracKelly,
          kelly_full_size: fullKelly * cfg.bankroll,
          status: "filled",
        });
        await supabase.from("trade_signals").update({ status: "executed" }).eq("id", signal.id);
        executed++;
        console.log(
          `[execute] PAPER: ${signal.direction} "${market.question}" @ $${currentPrice.toFixed(4)}, $${positionSize.toFixed(2)}`
        );
      } else {
        // TODO: Live execution via Polymarket/Kalshi APIs
        skipped++;
      }
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: executed + skipped,
      durationMs: duration,
    });
    console.log(`[execute] ${executed} executed, ${skipped} skipped`);
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
