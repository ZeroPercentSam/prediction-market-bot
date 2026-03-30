/**
 * Arb Execute Job — Validate and paper-trade cross-platform arbitrage opportunities
 *
 * Reads detected/verified arb opportunities, re-checks live prices on both
 * Polymarket and Kalshi, and places paired paper trades when combined cost < 0.97.
 */

import { supabase, startPipelineRun, completePipelineRun, getConfig, isKillSwitchActive } from "../lib/config.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

/** Max concurrent arb positions (pairs of trades) */
const MAX_CONCURRENT_ARB_POSITIONS = 5;

/** Fixed fraction of bankroll per arb leg */
const ARB_FRACTION = 0.02;

/** Max dollars per single leg */
const MAX_LEG_SIZE = 500;

/** Minimum profit margin (combined cost must be below this) */
const ARB_THRESHOLD = 0.97;

// --- Live price helpers (same as execute.ts) ---

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

export async function runArbExecuteJob(): Promise<void> {
  const runId = await startPipelineRun("arb-execute");
  const start = Date.now();

  try {
    // --- Safety: kill switch ---
    if (await isKillSwitchActive()) {
      console.log("[arb-execute] Kill switch active, aborting");
      await completePipelineRun(runId, { status: "success", marketsProcessed: 0, durationMs: Date.now() - start });
      return;
    }

    // --- Load config ---
    const bankroll = Number(await getConfig("bankroll").catch(() => 10000));
    const dailyLossLimitPct = Number(await getConfig("daily_loss_limit_pct").catch(() => 0.15));

    // --- Check daily loss limit ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayTrades } = await supabase
      .from("trades")
      .select("pnl")
      .gte("created_at", today.toISOString())
      .not("pnl", "is", null);

    const dailyPnl = (todayTrades || []).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    if (dailyPnl / bankroll < -dailyLossLimitPct) {
      console.log("[arb-execute] Daily loss limit hit, skipping arb execution");
      await completePipelineRun(runId, { status: "success", marketsProcessed: 0, durationMs: Date.now() - start });
      return;
    }

    // --- Count existing arb positions ---
    const { data: existingArbTrades } = await supabase
      .from("trades")
      .select("arb_opportunity_id")
      .not("arb_opportunity_id", "is", null)
      .in("status", ["pending", "filled", "partial"]);

    const activeArbIds = new Set<string>(
      (existingArbTrades || []).map((t) => t.arb_opportunity_id).filter(Boolean)
    );
    const currentArbPositions = activeArbIds.size;

    if (currentArbPositions >= MAX_CONCURRENT_ARB_POSITIONS) {
      console.log(`[arb-execute] Max concurrent arb positions reached (${currentArbPositions}/${MAX_CONCURRENT_ARB_POSITIONS})`);
      await completePipelineRun(runId, { status: "success", marketsProcessed: 0, durationMs: Date.now() - start });
      return;
    }

    // --- Fetch actionable opportunities ---
    const { data: opportunities, error: fetchError } = await supabase
      .from("arb_opportunities")
      .select(`
        id, poly_market_id, kalshi_market_id,
        spread, combined_price, potential_return, direction, status
      `)
      .in("status", ["detected", "verified"])
      .order("potential_return", { ascending: false })
      .limit(20);

    if (fetchError) {
      console.error("[arb-execute] Failed to fetch arb_opportunities:", fetchError.message);
    }

    if (!opportunities || opportunities.length === 0) {
      await completePipelineRun(runId, { status: "success", marketsProcessed: 0, durationMs: Date.now() - start });
      return;
    }

    let executed = 0;
    let skipped = 0;

    for (const opp of opportunities) {
      // Respect max concurrent positions
      if (currentArbPositions + executed >= MAX_CONCURRENT_ARB_POSITIONS) {
        console.log("[arb-execute] Reached max arb positions, stopping");
        break;
      }

      // Don't re-enter an arb that already has active trades
      if (activeArbIds.has(opp.id)) {
        skipped++;
        continue;
      }

      // --- Fetch both markets ---
      const { data: polyMarket } = await supabase
        .from("markets")
        .select("id, platform_market_id, question, platform")
        .eq("id", opp.poly_market_id)
        .single();

      const { data: kalshiMarket } = await supabase
        .from("markets")
        .select("id, platform_market_id, question, platform")
        .eq("id", opp.kalshi_market_id)
        .single();

      if (!polyMarket || !kalshiMarket) {
        console.warn(`[arb-execute] Missing market data for opp ${opp.id}, skipping`);
        skipped++;
        continue;
      }

      // --- Fetch live prices from both platforms ---
      const polyLive = await fetchPolymarketLivePrice(polyMarket.platform_market_id);
      const kalshiLive = await fetchKalshiLivePrice(kalshiMarket.platform_market_id);

      if (!polyLive || !kalshiLive) {
        console.warn(`[arb-execute] Live price fetch failed for opp ${opp.id} (poly=${!!polyLive}, kalshi=${!!kalshiLive}), skipping`);
        skipped++;
        continue;
      }

      // --- Validate the arb is still profitable ---
      let combinedCost: number;
      let polyDirection: "buy_yes" | "buy_no";
      let kalshiDirection: "buy_yes" | "buy_no";
      let polyEntryPrice: number;
      let kalshiEntryPrice: number;

      if (opp.direction === "buy_poly_yes_kalshi_no") {
        polyEntryPrice = polyLive.yesPrice;
        kalshiEntryPrice = kalshiLive.noPrice;
        combinedCost = polyEntryPrice + kalshiEntryPrice;
        polyDirection = "buy_yes";
        kalshiDirection = "buy_no";
      } else {
        // buy_poly_no_kalshi_yes
        polyEntryPrice = polyLive.noPrice;
        kalshiEntryPrice = kalshiLive.yesPrice;
        combinedCost = polyEntryPrice + kalshiEntryPrice;
        polyDirection = "buy_no";
        kalshiDirection = "buy_yes";
      }

      const expectedProfit = ((1 - combinedCost) / combinedCost) * 100;

      if (combinedCost >= ARB_THRESHOLD) {
        console.log(
          `[arb-execute] Arb no longer profitable: "${polyMarket.question}" vs "${kalshiMarket.question}" — combined: $${combinedCost.toFixed(4)}, profit: ${expectedProfit.toFixed(2)}%`
        );
        // Mark as expired since the window closed
        await supabase.from("arb_opportunities").update({ status: "expired" }).eq("id", opp.id);
        skipped++;
        continue;
      }

      // --- Position sizing: 2% of bankroll, capped at $500 per leg ---
      const legSize = Math.min(bankroll * ARB_FRACTION, MAX_LEG_SIZE);
      if (legSize < 1) {
        skipped++;
        continue;
      }

      const positionSizePct = legSize / bankroll;

      // --- Place paper trades (two legs) ---
      console.log(
        `[arb-execute] EXECUTING ARB: Poly "${polyMarket.question}" (${polyDirection} @ $${polyEntryPrice.toFixed(4)}) + Kalshi "${kalshiMarket.question}" (${kalshiDirection} @ $${kalshiEntryPrice.toFixed(4)})`
      );
      console.log(
        `[arb-execute]   Combined: $${combinedCost.toFixed(4)}, Expected profit: ${expectedProfit.toFixed(2)}%, Leg size: $${legSize.toFixed(2)}`
      );

      // Leg 1: Polymarket
      const { error: polyTradeError } = await supabase.from("trades").insert({
        market_id: polyMarket.id,
        platform: "polymarket",
        direction: polyDirection,
        entry_price: polyEntryPrice,
        fill_price: polyEntryPrice,
        slippage: 0,
        position_size: legSize,
        position_size_pct: positionSizePct,
        kelly_fraction: ARB_FRACTION,
        kelly_full_size: legSize,
        status: "filled",
        notes: `arb_pair:${opp.id}`,
        arb_opportunity_id: opp.id,
      });
      if (polyTradeError) {
        console.error(`[arb-execute] Failed to insert Poly trade for opp ${opp.id}:`, polyTradeError.message);
        skipped++;
        continue;
      }

      // Leg 2: Kalshi
      const { error: kalshiTradeError } = await supabase.from("trades").insert({
        market_id: kalshiMarket.id,
        platform: "kalshi",
        direction: kalshiDirection,
        entry_price: kalshiEntryPrice,
        fill_price: kalshiEntryPrice,
        slippage: 0,
        position_size: legSize,
        position_size_pct: positionSizePct,
        kelly_fraction: ARB_FRACTION,
        kelly_full_size: legSize,
        status: "filled",
        notes: `arb_pair:${opp.id}`,
        arb_opportunity_id: opp.id,
      });
      if (kalshiTradeError) {
        console.error(`[arb-execute] Failed to insert Kalshi trade for opp ${opp.id}:`, kalshiTradeError.message);
        skipped++;
        continue;
      }

      // --- Update opportunity status to executing ---
      const { error: updateError } = await supabase
        .from("arb_opportunities")
        .update({ status: "executing" })
        .eq("id", opp.id);
      if (updateError) {
        console.error(`[arb-execute] Failed to update opp status for ${opp.id}:`, updateError.message);
      }

      executed++;
      activeArbIds.add(opp.id);

      console.log(
        `[arb-execute] PAPER ARB FILLED: opp=${opp.id}, poly=${polyDirection}@$${polyEntryPrice.toFixed(4)}, kalshi=${kalshiDirection}@$${kalshiEntryPrice.toFixed(4)}, combined=$${combinedCost.toFixed(4)}, profit=${expectedProfit.toFixed(2)}%, size=$${legSize.toFixed(2)}/leg`
      );
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: executed + skipped,
      durationMs: duration,
    });
    console.log(`[arb-execute] ${executed} arb pairs executed, ${skipped} skipped`);
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
