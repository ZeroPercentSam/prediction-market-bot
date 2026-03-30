"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, Loader2, AlertTriangle } from "lucide-react";
import { useResearchSummaries } from "@/lib/hooks/use-dashboard-data";

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function sentimentLabel(score: number): string {
  if (score > 0.2) return "Bullish";
  if (score < -0.2) return "Bearish";
  return "Neutral";
}

function sentimentColor(score: number): string {
  if (score > 0.2) return "text-emerald-500";
  if (score < -0.2) return "text-red-500";
  return "text-zinc-400";
}

function sentimentBadgeClasses(score: number): string {
  if (score > 0.2)
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (score < -0.2) return "bg-red-500/10 text-red-500 border-red-500/20";
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}

export default function ResearchPage() {
  const { data: summaries, isLoading, error } = useResearchSummaries(20);

  const narrativeGapAlerts =
    summaries?.filter(
      (s) => s.narrative_gap != null && s.narrative_gap > 0.15
    ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-blue-400" />
          Research Hub
        </h1>
        <p className="text-sm text-zinc-400">
          Sentiment analysis and narrative tracking across sources
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          <span className="ml-3 text-sm text-zinc-500">
            Loading research data...
          </span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-400">
            Failed to load research summaries. Please try again.
          </p>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && summaries?.length === 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <Newspaper className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            No research summaries yet. Summaries will appear after the research
            pipeline processes market-related sources.
          </p>
        </Card>
      )}

      {/* Narrative Gap Alerts */}
      {narrativeGapAlerts.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium text-amber-500">
              Narrative Gap Alerts
            </h3>
          </div>
          <div className="space-y-2">
            {narrativeGapAlerts.map((s) => (
              <div
                key={s.market_id}
                className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-zinc-900/50 px-3 py-2"
              >
                <span className="text-sm text-zinc-300 truncate mr-3">
                  {s.markets?.question ?? "Unknown Market"}
                </span>
                <Badge className="shrink-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                  Gap: {((s.narrative_gap ?? 0) * 100).toFixed(0)}%
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Research Summaries */}
      {!isLoading && summaries && summaries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => {
            const question = summary.markets?.question ?? "Unknown Market";
            const platform = summary.markets?.platform ?? "unknown";
            const sentiment = summary.aggregate_sentiment ?? 0;
            const breakdown = summary.sentiment_breakdown ?? {
              bullish: 0,
              bearish: 0,
              neutral: 0,
            };
            const totalBreakdown =
              breakdown.bullish + breakdown.bearish + breakdown.neutral;
            const sourceCount = summary.source_count ?? 0;
            const themes = summary.key_themes ?? [];
            const narrativeGap = summary.narrative_gap ?? 0;
            const lastUpdated = summary.last_updated;

            return (
              <Card
                key={summary.market_id}
                className="border-zinc-800 bg-zinc-900/50 p-5"
              >
                {/* Market Question + Platform */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-white leading-tight">
                    {question}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="text-xs text-zinc-400 shrink-0 uppercase"
                  >
                    {platform}
                  </Badge>
                </div>

                {/* Sentiment Gauge */}
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={sentimentBadgeClasses(sentiment)}>
                    {sentimentLabel(sentiment)}
                  </Badge>
                  <span
                    className={`text-sm font-mono font-medium ${sentimentColor(sentiment)}`}
                  >
                    {sentiment > 0 ? "+" : ""}
                    {sentiment.toFixed(2)}
                  </span>
                </div>

                {/* Sentiment Breakdown Bar */}
                <div className="mb-3">
                  <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
                    {totalBreakdown > 0 && (
                      <>
                        <div
                          className="bg-emerald-500"
                          style={{
                            width: `${(breakdown.bullish / totalBreakdown) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-zinc-500"
                          style={{
                            width: `${(breakdown.neutral / totalBreakdown) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-red-500"
                          style={{
                            width: `${(breakdown.bearish / totalBreakdown) * 100}%`,
                          }}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-emerald-500">
                      {breakdown.bullish} bullish
                    </span>
                    <span className="text-xs text-zinc-500">
                      {breakdown.neutral} neutral
                    </span>
                    <span className="text-xs text-red-500">
                      {breakdown.bearish} bearish
                    </span>
                  </div>
                </div>

                {/* Source Count */}
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="h-3 w-3 text-zinc-500" />
                  <span className="text-xs text-zinc-400">
                    {sourceCount} source{sourceCount !== 1 ? "s" : ""} analyzed
                  </span>
                </div>

                {/* Key Themes */}
                {themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {themes.map((theme: string) => (
                      <Badge
                        key={theme}
                        variant="secondary"
                        className="text-xs text-zinc-300"
                      >
                        {theme}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Narrative Gap */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 mb-2">
                  <span className="text-xs text-zinc-500">Narrative Gap</span>
                  <span
                    className={`text-xs font-mono font-medium ${
                      narrativeGap > 0.15
                        ? "text-amber-500"
                        : narrativeGap > 0.08
                          ? "text-zinc-300"
                          : "text-zinc-500"
                    }`}
                  >
                    {(narrativeGap * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Last Updated */}
                {lastUpdated && (
                  <p className="text-xs text-zinc-600 text-right">
                    Updated {formatRelativeTime(lastUpdated)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
