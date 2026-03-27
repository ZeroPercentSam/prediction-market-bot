import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { PipelineStage } from "@/types";

// Mock data — will be replaced with Supabase queries
const mockPipelineRuns: {
  id: string;
  stage: PipelineStage;
  status: "running" | "success" | "error";
  marketsProcessed: number;
  duration: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}[] = [
  {
    id: "r1",
    stage: "scan",
    status: "success",
    marketsProcessed: 312,
    duration: 4200,
    error: null,
    startedAt: "2026-03-27T09:00:00Z",
    completedAt: "2026-03-27T09:00:04Z",
  },
  {
    id: "r2",
    stage: "research",
    status: "success",
    marketsProcessed: 47,
    duration: 18500,
    error: null,
    startedAt: "2026-03-27T09:00:05Z",
    completedAt: "2026-03-27T09:00:23Z",
  },
  {
    id: "r3",
    stage: "predict",
    status: "success",
    marketsProcessed: 12,
    duration: 32100,
    error: null,
    startedAt: "2026-03-27T09:00:24Z",
    completedAt: "2026-03-27T09:00:56Z",
  },
  {
    id: "r4",
    stage: "execute",
    status: "error",
    marketsProcessed: 2,
    duration: 1200,
    error: "Polymarket API rate limit exceeded. Retry in 60s.",
    startedAt: "2026-03-27T09:00:57Z",
    completedAt: "2026-03-27T09:00:58Z",
  },
  {
    id: "r5",
    stage: "compound",
    status: "success",
    marketsProcessed: 3,
    duration: 850,
    error: null,
    startedAt: "2026-03-27T08:55:00Z",
    completedAt: "2026-03-27T08:55:01Z",
  },
  {
    id: "r6",
    stage: "scan",
    status: "running",
    marketsProcessed: 156,
    duration: 2100,
    error: null,
    startedAt: "2026-03-27T09:05:00Z",
    completedAt: null,
  },
];

const mockErrors = [
  {
    id: "e1",
    stage: "execute" as PipelineStage,
    message: "Polymarket API rate limit exceeded. Retry in 60s.",
    timestamp: "2026-03-27T09:00:58Z",
  },
  {
    id: "e2",
    stage: "research" as PipelineStage,
    message: "Twitter API returned 429: Too Many Requests for market m42.",
    timestamp: "2026-03-27T08:45:12Z",
  },
  {
    id: "e3",
    stage: "predict" as PipelineStage,
    message:
      "DeepSeek model timeout after 30s for market m18. Falling back to 4-model ensemble.",
    timestamp: "2026-03-27T08:30:05Z",
  },
];

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
};

const stageLabels: Record<PipelineStage, string> = {
  scan: "Market Scan",
  research: "Research",
  predict: "Prediction",
  execute: "Execution",
  compound: "Compounding",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pipeline Logs</h1>
        <p className="text-sm text-zinc-400">
          Pipeline run history and error tracking
        </p>
      </div>

      {/* Pipeline Runs */}
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Recent Pipeline Runs
            </h3>
          </div>
        </div>
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
              {mockPipelineRuns.map((run) => {
                const config = statusConfig[run.status];
                const StatusIcon = config.icon;
                return (
                  <tr
                    key={run.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {stageLabels[run.stage]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`gap-1 text-xs ${config.bg} ${config.color} ${config.border}`}
                      >
                        <StatusIcon
                          className={`h-3 w-3 ${
                            run.status === "running" ? "animate-spin" : ""
                          }`}
                        />
                        {config.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {run.marketsProcessed}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatDuration(run.duration)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(run.startedAt).toLocaleTimeString()}
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
      </Card>

      {/* Error Log */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-medium text-zinc-400">Recent Errors</h3>
          <Badge variant="secondary" className="text-xs ml-auto">
            {mockErrors.length} errors
          </Badge>
        </div>
        <div className="space-y-3">
          {mockErrors.map((error) => (
            <div
              key={error.id}
              className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className="text-xs text-red-400 border-red-500/30"
                >
                  {stageLabels[error.stage]}
                </Badge>
                <span className="text-xs text-zinc-500">
                  {new Date(error.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-zinc-300 font-mono">{error.message}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
