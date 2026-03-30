/**
 * Certainty Scan Job — Finds near-resolved markets and captures remaining value
 *
 * Scans for markets priced >= $0.93 or <= $0.07, verifies the outcome
 * with a cheap AI model, then places paper trades to capture the spread
 * between current price and $1.00 resolution.
 */

import { supabase, getConfig, startPipelineRun, completePipelineRun, isKillSwitchActive } from "../lib/config.js";
import { queryModel } from "../lib/openrouter.js";

const MAX_CERTAINTY_POSITIONS = 10;
const CERTAINTY_POSITION_SIZE_PCT = 0.03;
const MAX_TRADE_SIZE = 1000;
const MIN_EXPECTED_PROFIT = 5;
const MIN_EXPIRY_HOURS = 1;
const NEAR_YES_THRESHOLD = 0.93;
const NEAR_NO_THRESHOLD = 0.07;
const MIN_AI_CONFIDENCE = 0.90;

export async function runCertaintyScanJob(): Promise<void> {
  const runId = await startPipelineRun("certainty-scan");
  const start = Date.now();

  try {
    // Safety: check kill switch
    if (await isKillSwitchActive()) {
      console.log("[certainty-scan] Kill switch active, skipping");
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    const bankroll = Number(await getConfig("bankroll").catch(() => 10000));

    // 1. Find near-certain markets
    const now = new Date();
    const minExpiry = new Date(now.getTime() + MIN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Query markets near YES ($0.93+)
    const { data: nearYesMarkets, error: nearYesErr } = await supabase
      .from("markets")
      .select("id, platform, platform_market_id, question, current_yes_price, current_no_price, volume_24h, expiry_date")
      .eq("is_active", true)
      .gte("current_yes_price", NEAR_YES_THRESHOLD)
      .gt("volume_24h", 100)
      .gt("expiry_date", minExpiry.toISOString());

    if (nearYesErr) {
      console.error("[certainty-scan] Failed to query near-YES markets:", nearYesErr.message);
    }

    // Query markets near NO ($0.07-)
    const { data: nearNoMarkets, error: nearNoErr } = await supabase
      .from("markets")
      .select("id, platform, platform_market_id, question, current_yes_price, current_no_price, volume_24h, expiry_date")
      .eq("is_active", true)
      .lte("current_yes_price", NEAR_NO_THRESHOLD)
      .gt("volume_24h", 100)
      .gt("expiry_date", minExpiry.toISOString());

    if (nearNoErr) {
      console.error("[certainty-scan] Failed to query near-NO markets:", nearNoErr.message);
    }

    const candidates = [
      ...(nearYesMarkets || []).map((m) => ({ ...m, side: "yes" as const })),
      ...(nearNoMarkets || []).map((m) => ({ ...m, side: "no" as const })),
    ];

    if (candidates.length === 0) {
      console.log("[certainty-scan] No near-certain markets found");
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    // 2. Check how many certainty positions we already have
    const { count: existingCertaintyCount, error: countErr } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .eq("notes", "certainty_trade")
      .in("status", ["pending", "filled", "partial"]);

    if (countErr) {
      console.error("[certainty-scan] Failed to count existing positions:", countErr.message);
    }

    let openPositions = existingCertaintyCount || 0;

    // 3. Build set of markets where we already have ANY active position
    const { data: existingTrades } = await supabase
      .from("trades")
      .select("market_id")
      .in("status", ["pending", "filled", "partial"]);

    const activeMarketIds = new Set<string>(
      (existingTrades || []).map((t) => t.market_id)
    );

    let scanned = 0;
    let verified = 0;
    let placed = 0;

    for (const candidate of candidates) {
      scanned++;

      // Max positions check
      if (openPositions >= MAX_CERTAINTY_POSITIONS) {
        console.log("[certainty-scan] Max certainty positions reached, stopping");
        break;
      }

      // Skip if we already have a position in this market
      if (activeMarketIds.has(candidate.id)) {
        continue;
      }

      const yesPrice = Number(candidate.current_yes_price);
      const noPrice = Number(candidate.current_no_price);

      // Calculate expected profit
      const direction = candidate.side === "yes" ? "buy_yes" : "buy_no";
      const entryPrice = candidate.side === "yes" ? yesPrice : noPrice;
      const profitPerShare = 1 - entryPrice;
      const rawSize = Math.min(CERTAINTY_POSITION_SIZE_PCT * bankroll, MAX_TRADE_SIZE);
      const shares = rawSize / entryPrice;
      const expectedProfit = shares * profitPerShare;

      if (expectedProfit < MIN_EXPECTED_PROFIT) {
        continue;
      }

      // 4. Verify with AI (use DeepSeek — cheapest model)
      const priceDisplay = candidate.side === "yes"
        ? `$${yesPrice.toFixed(4)} (market thinks ${(yesPrice * 100).toFixed(1)}% likely YES)`
        : `$${yesPrice.toFixed(4)} (market thinks ${((1 - yesPrice) * 100).toFixed(1)}% likely NO)`;

      const systemPrompt = "You analyze prediction market outcomes. Be precise and factual. Only confirm if the outcome is virtually certain based on publicly known information.";
      const userPrompt = `Market question: "${candidate.question}"
Current price: ${priceDisplay}

Has this event already been confirmed/resolved? Is the outcome virtually certain?
Reply with ONLY:
CONFIRMED: yes/no
CONFIDENCE: 0.0-1.0
REASON: one sentence`;

      let aiConfirmed = false;
      let aiConfidence = 0;
      let aiReason = "";

      try {
        const result = await queryModel("deepseek", systemPrompt, userPrompt);

        // Parse the structured response
        const confirmedMatch = result.reasoning.match(/CONFIRMED:\s*(yes|no)/i);
        const confidenceMatch = result.reasoning.match(/CONFIDENCE:\s*([\d.]+)/i);
        const reasonMatch = result.reasoning.match(/REASON:\s*(.+)/i);

        aiConfirmed = confirmedMatch ? confirmedMatch[1].toLowerCase() === "yes" : false;
        aiConfidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;
        aiReason = reasonMatch ? reasonMatch[1].trim() : result.reasoning.slice(0, 200);
      } catch (err) {
        console.error(`[certainty-scan] AI verification failed for "${candidate.question}":`, err instanceof Error ? err.message : err);
        continue;
      }

      if (!aiConfirmed || aiConfidence < MIN_AI_CONFIDENCE) {
        continue;
      }

      verified++;

      // 5. Insert trade signal for dashboard tracking
      // We need a prediction row to link the signal — create a lightweight one
      const { data: prediction, error: predErr } = await supabase
        .from("predictions")
        .insert({
          market_id: candidate.id,
          ensemble_probability: candidate.side === "yes" ? 0.99 : 0.01,
          market_price: yesPrice,
          edge: profitPerShare,
          expected_value: expectedProfit,
          mispricing_z_score: 0,
          signal_generated: true,
          signal_direction: direction,
        })
        .select("id")
        .single();

      if (predErr) {
        console.error(`[certainty-scan] Failed to insert prediction for "${candidate.question}":`, predErr.message);
        continue;
      }

      const { error: signalErr } = await supabase
        .from("trade_signals")
        .insert({
          prediction_id: prediction.id,
          market_id: candidate.id,
          direction,
          edge: profitPerShare,
          expected_value: expectedProfit,
          recommended_size: rawSize,
          status: "executed",
        });

      if (signalErr) {
        console.error(`[certainty-scan] Failed to insert trade signal for "${candidate.question}":`, signalErr.message);
      }

      // 6. Place the paper trade
      const positionSize = rawSize;
      const positionSizePct = positionSize / bankroll;

      const { error: tradeErr } = await supabase
        .from("trades")
        .insert({
          market_id: candidate.id,
          prediction_id: prediction.id,
          platform: candidate.platform,
          direction,
          entry_price: entryPrice,
          fill_price: entryPrice,
          slippage: 0,
          position_size: positionSize,
          position_size_pct: positionSizePct,
          kelly_fraction: CERTAINTY_POSITION_SIZE_PCT,
          kelly_full_size: positionSize,
          status: "filled",
          notes: "certainty_trade",
        });

      if (tradeErr) {
        console.error(`[certainty-scan] Failed to insert trade for "${candidate.question}":`, tradeErr.message);
        continue;
      }

      placed++;
      openPositions++;
      activeMarketIds.add(candidate.id);

      console.log(
        `[certainty-scan] CERTAINTY: '${candidate.question}' @ $${entryPrice.toFixed(4)}, AI confirms with ${aiConfidence.toFixed(2)}, placing ${direction} for $${positionSize.toFixed(2)} — ${aiReason}`
      );
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: scanned,
      durationMs: duration,
    });

    console.log(
      `[certainty-scan] Scanned ${scanned} near-certain markets, verified ${verified}, placed ${placed} trades`
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
