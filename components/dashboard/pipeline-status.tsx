"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Search,
  Newspaper,
  Brain,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import type { PipelineStage } from "@/types";

interface PipelineStatusProps {
  statuses: Record<PipelineStage, "idle" | "running" | "error">;
}

const stages: { key: PipelineStage; label: string; icon: typeof Search }[] = [
  { key: "scan", label: "Scan", icon: Search },
  { key: "research", label: "Research", icon: Newspaper },
  { key: "predict", label: "Predict", icon: Brain },
  { key: "execute", label: "Execute", icon: TrendingUp },
  { key: "compound", label: "Compound", icon: BarChart3 },
];

export function PipelineStatus({ statuses }: PipelineStatusProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 p-6">
      <h3 className="mb-4 text-sm font-medium text-zinc-400">
        Pipeline Status
      </h3>
      <div className="flex items-center gap-2">
        {stages.map((stage, i) => (
          <div key={stage.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  statuses[stage.key] === "running" &&
                    "bg-emerald-500/10 text-emerald-500",
                  statuses[stage.key] === "idle" &&
                    "bg-zinc-800 text-zinc-500",
                  statuses[stage.key] === "error" &&
                    "bg-red-500/10 text-red-500"
                )}
              >
                <stage.icon className="h-4 w-4" />
              </div>
              <span className="text-xs text-zinc-500">{stage.label}</span>
              <Badge
                variant={
                  statuses[stage.key] === "running"
                    ? "default"
                    : statuses[stage.key] === "error"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px] px-1.5 py-0"
              >
                {statuses[stage.key]}
              </Badge>
            </div>
            {i < stages.length - 1 && (
              <div className="h-px w-8 bg-zinc-700 mb-8" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
