"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// --- Overview Stats ---
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [
        { count: activeMarkets },
        { count: openTrades },
        { data: latestRisk },
        { data: latestPerf },
        { data: heartbeat },
        { count: pendingSignals },
      ] = await Promise.all([
        supabase.from("markets").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("trades").select("*", { count: "exact", head: true }).in("status", ["pending", "filled", "partial"]),
        supabase.from("risk_snapshots").select("*").order("timestamp", { ascending: false }).limit(1),
        supabase.from("performance_metrics").select("*").eq("period", "30d").order("calculated_at", { ascending: false }).limit(1),
        supabase.from("system_config").select("value").eq("key", "worker_heartbeat").single(),
        supabase.from("trade_signals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      const risk = latestRisk?.[0];
      const perf = latestPerf?.[0];

      return {
        activeMarkets: activeMarkets ?? 0,
        openPositions: openTrades ?? 0,
        pendingSignals: pendingSignals ?? 0,
        bankroll: risk?.bankroll ?? 10000,
        dailyPnl: risk?.daily_pnl ?? 0,
        dailyPnlPct: risk?.daily_pnl_pct ?? 0,
        winRate: perf?.win_rate ?? 0,
        sharpeRatio: perf?.sharpe_ratio ?? 0,
        maxDrawdown: perf?.max_drawdown ?? 0,
        workerHeartbeat: heartbeat?.value ?? null,
        killSwitchActive: risk?.kill_switch_active ?? false,
      };
    },
  });
}

// --- Markets ---
export function useMarkets(limit = 100) {
  return useQuery({
    queryKey: ["markets", limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("markets")
        .select("*")
        .eq("is_active", true)
        .order("volume_24h", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
  });
}

// --- Predictions ---
export function usePredictions(limit = 50) {
  return useQuery({
    queryKey: ["predictions", limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("predictions")
        .select("*, markets(question, platform, category), model_estimates(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
  });
}

// --- Research ---
export function useResearchSummaries(limit = 20) {
  return useQuery({
    queryKey: ["research-summaries", limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("research_summaries")
        .select("*, markets(question, platform)")
        .order("last_updated", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
  });
}

// --- Trades ---
export function useTrades(status?: string, limit = 50) {
  return useQuery({
    queryKey: ["trades", status, limit],
    queryFn: async () => {
      let query = supabase
        .from("trades")
        .select("*, markets(question, platform)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);
      const { data } = await query;
      return data ?? [];
    },
  });
}

// --- Pipeline Runs ---
export function usePipelineRuns(limit = 30) {
  return useQuery({
    queryKey: ["pipeline-runs", limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
  });
}

// --- Anomalies ---
export function useAnomalies(limit = 20) {
  return useQuery({
    queryKey: ["anomalies", limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("anomalies")
        .select("*, markets(question, platform)")
        .order("detected_at", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
  });
}

// --- Performance ---
export function usePerformanceMetrics() {
  return useQuery({
    queryKey: ["performance-metrics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("performance_metrics")
        .select("*")
        .order("calculated_at", { ascending: false });
      return data ?? [];
    },
  });
}

// --- Pipeline Status ---
export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: async () => {
      const stages = ["scan", "research", "predict", "execute", "compound"];
      const statuses: Record<string, "idle" | "running" | "error"> = {};

      for (const stage of stages) {
        const { data } = await supabase
          .from("pipeline_runs")
          .select("status, started_at")
          .eq("stage", stage)
          .order("started_at", { ascending: false })
          .limit(1);

        const latest = data?.[0];
        if (!latest) {
          statuses[stage] = "idle";
        } else if (latest.status === "running") {
          statuses[stage] = "running";
        } else if (latest.status === "error") {
          statuses[stage] = "error";
        } else {
          statuses[stage] = "idle";
        }
      }

      return statuses as Record<string, "idle" | "running" | "error">;
    },
    refetchInterval: 10_000, // Refresh pipeline status every 10s
  });
}
