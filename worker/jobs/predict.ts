/**
 * Predict Job — Ensemble AI probability estimation
 *
 * V2 improvements:
 * - Parallel market processing (not sequential)
 * - Platt scaling calibration
 * - Evidence quality penalties
 * - Supervisor-style disagreement detection
 */

import {
  supabase,
  startPipelineRun,
  completePipelineRun,
  getConfig,
} from "../lib/config.js";
import { queryAllModels, type AIModel, type ModelPrediction } from "../lib/openrouter.js";
import { calibrate, applyEvidencePenalties, loadCalibrationParams } from "../lib/calibration.js";
import { runSupervisor, runResolutionSearch } from "../lib/supervisor.js";
import { getWhaleSignal, applyWhaleAdjustment } from "../lib/whale-tracker.js";
import { analyzeOrderbook, applyOrderbookAdjustment } from "../lib/orderbook.js";

const PREDICTION_SYSTEM_PROMPT = `You are a prediction market analyst. Estimate the probability of an event occurring based on available evidence.

Respond in this exact format:
PROBABILITY: <number between 0.01 and 0.99>
CONFIDENCE: <number between 0.0 and 1.0>
REASONING: <2-3 sentences explaining your estimate>

Rules:
- Never output exactly 0.0 or 1.0
- Base your estimate on evidence, not the current market price
- Be calibrated: if you say 70%, events like this should happen ~70% of the time`;

const MAX_MARKETS = 10; // Process more markets now (no timeout limit)
const PARALLEL_MARKETS = 3; // Process 3 markets at a time (5 models each = 15 concurrent)

export async function runPredictJob(): Promise<void> {
  const runId = await startPipelineRun("predict");
  const start = Date.now();

  try {
    // Load calibration params (non-fatal if fails)
    await loadCalibrationParams().catch((e) =>
      console.warn("[predict] Calibration load failed (using defaults):", e.message)
    );

    // Load config
    const modelWeightsRaw = await getConfig("model_weights").catch(() => null);
    const edgeThreshold = Number(await getConfig("edge_threshold").catch(() => 0.04));
    const modelWeights: Record<AIModel, number> = modelWeightsRaw as Record<AIModel, number> || {
      claude: 0.2, gpt4o: 0.2, grok: 0.3, gemini: 0.15, deepseek: 0.15,
    };

    // Get markets with research
    const { data: markets } = await supabase
      .from("markets")
      .select(`
        id, question, current_yes_price, category, platform, platform_market_id,
        research_summaries(aggregate_sentiment, key_themes, narrative_gap)
      `)
      .eq("is_active", true)
      .order("volume_24h", { ascending: false })
      .limit(MAX_MARKETS);

    if (!markets || markets.length === 0) {
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    let totalSignals = 0;
    let totalCost = 0;

    // Process markets in parallel batches
    for (let i = 0; i < markets.length; i += PARALLEL_MARKETS) {
      const batch = markets.slice(i, i + PARALLEL_MARKETS);
      const results = await Promise.all(
        batch.map((m) => predictMarket(m, modelWeights, edgeThreshold))
      );
      for (const r of results) {
        if (r.signalGenerated) totalSignals++;
        totalCost += r.totalCost;
      }
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: markets.length,
      durationMs: duration,
    });
    console.log(
      `[predict] ${markets.length} markets, ${totalSignals} signals, $${totalCost.toFixed(4)} cost`
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

async function predictMarket(
  market: {
    id: string;
    question: string;
    current_yes_price: number;
    category: string;
    platform: string;
    platform_market_id: string;
    research_summaries: unknown;
  },
  modelWeights: Record<AIModel, number>,
  edgeThreshold: number
): Promise<{ signalGenerated: boolean; totalCost: number }> {
  try {
    const marketPrice = Number(market.current_yes_price);
    const research = Array.isArray(market.research_summaries)
      ? market.research_summaries[0]
      : market.research_summaries;

    const researchContext = research
      ? `Sentiment: ${(research as { aggregate_sentiment: number }).aggregate_sentiment > 0 ? "bullish" : "bearish"} (${((research as { aggregate_sentiment: number }).aggregate_sentiment as number)?.toFixed(2)}). Themes: ${((research as { key_themes: string[] }).key_themes || []).join(", ")}.`
      : "No research available.";

    const userPrompt = `Market: "${market.question}"
Current YES price: $${marketPrice.toFixed(4)} (implied: ${(marketPrice * 100).toFixed(1)}%)
Research: ${researchContext}
What is the probability this resolves YES?`;

    // Query all 5 models in parallel
    const estimates = await queryAllModels(PREDICTION_SYSTEM_PROMPT, userPrompt);

    // Apply Platt calibration to each model's estimate
    const calibratedEstimates = estimates.map((est) => ({
      ...est,
      probability: calibrate(est.probability, est.model, market.category || "all"),
    }));

    // Compute weighted ensemble
    let totalWeight = 0;
    let weightedSum = 0;
    for (const est of calibratedEstimates) {
      if (est.confidence === 0) continue;
      const w = (modelWeights[est.model] || 0.2) * est.confidence;
      weightedSum += est.probability * w;
      totalWeight += w;
    }
    let ensembleProb = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    // Compute ensemble spread (disagreement)
    const validProbs = calibratedEstimates
      .filter((e) => e.confidence > 0)
      .map((e) => e.probability);
    const mean = validProbs.reduce((s, p) => s + p, 0) / Math.max(1, validProbs.length);
    const spread = Math.sqrt(
      validProbs.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(1, validProbs.length)
    );

    // Apply evidence penalties
    ensembleProb = applyEvidencePenalties(ensembleProb, {
      ensembleSpread: spread,
      evidenceQuality: research ? 0.7 : 0.3,
    });

    // --- SUPERVISOR RECONCILIATION ---
    // Only activates when model spread > 8% (significant disagreement)
    try {
      const supervisorResult = await runSupervisor(
        market.question,
        marketPrice,
        calibratedEstimates,
        researchContext
      );

      if (supervisorResult) {
        if (supervisorResult.resolutionSearches.length > 0) {
          await runResolutionSearch(
            supervisorResult.resolutionSearches,
            market.question
          ).catch(() => {});
        }

        ensembleProb =
          supervisorResult.reconciledProbability * 0.6 + ensembleProb * 0.4;

        console.log(
          `[predict] Supervisor adjusted by ${(supervisorResult.adjustmentMade * 100).toFixed(1)}% for "${market.question.slice(0, 50)}..."`
        );
      }
    } catch (e) {
      console.warn("[predict] Supervisor failed (using ensemble only):", e instanceof Error ? e.message : e);
    }

    // --- WHALE SIGNAL ---
    try {
      const whaleSignal = market.platform === "polymarket"
        ? await getWhaleSignal(market.platform_market_id, market.id)
        : null;

      if (whaleSignal) {
        const { adjustedProbability, whaleAdjustment } = applyWhaleAdjustment(
          ensembleProb,
          marketPrice,
          whaleSignal
        );
        if (whaleAdjustment !== 0) {
          ensembleProb = adjustedProbability;
          console.log(
            `[predict] Whale: ${whaleSignal.netDirection}, adjusted ${(whaleAdjustment * 100).toFixed(1)}%`
          );
        }
      }
    } catch (e) {
      console.warn("[predict] Whale tracker failed (skipping):", e instanceof Error ? e.message : e);
    }

    // --- ORDERBOOK FLOW ANALYSIS ---
    // Only for Polymarket markets (Kalshi doesn't expose full orderbook)
    if (market.platform === "polymarket") {
      try {
        // We need the token_id — fetch from gamma API using conditionId
        const gammaRes = await fetch(
          `https://gamma-api.polymarket.com/markets?condition_id=${market.platform_market_id}&limit=1`,
          { signal: AbortSignal.timeout(5_000) }
        ).catch(() => null);

        if (gammaRes?.ok) {
          const gammaData = await gammaRes.json();
          const gammaMarket = Array.isArray(gammaData) ? gammaData[0] : null;
          if (gammaMarket?.clobTokenIds) {
            const tokenIds = JSON.parse(gammaMarket.clobTokenIds);
            if (tokenIds[0]) {
              const obAnalysis = await analyzeOrderbook(tokenIds[0], market.id);
              if (obAnalysis) {
                const { adjustedProbability, orderbookAdjustment } =
                  applyOrderbookAdjustment(ensembleProb, obAnalysis);
                if (orderbookAdjustment !== 0) {
                  ensembleProb = adjustedProbability;
                  console.log(
                    `[predict] Orderbook: ${obAnalysis.signal} (strength ${obAnalysis.signalStrength.toFixed(2)}), imbalance ${(obAnalysis.imbalance * 100).toFixed(1)}%, adjusted ${(orderbookAdjustment * 100).toFixed(1)}%`
                  );
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[predict] Orderbook analysis failed (skipping):", e instanceof Error ? e.message : e);
      }
    }

    // Calculate edge and EV
    const edge = ensembleProb - marketPrice;
    const b = (1 / marketPrice) - 1;
    const ev = ensembleProb * b - (1 - ensembleProb);

    // Confidence interval
    const margin = 1.96 * spread;
    const ci: [number, number] = [
      Math.max(0.01, mean - margin),
      Math.min(0.99, mean + margin),
    ];

    // Signal generation: check edge + model agreement
    const modelsAbove = calibratedEstimates.filter(
      (e) => e.probability > marketPrice && e.confidence > 0
    ).length;
    const modelsBelow = calibratedEstimates.filter(
      (e) => e.probability < marketPrice && e.confidence > 0
    ).length;

    let signalGenerated = false;
    let signalDirection: "buy_yes" | "buy_no" | null = null;

    if (Math.abs(edge) > edgeThreshold) {
      if (edge > 0 && modelsAbove >= 3) {
        signalGenerated = true;
        signalDirection = "buy_yes";
      } else if (edge < 0 && modelsBelow >= 3) {
        signalGenerated = true;
        signalDirection = "buy_no";
      }
    }

    // Store prediction
    const { data: pred } = await supabase
      .from("predictions")
      .insert({
        market_id: market.id,
        ensemble_probability: ensembleProb,
        market_price: marketPrice,
        edge,
        expected_value: ev,
        mispricing_z_score: spread > 0 ? edge / spread : 0,
        confidence_interval: ci,
        signal_generated: signalGenerated,
        signal_direction: signalDirection,
      })
      .select("id")
      .single();

    if (pred) {
      // Store model estimates
      await supabase.from("model_estimates").insert(
        calibratedEstimates.map((est) => ({
          prediction_id: pred.id,
          model: est.model,
          probability: est.probability,
          confidence: est.confidence,
          reasoning: est.reasoning,
          weight: modelWeights[est.model] || 0.2,
          latency_ms: est.latencyMs,
          cost_usd: est.costUsd,
        }))
      );

      // Create trade signal if generated
      if (signalGenerated && signalDirection) {
        await supabase.from("trade_signals").insert({
          prediction_id: pred.id,
          market_id: market.id,
          direction: signalDirection,
          edge,
          expected_value: ev,
          recommended_size: 0,
          status: "pending",
        });
      }
    }

    const totalCost = estimates.reduce((s, e) => s + e.costUsd, 0);
    return { signalGenerated, totalCost };
  } catch (error) {
    console.error(`[predict] Failed for ${market.id}:`, error);
    return { signalGenerated: false, totalCost: 0 };
  }
}
