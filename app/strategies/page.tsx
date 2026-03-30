"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  ArrowLeftRight,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Loader2,
  Inbox,
} from "lucide-react";
import {
  useStrategyPerformance,
  type StrategyName,
  type StrategyStats,
} from "@/lib/hooks/use-dashboard-data";

const strategyConfig: Record<
  StrategyName,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
  }
> = {
  prediction: {
    label: "Prediction",
    icon: Brain,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    description: "AI ensemble predictions on mispriced markets",
  },
  arbitrage: {
    label: "Arbitrage",
    icon: ArrowLeftRight,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    description: "Cross-platform arbitrage opportunities",
  },
  certainty: {
    label: "Certainty",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    description: "Near-resolved market trades",
  },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatPnl(value: number): string {
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-zinc-800 animate-pulse" />
        <div className="h-4 w-80 rounded bg-zinc-800/60 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-zinc-800 bg-zinc-900/50 p-6">
            <div className="space-y-4">
              <div className="h-5 w-28 rounded bg-zinc-800 animate-pulse" />
              <div className="h-8 w-24 rounded bg-zinc-800 animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-4 w-full rounded bg-zinc-800/60 animate-pulse" />
                <div className="h-4 w-full rounded bg-zinc-800/60 animate-pulse" />
                <div className="h-4 w-full rounded bg-zinc-800/60 animate-pulse" />
                <div className="h-4 w-full rounded bg-zinc-800/60 animate-pulse" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="h-48 rounded bg-zinc-800/30 animate-pulse" />
      </Card>
    </div>
  );
}

function StrategyCard({ stats }: { stats: StrategyStats }) {
  const config = strategyConfig[stats.name];
  const Icon = config.icon;

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`rounded-lg p-2 ${config.bgColor}`}>
          <Icon className={`h-5 w-5 ${config.color}`} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-white">{config.label}</h3>
          <p className="text-xs text-zinc-500">{config.description}</p>
        </div>
      </div>

      <div className="mb-4">
        <p
          className={`text-2xl font-bold ${
            stats.totalPnl >= 0 ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {formatPnl(stats.totalPnl)}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">Total P&L</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-xs text-zinc-500">Win Rate</p>
          <p className="text-sm font-mono text-zinc-300">
            {stats.winRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Total Trades</p>
          <p className="text-sm font-mono text-zinc-300">{stats.totalTrades}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Active</p>
          <p className="text-sm font-mono text-zinc-300">
            {stats.activeTrades}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Avg P&L</p>
          <p
            className={`text-sm font-mono ${
              stats.avgPnl >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {formatPnl(stats.avgPnl)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ComparisonTable({
  data,
}: {
  data: Record<StrategyName, StrategyStats>;
}) {
  const strategies: StrategyName[] = ["prediction", "arbitrage", "certainty"];

  const rows: {
    label: string;
    getValue: (s: StrategyStats) => string;
    colorize?: boolean;
  }[] = [
    { label: "Total Trades", getValue: (s) => String(s.totalTrades) },
    { label: "Win Rate", getValue: (s) => `${s.winRate.toFixed(1)}%` },
    { label: "Total P&L", getValue: (s) => formatPnl(s.totalPnl), colorize: true },
    { label: "Avg P&L/Trade", getValue: (s) => formatPnl(s.avgPnl), colorize: true },
    { label: "Best Trade", getValue: (s) => formatPnl(s.bestTrade), colorize: true },
    { label: "Worst Trade", getValue: (s) => formatPnl(s.worstTrade), colorize: true },
    {
      label: "Volume",
      getValue: (s) => `$${s.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    },
    { label: "Active", getValue: (s) => String(s.activeTrades) },
  ];

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="p-5 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-400">
          Strategy Comparison
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-4 py-3 font-medium text-zinc-400">Metric</th>
              {strategies.map((s) => {
                const config = strategyConfig[s];
                const Icon = config.icon;
                return (
                  <th
                    key={s}
                    className="px-4 py-3 font-medium text-zinc-400 text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      {config.label}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <td className="px-4 py-3 text-zinc-400">{row.label}</td>
                {strategies.map((s) => {
                  const value = row.getValue(data[s]);
                  const numericValue = parseFloat(value.replace(/[$,+%]/g, ""));
                  return (
                    <td
                      key={s}
                      className={`px-4 py-3 text-right font-mono ${
                        row.colorize && !isNaN(numericValue)
                          ? numericValue >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                          : "text-zinc-300"
                      }`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RecentActivity({
  data,
}: {
  data: Record<StrategyName, StrategyStats>;
}) {
  const strategies: StrategyName[] = ["prediction", "arbitrage", "certainty"];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {strategies.map((strategy) => {
        const config = strategyConfig[strategy];
        const Icon = config.icon;
        const trades = data[strategy].recentTrades.slice(0, 10);

        return (
          <Card
            key={strategy}
            className="border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
              <Icon className={`h-4 w-4 ${config.color}`} />
              <h3 className="text-sm font-medium text-zinc-400">
                {config.label} Activity
              </h3>
            </div>
            {trades.length === 0 ? (
              <div className="p-6 flex flex-col items-center text-center">
                <Inbox className="h-8 w-8 text-zinc-700 mb-2" />
                <p className="text-xs text-zinc-500">No trades yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                  >
                    <p className="text-xs text-white truncate mb-1">
                      {trade.question}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[10px] px-1.5 py-0 ${
                            trade.direction === "buy_yes"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          }`}
                        >
                          {trade.direction === "buy_yes" ? "YES" : "NO"}
                        </Badge>
                        <span className="text-[10px] font-mono text-zinc-500">
                          @${trade.entry_price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {trade.pnl != null && (
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              trade.pnl >= 0
                                ? "text-emerald-500"
                                : "text-red-500"
                            }`}
                          >
                            {formatPnl(trade.pnl)}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-600">
                          {formatRelativeTime(trade.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function StrategiesPage() {
  const { data, isLoading, error } = useStrategyPerformance();

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Strategies</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-red-400 text-sm">
            Failed to load strategy data: {(error as Error).message}
          </p>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Strategies</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-sm text-zinc-500">No strategy data available.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Strategies</h1>
        <p className="text-sm text-zinc-400">
          Performance breakdown by trading strategy
        </p>
      </div>

      {/* Strategy Overview Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StrategyCard stats={data.prediction} />
        <StrategyCard stats={data.arbitrage} />
        <StrategyCard stats={data.certainty} />
      </div>

      {/* Strategy Comparison Table */}
      <ComparisonTable data={data} />

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Recent Activity
        </h2>
        <RecentActivity data={data} />
      </div>
    </div>
  );
}
