/**
 * Research Pipeline
 *
 * Gathers news and web data for markets, analyzes sentiment,
 * and stores research summaries in Supabase.
 *
 * Uses OpenRouter to do NLP sentiment classification on gathered content.
 */

import { OpenRouter } from "@openrouter/sdk";
import { createServerClient } from "@/lib/supabase/client";
import type { Sentiment } from "@/types";

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Use a fast, cheap model for sentiment classification
const SENTIMENT_MODEL = "google/gemini-2.5-flash-preview";

interface ResearchConfig {
  maxSourcesPerMarket: number;
  newsApiKey?: string;
}

const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  maxSourcesPerMarket: 10,
  newsApiKey: process.env.NEWS_API_KEY || "",
};

export interface ResearchResult {
  marketId: string;
  items: ResearchItemResult[];
  summary: {
    aggregateSentiment: number;
    sentimentBreakdown: { bullish: number; bearish: number; neutral: number };
    sourceCount: number;
    keyThemes: string[];
    narrativeGap: number;
  };
}

interface ResearchItemResult {
  source: "news" | "twitter" | "web" | "ai";
  sourceUrl: string;
  title: string;
  content: string;
  sentiment: Sentiment;
  sentimentScore: number;
  reliability: number;
  publishedAt: string;
}

/**
 * Run research for a batch of markets
 */
export async function runResearch(
  markets: Array<{
    id: string;
    question: string;
    current_yes_price: number;
    category: string;
  }>,
  config: Partial<ResearchConfig> = {}
): Promise<ResearchResult[]> {
  const cfg = { ...DEFAULT_RESEARCH_CONFIG, ...config };
  // Process markets in parallel where possible
  const results = await Promise.all(
    markets.map(async (market) => {
      try {
        const result = await researchMarket(market, cfg);
        await storeResearch(result);
        return result;
      } catch (error) {
        console.error(`[Researcher] Failed for market ${market.id}:`, error);
        return null;
      }
    })
  );

  return results.filter((r): r is ResearchResult => r !== null);
}

/**
 * Research a single market
 */
async function researchMarket(
  market: {
    id: string;
    question: string;
    current_yes_price: number;
    category: string;
  },
  cfg: ResearchConfig
): Promise<ResearchResult> {
  // Gather news articles
  const newsItems = await fetchNewsArticles(market.question, cfg);

  // Classify sentiment for each item using AI (in parallel)
  const itemsToClassify = newsItems.slice(0, cfg.maxSourcesPerMarket);
  const classifiedItems = await Promise.all(
    itemsToClassify.map(async (item) => {
      const sentiment = await classifySentiment(
        item.title,
        item.content,
        market.question
      );
      return { ...item, ...sentiment };
    })
  );

  // Compute aggregate sentiment
  const summary = computeSummary(
    classifiedItems,
    Number(market.current_yes_price)
  );

  return {
    marketId: market.id,
    items: classifiedItems,
    summary,
  };
}

/**
 * Fetch news articles related to a market question
 */
async function fetchNewsArticles(
  query: string,
  cfg: ResearchConfig
): Promise<
  Array<{
    source: "news" | "twitter" | "web" | "ai";
    sourceUrl: string;
    title: string;
    content: string;
    publishedAt: string;
    reliability: number;
  }>
> {
  // Extract key terms from the question for search
  const searchTerms = extractSearchTerms(query);

  // Try NewsAPI if key is available
  if (cfg.newsApiKey) {
    try {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", searchTerms);
      url.searchParams.set("sortBy", "relevancy");
      url.searchParams.set("pageSize", "10");
      url.searchParams.set("language", "en");
      url.searchParams.set("apiKey", cfg.newsApiKey);

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        return (data.articles || []).map(
          (article: {
            url: string;
            title: string;
            description: string;
            content: string;
            publishedAt: string;
            source: { name: string };
          }) => ({
            source: "news" as const,
            sourceUrl: article.url || "",
            title: article.title || "",
            content: (article.description || article.content || "").slice(
              0,
              500
            ),
            publishedAt: article.publishedAt || new Date().toISOString(),
            reliability: getSourceReliability(article.source?.name || ""),
          })
        );
      }
    } catch (error) {
      console.error("[Researcher] NewsAPI fetch failed:", error);
    }
  }

  // Fallback: use AI to generate a research summary based on its knowledge
  return generateAIResearch(query);
}

/**
 * Use AI to generate research based on its training knowledge
 * (fallback when no news API is available)
 */
async function generateAIResearch(
  question: string
): Promise<
  Array<{
    source: "ai";
    sourceUrl: string;
    title: string;
    content: string;
    publishedAt: string;
    reliability: number;
  }>
> {
  try {
    const result = await client.callModel({
      model: SENTIMENT_MODEL,
      instructions:
        "You are a research assistant. Given a prediction market question, provide 3-5 key data points or recent developments relevant to this question. For each, provide a brief factual summary. Format each as: TITLE: <title>\\nCONTENT: <2-3 sentence summary>\\n---",
      input: `What are the key facts and recent developments relevant to this prediction market question: "${question}"`,
      temperature: 0.3,
      maxOutputTokens: 1000,
    });

    const text = await result.getText();
    const items = text.split("---").filter((s) => s.trim());

    return items.map((item) => {
      const titleMatch = item.match(/TITLE:\s*(.+)/i);
      const contentMatch = item.match(/CONTENT:\s*([\s\S]+)/i);
      return {
        source: "ai" as const,
        sourceUrl: "",
        title: titleMatch?.[1]?.trim() || "AI Research Summary",
        content: contentMatch?.[1]?.trim() || item.trim(),
        publishedAt: new Date().toISOString(),
        reliability: 0.3, // AI-generated gets low reliability
      };
    });
  } catch {
    return [];
  }
}

/**
 * Classify sentiment of a news item relative to the market question
 */
async function classifySentiment(
  title: string,
  content: string,
  marketQuestion: string
): Promise<{ sentiment: Sentiment; sentimentScore: number }> {
  try {
    const result = await client.callModel({
      model: SENTIMENT_MODEL,
      instructions:
        'You are a sentiment classifier. Given a news item and a prediction market question, determine if the news makes the market event MORE likely (bullish), LESS likely (bearish), or has no clear impact (neutral). Respond with exactly: SENTIMENT: <bullish|bearish|neutral>\\nSCORE: <number from -1.0 to 1.0>',
      input: `Market Question: "${marketQuestion}"\n\nNews Title: ${title}\nNews Content: ${content}\n\nClassify the sentiment of this news relative to the market question.`,
      temperature: 0.1,
      maxOutputTokens: 100,
    });

    const text = await result.getText();
    const sentimentMatch = text.match(
      /SENTIMENT:\s*(bullish|bearish|neutral)/i
    );
    const scoreMatch = text.match(/SCORE:\s*([-\d.]+)/i);

    const sentiment = (sentimentMatch?.[1]?.toLowerCase() || "neutral") as Sentiment;
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

    return {
      sentiment,
      sentimentScore: Math.max(-1, Math.min(1, score)),
    };
  } catch {
    return { sentiment: "neutral", sentimentScore: 0 };
  }
}

/**
 * Compute research summary from classified items
 */
function computeSummary(
  items: ResearchItemResult[],
  marketPrice: number
): ResearchResult["summary"] {
  const bullish = items.filter((i) => i.sentiment === "bullish").length;
  const bearish = items.filter((i) => i.sentiment === "bearish").length;
  const neutral = items.filter((i) => i.sentiment === "neutral").length;
  const total = items.length || 1;

  // Weighted sentiment score (-1 to 1)
  const aggregateSentiment =
    items.reduce((sum, i) => sum + i.sentimentScore * i.reliability, 0) /
    Math.max(1, items.reduce((sum, i) => sum + i.reliability, 0));

  // Narrative gap: how much does the sentiment diverge from market price?
  // Convert sentiment (-1 to 1) to probability space (0 to 1)
  const sentimentProbability = (aggregateSentiment + 1) / 2;
  const narrativeGap = Math.abs(sentimentProbability - marketPrice);

  // Extract key themes (simple: use titles)
  const keyThemes = items
    .slice(0, 5)
    .map((i) => i.title)
    .filter((t) => t.length > 0);

  return {
    aggregateSentiment,
    sentimentBreakdown: { bullish, bearish, neutral },
    sourceCount: total,
    keyThemes,
    narrativeGap,
  };
}

// --- Helpers ---

function extractSearchTerms(question: string): string {
  // Remove common prediction market filler words
  return question
    .replace(
      /\b(will|the|be|by|in|on|at|to|of|a|an|is|are|was|were|has|have|do|does|did)\b/gi,
      ""
    )
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function getSourceReliability(sourceName: string): number {
  const highReliability = [
    "reuters",
    "ap news",
    "bbc",
    "bloomberg",
    "financial times",
    "the economist",
    "wall street journal",
    "new york times",
    "washington post",
  ];
  const mediumReliability = [
    "cnn",
    "cnbc",
    "nbc",
    "abc",
    "cbs",
    "fox",
    "guardian",
    "politico",
  ];

  const lower = sourceName.toLowerCase();
  if (highReliability.some((s) => lower.includes(s))) return 0.9;
  if (mediumReliability.some((s) => lower.includes(s))) return 0.75;
  return 0.6;
}

/**
 * Store research results in Supabase
 */
async function storeResearch(result: ResearchResult) {
  const supabase = createServerClient();

  // Insert research items
  if (result.items.length > 0) {
    const rows = result.items.map((item) => ({
      market_id: result.marketId,
      source: item.source,
      source_url: item.sourceUrl,
      title: item.title,
      content: item.content.slice(0, 1000),
      sentiment: item.sentiment,
      sentiment_score: item.sentimentScore,
      reliability: item.reliability,
      published_at: item.publishedAt,
    }));

    const { error } = await supabase.from("research_items").insert(rows);
    if (error) console.error("[Researcher] Failed to store items:", error);
  }

  // Upsert research summary
  const { error } = await supabase.from("research_summaries").upsert(
    {
      market_id: result.marketId,
      aggregate_sentiment: result.summary.aggregateSentiment,
      sentiment_breakdown: result.summary.sentimentBreakdown,
      source_count: result.summary.sourceCount,
      key_themes: result.summary.keyThemes,
      narrative_gap: result.summary.narrativeGap,
      last_updated: new Date().toISOString(),
    },
    { onConflict: "market_id" }
  );

  if (error) console.error("[Researcher] Failed to store summary:", error);
}
