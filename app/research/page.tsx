import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AtSign,
  Newspaper,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import type { Sentiment } from "@/types";

// Mock data — will be replaced with Supabase queries
const mockResearchItems = [
  {
    id: "1",
    marketId: "m1",
    market: "Will BTC exceed $100K by April 2026?",
    source: "twitter" as const,
    sourceUrl: "https://twitter.com/example/status/1",
    title: "Whale wallets accumulating BTC at record pace",
    content:
      "On-chain data shows top 100 wallets have added 45K BTC in the last 72 hours, signaling strong institutional confidence.",
    sentiment: "bullish" as Sentiment,
    sentimentScore: 0.78,
    reliability: 0.82,
    publishedAt: "2026-03-27T08:30:00Z",
    analyzedAt: "2026-03-27T08:35:00Z",
  },
  {
    id: "2",
    marketId: "m2",
    market: "Fed rate cut in May 2026?",
    source: "news" as const,
    sourceUrl: "https://reuters.com/article/fed-minutes",
    title: "Fed minutes suggest cautious approach to rate cuts",
    content:
      "Federal Reserve officials signaled they remain data-dependent and see no urgency to cut rates in the near term despite cooling inflation.",
    sentiment: "bearish" as Sentiment,
    sentimentScore: -0.54,
    reliability: 0.95,
    publishedAt: "2026-03-27T06:15:00Z",
    analyzedAt: "2026-03-27T06:20:00Z",
  },
  {
    id: "3",
    marketId: "m1",
    market: "Will BTC exceed $100K by April 2026?",
    source: "reddit" as const,
    sourceUrl: "https://reddit.com/r/bitcoin/comments/abc123",
    title: "ETF inflows remain steady but slowing",
    content:
      "Weekly BTC ETF inflows dropped to $320M from $580M the previous week. Still positive but momentum is fading.",
    sentiment: "neutral" as Sentiment,
    sentimentScore: 0.12,
    reliability: 0.65,
    publishedAt: "2026-03-27T09:00:00Z",
    analyzedAt: "2026-03-27T09:05:00Z",
  },
  {
    id: "4",
    marketId: "m3",
    market: "S&P 500 above 6000 by end of Q2?",
    source: "news" as const,
    sourceUrl: "https://bloomberg.com/article/sp500-outlook",
    title: "Earnings season beats expectations across tech sector",
    content:
      "With 60% of S&P 500 companies reporting, aggregate earnings are 8.2% above consensus. Tech sector leading with 14% beat rate.",
    sentiment: "bullish" as Sentiment,
    sentimentScore: 0.65,
    reliability: 0.91,
    publishedAt: "2026-03-27T07:45:00Z",
    analyzedAt: "2026-03-27T07:50:00Z",
  },
];

const mockSummaries = [
  {
    market: "Will BTC exceed $100K by April 2026?",
    aggregateSentiment: 0.42,
    sentimentBreakdown: { bullish: 12, bearish: 5, neutral: 8 },
    sourceCount: 25,
    keyThemes: ["Whale accumulation", "ETF inflows", "Halving cycle", "Macro uncertainty"],
    narrativeGap: 0.18,
  },
  {
    market: "Fed rate cut in May 2026?",
    aggregateSentiment: -0.31,
    sentimentBreakdown: { bullish: 4, bearish: 14, neutral: 7 },
    sourceCount: 25,
    keyThemes: ["Data dependency", "Sticky inflation", "Labor market strength"],
    narrativeGap: 0.06,
  },
  {
    market: "S&P 500 above 6000 by end of Q2?",
    aggregateSentiment: 0.38,
    sentimentBreakdown: { bullish: 9, bearish: 4, neutral: 6 },
    sourceCount: 19,
    keyThemes: ["Earnings beats", "Tech momentum", "Valuation concerns"],
    narrativeGap: 0.24,
  },
];

const sentimentConfig = {
  bullish: { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  bearish: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  neutral: { icon: Minus, color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
};

const sourceIcons = {
  twitter: AtSign,
  reddit: MessageSquare,
  news: Newspaper,
  rss: Newspaper,
  web: Search,
};

export default function ResearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Research Hub</h1>
        <p className="text-sm text-zinc-400">
          Sentiment analysis and narrative tracking across sources
        </p>
      </div>

      {/* Narrative Gap Alerts */}
      {mockSummaries.filter((s) => s.narrativeGap > 0.15).length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium text-amber-500">
              Narrative Gap Alerts
            </h3>
          </div>
          <div className="space-y-2">
            {mockSummaries
              .filter((s) => s.narrativeGap > 0.15)
              .map((s) => (
                <div
                  key={s.market}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-zinc-900/50 px-3 py-2"
                >
                  <span className="text-sm text-zinc-300">{s.market}</span>
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    Gap: {(s.narrativeGap * 100).toFixed(0)}%
                  </Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Market Summaries */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {mockSummaries.map((summary) => (
          <Card
            key={summary.market}
            className="border-zinc-800 bg-zinc-900/50 p-5"
          >
            <h3 className="text-sm font-semibold text-white mb-3 truncate">
              {summary.market}
            </h3>

            {/* Source Breakdown */}
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1">
                <AtSign className="h-3 w-3 text-blue-400" />
                <span className="text-xs text-zinc-400">Twitter</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-orange-400" />
                <span className="text-xs text-zinc-400">Reddit</span>
              </div>
              <div className="flex items-center gap-1">
                <Newspaper className="h-3 w-3 text-zinc-300" />
                <span className="text-xs text-zinc-400">News</span>
              </div>
              <span className="text-xs text-zinc-500 ml-auto">
                {summary.sourceCount} sources
              </span>
            </div>

            {/* Sentiment Breakdown Bar */}
            <div className="mb-3">
              <div className="flex h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${(summary.sentimentBreakdown.bullish / summary.sourceCount) * 100}%`,
                  }}
                />
                <div
                  className="bg-zinc-500"
                  style={{
                    width: `${(summary.sentimentBreakdown.neutral / summary.sourceCount) * 100}%`,
                  }}
                />
                <div
                  className="bg-red-500"
                  style={{
                    width: `${(summary.sentimentBreakdown.bearish / summary.sourceCount) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-emerald-500">
                  {summary.sentimentBreakdown.bullish} bullish
                </span>
                <span className="text-xs text-zinc-500">
                  {summary.sentimentBreakdown.neutral} neutral
                </span>
                <span className="text-xs text-red-500">
                  {summary.sentimentBreakdown.bearish} bearish
                </span>
              </div>
            </div>

            {/* Key Themes */}
            <div className="flex flex-wrap gap-1.5">
              {summary.keyThemes.map((theme) => (
                <Badge
                  key={theme}
                  variant="secondary"
                  className="text-xs text-zinc-300"
                >
                  {theme}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Sentiment Feed */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">
          Sentiment Analysis Feed
        </h3>
        <div className="space-y-3">
          {mockResearchItems.map((item) => {
            const config = sentimentConfig[item.sentiment];
            const SentimentIcon = config.icon;
            const SourceIcon = sourceIcons[item.source];
            return (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SourceIcon className="h-4 w-4 text-zinc-400" />
                    <span className="text-xs text-zinc-500 capitalize">
                      {item.source}
                    </span>
                    <span className="text-xs text-zinc-600">
                      Reliability: {(item.reliability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Badge className={`gap-1 ${config.bg} ${config.color} ${config.border}`}>
                    <SentimentIcon className="h-3 w-3" />
                    {item.sentiment} ({item.sentimentScore > 0 ? "+" : ""}
                    {item.sentimentScore.toFixed(2)})
                  </Badge>
                </div>
                <h4 className="text-sm font-medium text-white mb-1">
                  {item.title}
                </h4>
                <p className="text-xs text-zinc-400 mb-2">{item.content}</p>
                <p className="text-xs text-zinc-600">
                  Re: {item.market}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
