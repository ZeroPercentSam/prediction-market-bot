/**
 * Execute Job — Process trade signals, size positions, execute trades
 */

import { supabase, startPipelineRun, completePipelineRun, getConfig } from "../lib/config.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

/**
 * Fetch real-time price for a Kalshi market by ticker
 */
async function fetchKalshiLivePrice(ticker: string): Promise<{ yesPrice: number; noPrice: number } | null> {
  try {
    const res = await fetch(`${KALSHI_BASE_URL}/markets/${ticker}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data.market;
    if (!m) return null;
    const yesBid = parseFloat(m.yes_bid_dollars || "0");
    const yesAsk = parseFloat(m.yes_ask_dollars || "0");
    const yesPrice = yesBid && yesAsk ? (yesBid + yesAsk) / 2 : parseFloat(m.last_price_dollars || "0");
    return { yesPrice, noPrice: 1 - yesPrice };
  } catch {
    return null;
  }
}

/**
 * Fetch real-time price for a Polymarket market by conditionId
 */
async function fetchPolymarketLivePrice(conditionId: string): Promise<{ yesPrice: number; noPrice: number } | null> {
  try {
    const res = await fetch(`${GAMMA_BASE_URL}/markets/${conditionId}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const m = await res.json();
    const prices = JSON.parse(m.outcomePrices || "[]");
    const yesPrice = parseFloat(prices[0] || "0");
    const noPrice = parseFloat(prices[1] || "0");
    return { yesPrice, noPrice };
  } catch {
    return null;
  }
}

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
    const { data: signals, error: signalsError } = await supabase
      .from("trade_signals")
      .select(`
        *,
        predictions(ensemble_probability, market_price, edge),
        markets(id, question, platform, platform_market_id, current_yes_price, current_no_price, category)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (signalsError) {
      console.error(`[execute] Failed to fetch trade_signals:`, signalsError.message);
    }

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
    const { data: todayTrades, error: pnlError } = await supabase
      .from("trades")
      .select("pnl")
      .gte("created_at", today.toISOString())
      .not("pnl", "is", null);
    if (pnlError) {
      console.error(`[execute] Failed to fetch daily PnL:`, pnlError.message);
    }

    const dailyPnl = (todayTrades || []).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    if (dailyPnl / cfg.bankroll < -cfg.dailyLossLimitPct) {
      console.log("[execute] Daily loss limit hit, cancelling all signals");
      const { error: cancelError } = await supabase
        .from("trade_signals")
        .update({ status: "cancelled" })
        .in("id", signals.map((s) => s.id));
      if (cancelError) {
        console.error(`[execute] Failed to cancel signals:`, cancelError.message);
      }
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: signals.length,
        durationMs: Date.now() - start,
      });
      return;
    }

    let executed = 0;
    let skipped = 0;

    // Task 5: Query concurrent position count once before the loop
    const { count: initialOpenCount, error: countError } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "filled", "partial"]);
    if (countError) {
      console.error(`[execute] Failed to count open trades:`, countError.message);
    }
    let currentOpenCount = initialOpenCount || 0;

    // Task 3: Build set of markets with existing active trades for deduplication
    const { data: existingTrades } = await supabase
      .from("trades")
      .select("market_id, platform")
      .in("status", ["pending", "filled", "partial"]);

    const activePositionKeys = new Set<string>(
      (existingTrades || []).map((t) => `${t.market_id}:${t.platform}`)
    );

    for (const signal of signals) {
      const prediction = signal.predictions;
      const market = signal.markets;
      if (!prediction || !market) { skipped++; continue; }

      // Task 3: Skip if there's already an active trade for this market
      const positionKey = `${market.id}:${market.platform}`;
      if (activePositionKeys.has(positionKey)) {
        console.log(`[execute] Skipping duplicate position for "${market.question}" (${market.platform})`);
        await supabase.from("trade_signals").update({ status: "skipped", skip_reason: "duplicate_position" }).eq("id", signal.id);
        skipped++;
        continue;
      }

      // Task 5: Check concurrent positions using tracked count
      if (currentOpenCount >= cfg.maxConcurrentPositions) {
        skipped++;
        continue;
      }

      // Task 4: Fetch real-time price from exchange API
      let currentPrice: number;
      const livePrice = market.platform === "kalshi"
        ? await fetchKalshiLivePrice(market.platform_market_id)
        : await fetchPolymarketLivePrice(market.platform_market_id);

      if (livePrice) {
        currentPrice = signal.direction === "buy_yes" ? livePrice.yesPrice : livePrice.noPrice;
      } else {
        // Fall back to cached price if live fetch fails
        currentPrice = signal.direction === "buy_yes"
          ? Number(market.current_yes_price)
          : Number(market.current_no_price);
        console.warn(`[execute] Live price fetch failed for ${market.platform_market_id}, using cached price`);
      }

      const ensembleProb = Number(prediction.ensemble_probability);
      const currentEdge = signal.direction === "buy_yes"
        ? ensembleProb - currentPrice
        : (1 - ensembleProb) - currentPrice;

      if (Math.abs(currentEdge) < 0.02) {
        const { error: expireError } = await supabase.from("trade_signals").update({ status: "expired" }).eq("id", signal.id);
        if (expireError) {
          console.error(`[execute] Failed to expire signal ${signal.id}:`, expireError.message);
        }
        skipped++;
        continue;
      }

      // Kelly sizing
      const side = signal.direction === "buy_yes" ? "yes" : "no";
      const kellyP = side === "no" ? 1 - ensembleProb : ensembleProb;
      const kellyB = side === "no"
        ? (1 / (1 - Math.min(0.99, Math.max(0.01, currentPrice)))) - 1
        : (1 / Math.min(0.99, Math.max(0.01, currentPrice))) - 1;
      const kellyQ = 1 - kellyP;
      const fullKelly = Math.max(0, (kellyP * kellyB - kellyQ) / kellyB);
      const fracKelly = fullKelly * cfg.kellyFraction;
      const cappedFrac = Math.min(fracKelly, cfg.maxPositionSizePct);
      const positionSize = cappedFrac * cfg.bankroll;

      if (positionSize < 1) { skipped++; continue; }

      if (cfg.paperTradingMode) {
        const { error: tradeError } = await supabase.from("trades").insert({
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
          notes: signal.notes ?? "prediction",
        });
        if (tradeError) {
          console.error(`[execute] Failed to insert trade:`, tradeError.message);
        }
        const { error: execError } = await supabase.from("trade_signals").update({ status: "executed" }).eq("id", signal.id);
        if (execError) {
          console.error(`[execute] Failed to update signal status:`, execError.message);
        }
        executed++;
        currentOpenCount++;
        activePositionKeys.add(positionKey);
        console.log(
          `[execute] PAPER: ${signal.direction} "${market.question}" @ $${currentPrice.toFixed(4)}, $${positionSize.toFixed(2)}`
        );
      } else {
        // Live execution not yet implemented — mark signal as skipped
        const { error: skipError } = await supabase
          .from("trade_signals")
          .update({ status: "skipped", skip_reason: "live_trading_not_implemented" })
          .eq("id", signal.id);
        if (skipError) {
          console.error(`[execute] Failed to skip signal ${signal.id}:`, skipError.message);
        }
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
