import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Brain,
  Trophy,
} from "lucide-react";
import type { AIModel } from "@/types";

// Mock data — will be replaced with Supabase queries
const mockMetrics = {
  winRate: 64.3,
  sharpeRatio: 2.14,
  maxDrawdown: 8.7,
  profitFactor: 1.82,
  totalPnl: 1247.5,
  totalTrades: 42,
  avgEdgeCaptured: 5.6,
  avgHoldTimeHours: 72,
  brierScore: 0.18,
};

const mockModelAccuracy: {
  model: AIModel;
  accuracy: number;
  brierScore: number;
  avgConfidence: number;
  totalPredictions: number;
}[] = [
  {
    model: "grok",
    accuracy: 71.2,
    brierScore: 0.16,
    avgConfidence: 0.68,
    totalPredictions: 42,
  },
  {
    model: "claude",
    accuracy: 68.4,
    brierScore: 0.18,
    avgConfidence: 0.72,
    totalPredictions: 42,
  },
  {
    model: "gpt4o",
    accuracy: 66.1,
    brierScore: 0.19,
    avgConfidence: 0.65,
    totalPredictions: 42,
  },
  {
    model: "gemini",
    accuracy: 63.8,
    brierScore: 0.21,
    avgConfidence: 0.61,
    totalPredictions: 42,
  },
  {
    model: "deepseek",
    accuracy: 62.5,
    brierScore: 0.22,
    avgConfidence: 0.64,
    totalPredictions: 42,
  },
];

const metricCards = [
  {
    title: "Win Rate",
    value: `${mockMetrics.winRate}%`,
    description: "Target: 60%+",
    icon: Target,
    positive: mockMetrics.winRate >= 60,
  },
  {
    title: "Sharpe Ratio",
    value: mockMetrics.sharpeRatio.toFixed(2),
    description: "Annualized",
    icon: BarChart3,
    positive: mockMetrics.sharpeRatio > 2.0,
  },
  {
    title: "Max Drawdown",
    value: `${mockMetrics.maxDrawdown}%`,
    description: "Peak to trough",
    icon: TrendingDown,
    positive: mockMetrics.maxDrawdown < 10,
  },
  {
    title: "Profit Factor",
    value: mockMetrics.profitFactor.toFixed(2),
    description: "Gross profit / gross loss",
    icon: TrendingUp,
    positive: mockMetrics.profitFactor > 1.5,
  },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-zinc-400">
          Performance metrics and model accuracy tracking
        </p>
      </div>

      {/* Performance Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card
              key={metric.title}
              className="border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-zinc-400">{metric.title}</p>
                <Icon className="h-4 w-4 text-zinc-500" />
              </div>
              <p className="text-2xl font-bold text-white">{metric.value}</p>
              <p
                className={`text-xs mt-1 ${
                  metric.positive ? "text-emerald-500" : "text-amber-500"
                }`}
              >
                {metric.description}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-400 mb-1">Total P&L</p>
          <p className="text-xl font-bold text-emerald-500">
            +${mockMetrics.totalPnl.toLocaleString()}
          </p>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-400 mb-1">Total Trades</p>
          <p className="text-xl font-bold text-white">{mockMetrics.totalTrades}</p>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-400 mb-1">Avg Edge Captured</p>
          <p className="text-xl font-bold text-white">
            {mockMetrics.avgEdgeCaptured}%
          </p>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-400 mb-1">Avg Hold Time</p>
          <p className="text-xl font-bold text-white">
            {mockMetrics.avgHoldTimeHours}h
          </p>
        </Card>
      </div>

      {/* Equity Curve Placeholder */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">
          Equity Curve
        </h3>
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-700">
          <p className="text-sm text-zinc-500">
            Chart will render with live data from Supabase
          </p>
        </div>
      </Card>

      {/* Model Accuracy Leaderboard */}
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Model Accuracy Leaderboard
            </h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 font-medium text-zinc-400">Rank</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Model</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Accuracy
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Brier Score
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Avg Confidence
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Predictions
                </th>
              </tr>
            </thead>
            <tbody>
              {mockModelAccuracy.map((model, index) => (
                <tr
                  key={model.model}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    {index === 0 ? (
                      <Trophy className="h-4 w-4 text-amber-500" />
                    ) : (
                      <span className="text-zinc-500 font-mono">
                        #{index + 1}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs capitalize">
                      {model.model}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {model.accuracy.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {model.brierScore.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {(model.avgConfidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {model.totalPredictions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
