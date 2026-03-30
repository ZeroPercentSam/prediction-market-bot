"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Search,
  Zap,
  Brain,
  Target,
  ArrowRightLeft,
  Inbox,
} from "lucide-react";
import { usePipelineRuns } from "@/lib/hooks/use-dashboard-data";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms === 0) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "Success",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Error",
  },
  running: {
    icon: Loader2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "Running",
  },
} as const;

const stageConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  scan: { label: "Market Scan", icon: Search },
  research: { label: "Research", icon: Brain },
  predict: { label: "Prediction", icon: Target },
  execute: { label: "Execution", icon: ArrowRightLeft },
  compound: { label: "Compounding", icon: Zap },
};

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded bg-zinc-800 animate-pulse" />
        <div className="h-4 w-64 rounded bg-zinc-800/60 animate-pulse" />
      </div>
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <div className="h-4 w-40 rounded bg-zinc-800 animate-pulse" />
        </div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-20 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-12 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-16 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-zinc-800 animate-pulse" />
          <div className="h-16 rounded bg-zinc-800/40 animate-pulse" />
        </div>
      </Card>
    </div>
  );
}

export default function LogsPage() {
  const { data: pipelineRuns, isLoading, error } = usePipelineRuns(50);

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Pipeline Logs</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-red-400 text-sm">Failed to load logs: {(error as Error).message}</p>
        </Card>
      </div>
    );
  }

  const runs = pipelineRuns ?? [];
  const errorRuns = runs.filter((r) => r.status === "error" && r.error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pipeline Logs</h1>
        <p className="text-sm text-zinc-400">
          Pipeline run history and error tracking
        </p>
      </div>

      {/* Pipeline Runs Table */}
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Recent Pipeline Runs
            </h3>
            <Badge variant="secondary" className="text-xs ml-auto">
              {runs.length} runs
            </Badge>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Inbox className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-400">No pipeline runs yet</p>
            <p className="text-xs text-zinc-500 mt-1">
              Pipeline execution history will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 font-medium text-zinc-400">Stage</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Markets Processed
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Duration
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const status = statusConfig[run.status as keyof typeof statusConfig] ?? statusConfig.error;
                  const StatusIcon = status.icon;
                  const stage = stageConfig[run.stage] ?? { label: run.stage, icon: Zap };
                  const StageIcon = stage.icon;

                  return (
                    <tr
                      key={run.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs gap-1">
                          <StageIcon className="h-3 w-3" />
                          {stage.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={`gap-1 text-xs ${status.bg} ${status.color} ${status.border}`}
                        >
                          <StatusIcon
                            className={`h-3 w-3 ${
                              run.status === "running" ? "animate-spin" : ""
                            }`}
                          />
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {run.markets_processed ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {formatDuration(run.duration_ms)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {run.started_at ? formatRelativeTime(run.started_at) : "--"}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-400 max-w-xs truncate">
                        {run.error || "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Error Log */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-medium text-zinc-400">Recent Errors</h3>
          <Badge variant="secondary" className="text-xs ml-auto">
            {errorRuns.length} error{errorRuns.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {errorRuns.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-zinc-700">
            <p className="text-sm text-zinc-500">No errors to display.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {errorRuns.map((run) => {
              const stage = stageConfig[run.stage] ?? { label: run.stage, icon: Zap };
              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className="text-xs text-red-400 border-red-500/30"
                    >
                      {stage.label}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {run.started_at ? formatRelativeTime(run.started_at) : "unknown"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 font-mono">{run.error}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
