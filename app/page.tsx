"use client";

import { StatCard } from "@/components/dashboard/stat-card";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { Card } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Activity,
  Search,
  Brain,
  Loader2,
} from "lucide-react";
import {
  useDashboardStats,
  usePipelineStatus,
  usePipelineRuns,
  useEquityCurve,
} from "@/lib/hooks/use-dashboard-data";
import { EquityCurve } from "@/components/charts/equity-curve";
import type { PipelineStage } from "@/types";

const stageIcons: Record<PipelineStage, typeof Search> = {
  scan: Search,
  research: Brain,
  predict: Target,
  execute: TrendingUp,
  compound: BarChart3,
};

const statusColors: Record<string, string> = {
  running: "text-amber-500",
  success: "text-emerald-500",
  error: "text-red-500",
};

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function OverviewPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: pipelineStatuses, isLoading: pipelineLoading } =
    usePipelineStatus();
  const { data: pipelineRuns, isLoading: runsLoading } = usePipelineRuns(10);
  const { data: equityCurveData } = useEquityCurve();

  const isLoading = statsLoading || pipelineLoading || runsLoading;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const bankroll = stats?.bankroll ?? 0;
  const dailyPnl = stats?.dailyPnl ?? 0;
  const dailyPnlPct = stats?.dailyPnlPct ?? 0;
  const winRate = stats?.winRate ?? 0;
  const sharpeRatio = stats?.sharpeRatio ?? 0;
  const openPositions = stats?.openPositions ?? 0;
  const activeMarkets = stats?.activeMarkets ?? 0;
  const pendingSignals = stats?.pendingSignals ?? 0;

  const pnlSign = dailyPnl >= 0 ? "+" : "";
  const pnlChangeType = dailyPnl >= 0 ? "positive" : "negative";

  const defaultStatuses: Record<PipelineStage, "idle" | "running" | "error"> = {
    scan: "idle",
    research: "idle",
    predict: "idle",
    execute: "idle",
    compound: "idle",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>
        <p className="text-sm text-zinc-400">
          Real-time view of your prediction market trading bot
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Bankroll"
          value={`$${bankroll.toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          title="Daily P&L"
          value={`${pnlSign}$${Math.abs(dailyPnl).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          change={`${pnlSign}${dailyPnlPct.toFixed(2)}%`}
          changeType={pnlChangeType}
          icon={TrendingUp}
        />
        <StatCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          change="Target: 60%+"
          changeType={winRate >= 60 ? "positive" : "neutral"}
          icon={Target}
          description="Last 30 days"
        />
        <StatCard
          title="Sharpe Ratio"
          value={sharpeRatio.toFixed(2)}
          change="Target: >2.0"
          changeType={sharpeRatio >= 2 ? "positive" : "neutral"}
          icon={BarChart3}
          description="Annualized"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Open Positions"
          value={openPositions.toString()}
          description="Max 15 concurrent"
          icon={Activity}
        />
        <StatCard
          title="Active Markets"
          value={activeMarkets.toString()}
          description="Passing filters"
          icon={Search}
        />
        <StatCard
          title="Pending Signals"
          value={pendingSignals.toString()}
          description="Awaiting execution"
          icon={Brain}
        />
      </div>

      {/* Pipeline Status */}
      <PipelineStatus
        statuses={
          pipelineStatuses
            ? (pipelineStatuses as Record<PipelineStage, "idle" | "running" | "error">)
            : defaultStatuses
        }
      />

      {/* Recent Activity & Equity Curve */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {pipelineRuns && pipelineRuns.length > 0 ? (
              pipelineRuns.map((run) => {
                const Icon =
                  stageIcons[run.stage as PipelineStage] ?? Activity;
                const color = statusColors[run.status] ?? "text-zinc-400";

                return (
                  <div
                    key={run.id}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                  >
                    <div className="mt-0.5">
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize text-zinc-200">
                          {run.stage}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            run.status === "success"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : run.status === "error"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-amber-500/10 text-amber-500"
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {run.markets_processed ?? run.marketsProcessed ?? 0}{" "}
                        markets processed
                      </p>
                      <p className="text-xs text-zinc-600">
                        {formatRelativeTime(
                          run.started_at ?? run.startedAt
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-zinc-500">No recent pipeline runs</p>
            )}
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Equity Curve
          </h3>
          <EquityCurve data={equityCurveData ?? []} />
        </Card>
      </div>
    </div>
  );
}
