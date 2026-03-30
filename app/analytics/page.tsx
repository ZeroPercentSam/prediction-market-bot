"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Brain,
  Loader2,
} from "lucide-react";
import {
  usePerformanceMetrics,
  useEquityCurve,
  useModelAccuracy,
  usePnlHistory,
} from "@/lib/hooks/use-dashboard-data";
import { EquityCurve } from "@/components/charts/equity-curve";
import { ModelAccuracy } from "@/components/charts/model-accuracy";
import { PnlChart } from "@/components/charts/pnl-chart";

type Period = "7d" | "30d" | "90d" | "all";

const periodLabels: Record<Period, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "90d": "90 Days",
  all: "All Time",
};

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded bg-zinc-800 animate-pulse" />
        <div className="h-4 w-64 rounded bg-zinc-800/60 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-zinc-800 bg-zinc-900/50 p-5">
            <div className="space-y-3">
              <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
              <div className="h-8 w-20 rounded bg-zinc-800 animate-pulse" />
              <div className="h-3 w-16 rounded bg-zinc-800/60 animate-pulse" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="h-64 rounded bg-zinc-800/30 animate-pulse" />
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  positive,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  positive: boolean;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-zinc-400">{title}</p>
        <Icon className="h-4 w-4 text-zinc-500" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p
        className={`text-xs mt-1 ${
          positive ? "text-emerald-500" : "text-amber-500"
        }`}
      >
        {description}
      </p>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { data: allMetrics, isLoading, error } = usePerformanceMetrics();
  const { data: equityCurveData } = useEquityCurve();
  const { data: modelAccuracyData } = useModelAccuracy();
  const { data: pnlHistoryData } = usePnlHistory();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("30d");

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-red-400 text-sm">Failed to load metrics: {(error as Error).message}</p>
        </Card>
      </div>
    );
  }

  const metrics = allMetrics ?? [];

  // Get the latest metric for each period (they are ordered by calculated_at desc)
  const latestByPeriod: Record<string, typeof metrics[number]> = {};
  for (const m of metrics) {
    if (!latestByPeriod[m.period]) {
      latestByPeriod[m.period] = m;
    }
  }

  const stats30d = latestByPeriod["30d"];

  const statCards = stats30d
    ? [
        {
          title: "Win Rate",
          value: `${(stats30d.win_rate ?? 0).toFixed(1)}%`,
          description: "Target: 60%+",
          icon: Target,
          positive: (stats30d.win_rate ?? 0) >= 60,
        },
        {
          title: "Sharpe Ratio",
          value: (stats30d.sharpe_ratio ?? 0).toFixed(2),
          description: "Annualized",
          icon: BarChart3,
          positive: (stats30d.sharpe_ratio ?? 0) > 2.0,
        },
        {
          title: "Max Drawdown",
          value: `${(stats30d.max_drawdown ?? 0).toFixed(1)}%`,
          description: "Peak to trough",
          icon: TrendingDown,
          positive: (stats30d.max_drawdown ?? 0) < 10,
        },
        {
          title: "Total P&L",
          value: `${(stats30d.total_pnl ?? 0) >= 0 ? "+" : ""}$${(stats30d.total_pnl ?? 0).toFixed(2)}`,
          description: `${stats30d.total_trades ?? 0} trades`,
          icon: TrendingUp,
          positive: (stats30d.total_pnl ?? 0) > 0,
        },
      ]
    : [];

  const periods: Period[] = ["7d", "30d", "90d", "all"];
  const comparisonPeriods = periods.filter((p) => latestByPeriod[p]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-zinc-400">
          Performance metrics and model accuracy tracking
        </p>
      </div>

      {/* Top row: 30d stat cards */}
      {statCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((metric) => (
            <StatCard key={metric.title} {...metric} />
          ))}
        </div>
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-sm text-zinc-500">
            No 30-day performance data available yet.
          </p>
        </Card>
      )}

      {/* Period Comparison Table */}
      {comparisonPeriods.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="p-5 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">
                Performance by Period
              </h3>
              <div className="flex gap-1">
                {periods.map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPeriod(p)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedPeriod === p
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 font-medium text-zinc-400">Period</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Win Rate</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Sharpe</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Max DD</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Total P&L</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Trades</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Profit Factor</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Brier Score</th>
                </tr>
              </thead>
              <tbody>
                {comparisonPeriods.map((p) => {
                  const m = latestByPeriod[p];
                  const isSelected = p === selectedPeriod;
                  return (
                    <tr
                      key={p}
                      className={`border-b border-zinc-800/50 transition-colors ${
                        isSelected ? "bg-zinc-800/40" : "hover:bg-zinc-800/30"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Badge
                          variant={isSelected ? "default" : "outline"}
                          className="text-xs"
                        >
                          {periodLabels[p]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">
                        {(m.win_rate ?? 0).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {(m.sharpe_ratio ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {(m.max_drawdown ?? 0).toFixed(1)}%
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold ${
                          (m.total_pnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {(m.total_pnl ?? 0) >= 0 ? "+" : ""}${(m.total_pnl ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400">
                        {m.total_trades ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {(m.profit_factor ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {(m.brier_score ?? 0).toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Equity Curve & Cumulative P&L */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Equity Curve
          </h3>
          <EquityCurve data={equityCurveData ?? []} />
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Cumulative P&L
          </h3>
          <PnlChart data={pnlHistoryData ?? []} />
        </Card>
      </div>

      {/* Model Accuracy Section */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-400">
            Model Accuracy
          </h3>
        </div>
        <ModelAccuracy data={modelAccuracyData ?? []} />
      </Card>
    </div>
  );
}
