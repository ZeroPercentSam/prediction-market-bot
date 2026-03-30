/**
 * P&L Update Job — Fetch live prices and update unrealized P&L for all open trades
 *
 * Runs every 5 minutes. For each open trade (status = 'filled'):
 *   1. Fetches real-time price from the appropriate exchange
 *   2. Calculates unrealized P&L
 *   3. Updates the trade's pnl and pnl_pct columns
 *   4. Takes a portfolio-wide risk snapshot
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

interface OpenTrade {
  id: string;
  market_id: string;
  platform: string;
  direction: string;
  entry_price: number;
  position_size: number;
  markets: {
    platform_market_id: string;
    current_yes_price: number;
    current_no_price: number;
  } | null;
}

/**
 * Process a batch of trades: fetch live prices and update P&L
 */
async function processBatch(trades: OpenTrade[]): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  for (const trade of trades) {
    try {
      const market = trade.markets;
      if (!market) {
        errors++;
        continue;
      }

      // Fetch live price from exchange
      const livePrice = trade.platform === "kalshi"
        ? await fetchKalshiLivePrice(market.platform_market_id)
        : await fetchPolymarketLivePrice(market.platform_market_id);

      let currentYesPrice: number;
      let currentNoPrice: number;

      if (livePrice) {
        currentYesPrice = livePrice.yesPrice;
        currentNoPrice = livePrice.noPrice;
      } else {
        // Fall back to cached price
        currentYesPrice = Number(market.current_yes_price);
        currentNoPrice = Number(market.current_no_price);
      }

      const entryPrice = Number(trade.entry_price);
      const positionSize = Number(trade.position_size);
      let unrealizedPnl: number;
      let unrealizedPnlPct: number;

      if (trade.direction === "buy_yes") {
        // P&L = (currentYesPrice - entryPrice) * positionSize / entryPrice
        unrealizedPnl = (currentYesPrice - entryPrice) * positionSize / entryPrice;
        unrealizedPnlPct = entryPrice > 0 ? ((currentYesPrice - entryPrice) / entryPrice) * 100 : 0;
      } else {
        // buy_no: entryNoPrice = 1 - entryPrice
        const entryNoPrice = 1 - entryPrice;
        unrealizedPnl = (currentNoPrice - entryNoPrice) * positionSize / entryNoPrice;
        unrealizedPnlPct = entryNoPrice > 0 ? ((currentNoPrice - entryNoPrice) / entryNoPrice) * 100 : 0;
      }

      // Round to 2 decimal places for currency
      unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
      unrealizedPnlPct = Math.round(unrealizedPnlPct * 10000) / 10000;

      const { error: updateError } = await supabase
        .from("trades")
        .update({
          pnl: unrealizedPnl,
          pnl_pct: unrealizedPnlPct,
        })
        .eq("id", trade.id)
        .eq("status", "filled"); // Only update if still filled (not settled mid-run)

      if (updateError) {
        console.error(`[pnl-update] Failed to update trade ${trade.id}:`, updateError.message);
        errors++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`[pnl-update] Error processing trade ${trade.id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { updated, errors };
}

export async function runPnlUpdateJob(): Promise<void> {
  const runId = await startPipelineRun("pnl-update");
  const start = Date.now();

  try {
    // Fetch all open trades with market data
    const { data: openTrades, error: tradesError } = await supabase
      .from("trades")
      .select(`
        id, market_id, platform, direction, entry_price, position_size,
        markets(platform_market_id, current_yes_price, current_no_price)
      `)
      .eq("status", "filled")
      .order("created_at", { ascending: true });

    if (tradesError) {
      console.error(`[pnl-update] Failed to fetch open trades:`, tradesError.message);
      await completePipelineRun(runId, {
        status: "error",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
        error: tradesError.message,
      });
      return;
    }

    if (!openTrades || openTrades.length === 0) {
      console.log("[pnl-update] No open trades to update");
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    // Process trades in batches of 10 to avoid rate limiting
    const BATCH_SIZE = 10;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (let i = 0; i < openTrades.length; i += BATCH_SIZE) {
      const batch = openTrades.slice(i, i + BATCH_SIZE) as unknown as OpenTrade[];
      const { updated, errors } = await processBatch(batch);
      totalUpdated += updated;
      totalErrors += errors;

      // Small delay between batches to be kind to exchange APIs
      if (i + BATCH_SIZE < openTrades.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // --- Take a risk snapshot ---

    // Sum unrealized P&L from all open trades (re-fetch after updates)
    const { data: updatedTrades } = await supabase
      .from("trades")
      .select("pnl, position_size")
      .eq("status", "filled");

    const totalUnrealizedPnl = (updatedTrades ?? []).reduce(
      (sum, t) => sum + (Number(t.pnl) || 0),
      0
    );
    const totalExposure = (updatedTrades ?? []).reduce(
      (sum, t) => sum + (Number(t.position_size) || 0),
      0
    );
    const openPositionCount = (updatedTrades ?? []).length;

    // Sum realized P&L from settled trades
    const { data: settledTrades } = await supabase
      .from("trades")
      .select("pnl")
      .eq("status", "settled")
      .not("pnl", "is", null);

    const totalRealizedPnl = (settledTrades ?? []).reduce(
      (sum, t) => sum + (Number(t.pnl) || 0),
      0
    );

    // Get initial bankroll from config
    const initialBankroll = Number(await getConfig("bankroll").catch(() => 10000));

    // Calculate current bankroll: initial + realized + unrealized
    const currentBankroll = initialBankroll + totalRealizedPnl + totalUnrealizedPnl;

    // Calculate daily P&L (settled trades today + unrealized)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todaySettled } = await supabase
      .from("trades")
      .select("pnl")
      .eq("status", "settled")
      .gte("settled_at", todayStart.toISOString())
      .not("pnl", "is", null);

    const todayRealizedPnl = (todaySettled ?? []).reduce(
      (sum, t) => sum + (Number(t.pnl) || 0),
      0
    );
    const dailyPnl = todayRealizedPnl + totalUnrealizedPnl;
    const dailyPnlPct = currentBankroll > 0 ? (dailyPnl / currentBankroll) * 100 : 0;

    // Check kill switch
    const killSwitchRaw = await getConfig("kill_switch_active").catch(() => false);
    const killSwitchActive = killSwitchRaw === true || killSwitchRaw === "true";

    // Insert risk snapshot
    const { error: snapshotError } = await supabase.from("risk_snapshots").insert({
      bankroll: Math.round(currentBankroll * 100) / 100,
      daily_pnl: Math.round(dailyPnl * 100) / 100,
      daily_pnl_pct: Math.round(dailyPnlPct * 10000) / 10000,
      open_positions: openPositionCount,
      total_exposure: Math.round(totalExposure * 100) / 100,
      exposure_by_category: {},
      var_value: 0,
      kill_switch_active: killSwitchActive,
    });

    if (snapshotError) {
      console.error(`[pnl-update] Failed to insert risk snapshot:`, snapshotError.message);
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: totalUpdated + totalErrors,
      durationMs: duration,
    });

    console.log(
      `[pnl-update] Updated P&L for ${totalUpdated} trades, portfolio: $${totalUnrealizedPnl.toFixed(2)} unrealized, $${currentBankroll.toFixed(2)} total equity`
    );
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
