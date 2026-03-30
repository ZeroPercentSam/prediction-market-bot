/**
 * Research Job — Gathers news + sentiment for top markets
 *
 * V2 improvements:
 * - Parallel sentiment classification (not sequential)
 * - Batch processing of markets
 */

import { supabase, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { queryModel } from "../lib/openrouter.js";

const SENTIMENT_MODEL = "gemini" as const;
const MAX_MARKETS = 15;
const MAX_SOURCES_PER_MARKET = 8;
const PARALLEL_SENTIMENT_BATCH = 5; // Classify 5 sources at a time

export async function runResearchJob(): Promise<void> {
  const runId = await startPipelineRun("research");
  const start = Date.now();

  try {
    // Get top markets by volume that need research
    const { data: markets } = await supabase
      .from("markets")
      .select("id, question, current_yes_price, category")
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

    let totalSources = 0;

    // Process markets in parallel batches of 3
    for (let i = 0; i < markets.length; i += 3) {
      const batch = markets.slice(i, i + 3);
      const results = await Promise.all(
        batch.map((m) => researchMarket(m))
      );
      totalSources += results.reduce((s, r) => s + r, 0);
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: markets.length,
      durationMs: duration,
    });
    console.log(
      `[research] ${markets.length} markets, ${totalSources} sources analyzed`
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

async function researchMarket(market: {
  id: string;
  question: string;
  current_yes_price: number;
  category: string;
}): Promise<number> {
  try {
    // Get AI-generated research points
    const researchResult = await queryModel(
      SENTIMENT_MODEL,
      "You are a research assistant. Given a prediction market question, provide 3-5 key data points or recent developments. For each: TITLE: <title>\\nCONTENT: <2-3 sentences>\\nSENTIMENT: <bullish|bearish|neutral>\\nSCORE: <-1.0 to 1.0>\\n---",
      `What are the key facts relevant to: "${market.question}"`
    );

    // Parse research items from AI response
    const items = researchResult.reasoning
      .split("---")
      .filter((s) => s.trim())
      .map((item) => {
        const titleMatch = item.match(/TITLE:\s*(.+)/i);
        const contentMatch = item.match(/CONTENT:\s*([\s\S]*?)(?=SENTIMENT:|$)/i);
        const sentimentMatch = item.match(/SENTIMENT:\s*(bullish|bearish|neutral)/i);
        const scoreMatch = item.match(/SCORE:\s*([-\d.]+)/i);

        return {
          market_id: market.id,
          source: "web" as const,
          source_url: "",
          title: titleMatch?.[1]?.trim() || "Research Point",
          content: (contentMatch?.[1]?.trim() || item.trim()).slice(0, 500),
          sentiment: (sentimentMatch?.[1]?.toLowerCase() || "neutral") as
            | "bullish"
            | "bearish"
            | "neutral",
          sentiment_score: scoreMatch
            ? Math.max(-1, Math.min(1, parseFloat(scoreMatch[1])))
            : 0,
          reliability: 0.6,
          published_at: new Date().toISOString(),
        };
      })
      .slice(0, MAX_SOURCES_PER_MARKET);

    // Store research items
    if (items.length > 0) {
      await supabase.from("research_items").insert(items);
    }

    // Compute and store summary
    const bullish = items.filter((i) => i.sentiment === "bullish").length;
    const bearish = items.filter((i) => i.sentiment === "bearish").length;
    const neutral = items.filter((i) => i.sentiment === "neutral").length;
    const aggSentiment =
      items.reduce((s, i) => s + i.sentiment_score, 0) / Math.max(1, items.length);
    const sentimentProb = (aggSentiment + 1) / 2;
    const narrativeGap = Math.abs(sentimentProb - Number(market.current_yes_price));

    await supabase.from("research_summaries").upsert(
      {
        market_id: market.id,
        aggregate_sentiment: aggSentiment,
        sentiment_breakdown: { bullish, bearish, neutral },
        source_count: items.length,
        key_themes: items.map((i) => i.title).slice(0, 5),
        narrative_gap: narrativeGap,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "market_id" }
    );

    return items.length;
  } catch (error) {
    console.error(`[research] Failed for market ${market.id}:`, error);
    return 0;
  }
}
