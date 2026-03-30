/**
 * Research Job — Gathers news + sentiment for top markets
 *
 * V3 improvements:
 * - Real data fetching from NewsAPI + Twitter before LLM analysis
 * - Source-based reliability scores (not hardcoded)
 * - Actual publication dates from API responses
 * - LLM sentiment analysis as second step on real data
 * - Parallel sentiment classification (not sequential)
 * - Batch processing of markets
 */

import { supabase, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { queryModel } from "../lib/openrouter.js";

const SENTIMENT_MODEL = "gemini" as const;
const MAX_MARKETS = 15;
const MAX_SOURCES_PER_MARKET = 8;
const PARALLEL_SENTIMENT_BATCH = 5; // Classify 5 sources at a time

// Reliability scores by source type
const SOURCE_RELIABILITY: Record<string, number> = {
  news: 0.7,
  twitter: 0.4,
  reddit: 0.3,
  web: 0.5,
  ai: 0.3,
};

interface FetchedSource {
  title: string;
  snippet: string;
  url: string;
  source: "news" | "twitter" | "web" | "ai";
  published_at: string;
}

/**
 * Fetch real web research from available APIs
 */
async function fetchWebResearch(query: string): Promise<FetchedSource[]> {
  const results: FetchedSource[] = [];

  // Try NewsAPI first if key is available
  const newsApiKey = process.env.NEWS_API_KEY;
  if (newsApiKey) {
    try {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", query);
      url.searchParams.set("sortBy", "relevancy");
      url.searchParams.set("pageSize", "10");
      url.searchParams.set("language", "en");
      url.searchParams.set("apiKey", newsApiKey);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        const articles = data.articles || [];
        for (const article of articles) {
          results.push({
            title: article.title || "",
            snippet: (article.description || article.content || "").slice(0, 500),
            url: article.url || "",
            source: "news",
            published_at: article.publishedAt || new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error("[research] NewsAPI fetch failed:", error);
    }
  }

  // Try Twitter/X API if bearer token is available
  const twitterToken = process.env.TWITTER_BEARER_TOKEN;
  if (twitterToken) {
    try {
      const twitterUrl = new URL("https://api.twitter.com/2/tweets/search/recent");
      twitterUrl.searchParams.set("query", query);
      twitterUrl.searchParams.set("max_results", "10");
      twitterUrl.searchParams.set("tweet.fields", "created_at,author_id,text");

      const response = await fetch(twitterUrl.toString(), {
        headers: { Authorization: `Bearer ${twitterToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const tweets = data.data || [];
        for (const tweet of tweets) {
          results.push({
            title: tweet.text?.slice(0, 100) || "Tweet",
            snippet: tweet.text || "",
            url: `https://twitter.com/i/status/${tweet.id}`,
            source: "twitter",
            published_at: tweet.created_at || new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error("[research] Twitter API fetch failed:", error);
    }
  }

  return results;
}

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
    // Step 1: Fetch REAL data from available APIs
    const fetchedSources = await fetchWebResearch(market.question);

    let items: Array<{
      market_id: string;
      source: string;
      source_url: string;
      title: string;
      content: string;
      sentiment: "bullish" | "bearish" | "neutral";
      sentiment_score: number;
      reliability: number;
      published_at: string;
    }> = [];

    if (fetchedSources.length > 0) {
      // Step 2: Use LLM to classify sentiment on REAL data
      const sourcesToClassify = fetchedSources.slice(0, MAX_SOURCES_PER_MARKET);

      // Process sentiment in parallel batches
      for (let i = 0; i < sourcesToClassify.length; i += PARALLEL_SENTIMENT_BATCH) {
        const batch = sourcesToClassify.slice(i, i + PARALLEL_SENTIMENT_BATCH);
        const classified = await Promise.all(
          batch.map(async (src) => {
            const sentimentResult = await queryModel(
              SENTIMENT_MODEL,
              'You are a sentiment classifier for prediction markets. Given a news item and a market question, classify the sentiment. Respond with exactly:\nSENTIMENT: <bullish|bearish|neutral>\nSCORE: <number from -1.0 to 1.0>',
              `Market Question: "${market.question}"\n\nTitle: ${src.title}\nContent: ${src.snippet}\n\nClassify the sentiment of this item relative to the market question.`
            );

            const sentimentMatch = sentimentResult.reasoning.match(
              /SENTIMENT:\s*(bullish|bearish|neutral)/i
            );
            const scoreMatch = sentimentResult.reasoning.match(
              /SCORE:\s*([-\d.]+)/i
            );

            return {
              market_id: market.id,
              source: src.source,
              source_url: src.url,
              title: src.title.slice(0, 200),
              content: src.snippet.slice(0, 500),
              sentiment: (sentimentMatch?.[1]?.toLowerCase() || "neutral") as
                | "bullish"
                | "bearish"
                | "neutral",
              sentiment_score: scoreMatch
                ? Math.max(-1, Math.min(1, parseFloat(scoreMatch[1])))
                : 0,
              reliability: SOURCE_RELIABILITY[src.source] ?? 0.5,
              published_at: src.published_at,
            };
          })
        );
        items.push(...classified);
      }
    } else {
      // Fallback: use AI-generated research (clearly labeled as "ai" source)
      console.warn(
        `[research] No real sources found for market ${market.id}, falling back to AI`
      );
      const researchResult = await queryModel(
        SENTIMENT_MODEL,
        "You are a research assistant. Given a prediction market question, provide 3-5 key data points or recent developments. For each: TITLE: <title>\\nCONTENT: <2-3 sentences>\\nSENTIMENT: <bullish|bearish|neutral>\\nSCORE: <-1.0 to 1.0>\\n---",
        `What are the key facts relevant to: "${market.question}"`
      );

      items = researchResult.reasoning
        .split("---")
        .filter((s) => s.trim())
        .map((item) => {
          const titleMatch = item.match(/TITLE:\s*(.+)/i);
          const contentMatch = item.match(/CONTENT:\s*([\s\S]*?)(?=SENTIMENT:|$)/i);
          const sentimentMatch = item.match(/SENTIMENT:\s*(bullish|bearish|neutral)/i);
          const scoreMatch = item.match(/SCORE:\s*([-\d.]+)/i);

          return {
            market_id: market.id,
            source: "ai",
            source_url: "",
            title: titleMatch?.[1]?.trim() || "AI Research Point",
            content: (contentMatch?.[1]?.trim() || item.trim()).slice(0, 500),
            sentiment: (sentimentMatch?.[1]?.toLowerCase() || "neutral") as
              | "bullish"
              | "bearish"
              | "neutral",
            sentiment_score: scoreMatch
              ? Math.max(-1, Math.min(1, parseFloat(scoreMatch[1])))
              : 0,
            reliability: SOURCE_RELIABILITY.ai,
            published_at: new Date().toISOString(),
          };
        })
        .slice(0, MAX_SOURCES_PER_MARKET);
    }

    // Store research items
    if (items.length > 0) {
      const { error: insertError } = await supabase.from("research_items").insert(items);
      if (insertError) {
        console.error(`[research] Failed to insert research_items:`, insertError.message);
      }
    }

    // Compute and store summary
    const bullish = items.filter((i) => i.sentiment === "bullish").length;
    const bearish = items.filter((i) => i.sentiment === "bearish").length;
    const neutral = items.filter((i) => i.sentiment === "neutral").length;
    const aggSentiment =
      items.reduce((s, i) => s + i.sentiment_score, 0) / Math.max(1, items.length);
    const sentimentProb = (aggSentiment + 1) / 2;
    const narrativeGap = Math.abs(sentimentProb - Number(market.current_yes_price));

    const { error: upsertError } = await supabase.from("research_summaries").upsert(
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
    if (upsertError) {
      console.error(`[research] Failed to upsert research_summaries:`, upsertError.message);
    }

    return items.length;
  } catch (error) {
    console.error(`[research] Failed for market ${market.id}:`, error);
    return 0;
  }
}
