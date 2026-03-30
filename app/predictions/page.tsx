"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Loader2 } from "lucide-react";
import { usePredictions } from "@/lib/hooks/use-dashboard-data";

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

function edgeColor(edge: number): string {
  if (edge > 0.04) return "text-emerald-500";
  if (edge > 0.02) return "text-amber-500";
  if (edge < 0) return "text-red-500";
  return "text-zinc-400";
}

function edgeBadgeClasses(edge: number): string {
  if (edge > 0.04)
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (edge > 0.02)
    return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}

export default function PredictionsPage() {
  const { data: predictions, isLoading, error } = usePredictions(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Brain className="h-6 w-6 text-violet-400" />
          AI Predictions
        </h1>
        <p className="text-sm text-zinc-400">
          Ensemble model estimates with full math breakdown
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          <span className="ml-3 text-sm text-zinc-500">
            Loading predictions...
          </span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-400">
            Failed to load predictions. Please try again.
          </p>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && predictions?.length === 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <Brain className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            No predictions yet. The pipeline will generate predictions once
            markets are scanned and analyzed.
          </p>
        </Card>
      )}

      {/* Predictions List */}
      <div className="space-y-4">
        {predictions?.map((prediction) => {
          const marketPrice = prediction.market_price ?? 0;
          const ensembleProb = prediction.ensemble_probability ?? 0;
          const edge = prediction.edge ?? 0;
          const ev = prediction.expected_value ?? 0;
          const decimalOdds = marketPrice > 0 ? 1 / marketPrice : 0;
          const question = prediction.markets?.question ?? "Unknown Market";
          const platform = prediction.markets?.platform ?? "unknown";

          return (
            <Card
              key={prediction.id}
              className="border-zinc-800 bg-zinc-900/50 p-6"
            >
              {/* Header: Question, Platform, Signal */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {question}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="text-xs text-zinc-300 shrink-0 uppercase"
                    >
                      {platform}
                    </Badge>
                  </div>

                  {/* Market Price vs Ensemble Probability */}
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Market</span>
                      <span className="text-sm font-mono font-medium text-zinc-300">
                        {(marketPrice * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex-1 max-w-48 relative h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-zinc-500"
                        style={{ width: `${marketPrice * 100}%` }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-violet-400"
                        style={{ left: `${ensembleProb * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">AI</span>
                      <span className="text-sm font-mono font-medium text-violet-400">
                        {(ensembleProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Badge className={`shrink-0 ${edgeBadgeClasses(edge)}`}>
                      {edge > 0 ? "+" : ""}
                      {(edge * 100).toFixed(1)}% edge
                    </Badge>
                  </div>
                </div>

                {/* Signal Badge */}
                <div className="shrink-0">
                  {prediction.signal_generated ? (
                    <Badge className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                      <TrendingUp className="h-3 w-3" />
                      {prediction.signal_direction === "buy_yes"
                        ? "BUY YES"
                        : "BUY NO"}
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="gap-1 text-zinc-500"
                    >
                      No signal
                    </Badge>
                  )}
                </div>
              </div>

              {/* Model Breakdown Grid */}
              {prediction.model_estimates &&
                prediction.model_estimates.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                    {prediction.model_estimates.map(
                      (estimate: {
                        model: string;
                        probability: number;
                        confidence: number;
                        reasoning: string;
                        weight: number;
                        latency_ms: number;
                        cost_usd: number;
                      }) => (
                        <div
                          key={estimate.model}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-center"
                        >
                          <p className="text-xs text-zinc-500 mb-1 truncate">
                            {estimate.model}
                          </p>
                          <p className="text-lg font-mono font-semibold text-white">
                            {(estimate.probability * 100).toFixed(0)}%
                          </p>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="text-xs text-zinc-600">
                              Conf: {(estimate.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 mt-0.5">
                            Wt: {(estimate.weight * 100).toFixed(0)}%
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}

              {/* Math Breakdown */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm">
                <p className="text-zinc-500 mb-2">// Math Breakdown</p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">
                    Market Price (p_market):
                  </span>{" "}
                  {marketPrice.toFixed(4)}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">
                    Ensemble Prob (p_model):
                  </span>{" "}
                  {ensembleProb.toFixed(4)}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">
                    Edge (p_model - p_market):
                  </span>{" "}
                  <span className={edgeColor(edge)}>
                    {edge > 0 ? "+" : ""}
                    {(edge * 100).toFixed(2)}%
                  </span>
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">
                    Decimal Odds (1/p_market):
                  </span>{" "}
                  {decimalOdds.toFixed(4)}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">
                    EV = p_model * (1/p_market - 1) - (1 - p_model):
                  </span>{" "}
                  <span className={ev > 0 ? "text-emerald-500" : "text-red-500"}>
                    {ev > 0 ? "+" : ""}
                    {ev.toFixed(4)}
                  </span>
                </p>
                <p className="text-zinc-300 mt-2">
                  <span className="text-zinc-500">Signal:</span>{" "}
                  {prediction.signal_generated
                    ? `TRADE (edge ${(edge * 100).toFixed(1)}% > threshold 4%)`
                    : `NO TRADE (edge ${Math.abs(edge * 100).toFixed(1)}% < threshold 4%)`}
                </p>
              </div>

              {/* Timestamp */}
              <p className="text-xs text-zinc-600 mt-3 text-right">
                {formatRelativeTime(prediction.created_at)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
