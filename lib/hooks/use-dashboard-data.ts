"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// --- Overview Stats ---
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    refetchInterval: 30_000,
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
        bankroll: risk?.bankroll ?? 0,
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

// --- Live P&L ---
export interface LivePnlTrade {
  tradeId: string;
  question: string;
  platform: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  notes: string | null;
}

export interface LivePnlData {
  trades: LivePnlTrade[];
  totalUnrealizedPnl: number;
  totalExposure: number;
  tradeCount: number;
}

export function useLivePnl() {
  return useQuery({
    queryKey: ["live-pnl"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<LivePnlData> => {
      const { data } = await supabase
        .from("trades")
        .select("*, markets(question, platform, current_yes_price, current_no_price)")
        .eq("status", "filled")
        .order("created_at", { ascending: false });

      const openTrades = data ?? [];

      const trades: LivePnlTrade[] = openTrades.map((t) => {
        const entryPrice = Number(t.entry_price) || 0;
        const positionSize = Number(t.position_size) || 0;
        let currentPrice: number;
        let unrealizedPnl: number;
        let unrealizedPnlPct: number;

        if (t.direction === "buy_yes") {
          currentPrice = Number(t.markets?.current_yes_price) || 0;
        } else {
          // entry_price for buy_no already stores the NO price paid
          currentPrice = Number(t.markets?.current_no_price) || (1 - (Number(t.markets?.current_yes_price) || 0));
        }
        // P&L = (currentPrice - entryPrice) / entryPrice * positionSize
        unrealizedPnl = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * positionSize : 0;
        unrealizedPnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

        return {
          tradeId: t.id,
          question: t.markets?.question ?? "Unknown market",
          platform: t.markets?.platform ?? t.platform ?? "unknown",
          direction: t.direction,
          entryPrice,
          currentPrice,
          positionSize,
          unrealizedPnl,
          unrealizedPnlPct,
          notes: t.notes ?? null,
        };
      });

      const totalUnrealizedPnl = trades.reduce((sum, t) => sum + t.unrealizedPnl, 0);
      const totalExposure = trades.reduce((sum, t) => sum + t.positionSize, 0);

      return {
        trades,
        totalUnrealizedPnl,
        totalExposure,
        tradeCount: trades.length,
      };
    },
  });
}

// --- Markets ---
export function useMarkets(limit = 100) {
  return useQuery({
    queryKey: ["markets", limit],
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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

// --- Strategy Performance ---
export type StrategyName = "prediction" | "arbitrage" | "certainty";

export interface StrategyStats {
  name: StrategyName;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  unrealizedPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  totalVolume: number;
  activeTrades: number;
  recentTrades: Array<{
    id: string;
    question: string;
    direction: string;
    entry_price: number;
    pnl: number | null;
    status: string;
    created_at: string;
  }>;
}

function classifyStrategy(notes: string | null): StrategyName {
  if (notes && notes.includes("arb_pair")) return "arbitrage";
  if (notes === "certainty_trade") return "certainty";
  return "prediction";
}

export function useStrategyPerformance() {
  return useQuery({
    queryKey: ["strategy-performance"],
    refetchInterval: 30_000,
    queryFn: async () => {
      // Fetch all settled trades
      const { data: settledTrades } = await supabase
        .from("trades")
        .select("*, markets(question)")
        .eq("status", "settled");

      // Fetch active trades with market prices for unrealized P&L
      const { data: activeTrades } = await supabase
        .from("trades")
        .select("*, markets(question, current_yes_price, current_no_price)")
        .eq("status", "filled");

      // Fetch recent trades (last 20 per strategy — fetch more to ensure coverage)
      const { data: recentTrades } = await supabase
        .from("trades")
        .select("*, markets(question)")
        .order("created_at", { ascending: false })
        .limit(60);

      const strategies: StrategyName[] = ["prediction", "arbitrage", "certainty"];
      const results: Record<StrategyName, StrategyStats> = {} as Record<StrategyName, StrategyStats>;

      for (const strategy of strategies) {
        const settled = (settledTrades ?? []).filter(
          (t) => classifyStrategy(t.notes) === strategy
        );
        const active = (activeTrades ?? []).filter(
          (t) => classifyStrategy(t.notes) === strategy
        );
        const recent = (recentTrades ?? [])
          .filter((t) => classifyStrategy(t.notes) === strategy)
          .slice(0, 20);

        const totalTrades = settled.length;
        const wins = settled.filter((t) => (t.pnl ?? 0) > 0).length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const totalPnl = settled.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
        const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
        const pnls = settled.map((t) => t.pnl ?? 0);
        const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
        const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
        const totalVolume = settled.reduce((sum, t) => sum + (t.position_size ?? 0), 0);

        // Compute unrealized P&L for active trades from current market prices
        const unrealizedPnl = active.reduce((sum, t) => {
          const entryPrice = Number(t.entry_price) || 0;
          const positionSize = Number(t.position_size) || 0;
          if (entryPrice <= 0) return sum;
          const currentPrice = t.direction === "buy_yes"
            ? (Number(t.markets?.current_yes_price) || 0)
            : (Number(t.markets?.current_no_price) || (1 - (Number(t.markets?.current_yes_price) || 0)));
          return sum + ((currentPrice - entryPrice) / entryPrice) * positionSize;
        }, 0);

        results[strategy] = {
          name: strategy,
          totalTrades,
          winRate,
          totalPnl,
          unrealizedPnl,
          avgPnl,
          bestTrade,
          worstTrade,
          totalVolume,
          activeTrades: active.length,
          recentTrades: recent.map((t) => {
            // For active trades, compute unrealized P&L from market prices
            let pnl = t.pnl;
            if (t.status === "filled") {
              const entryPrice = Number(t.entry_price) || 0;
              const positionSize = Number(t.position_size) || 0;
              const currentPrice = t.direction === "buy_yes"
                ? (Number(t.markets?.current_yes_price) || 0)
                : (Number(t.markets?.current_no_price) || (1 - (Number(t.markets?.current_yes_price) || 0)));
              pnl = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * positionSize : 0;
            }
            return {
              id: t.id,
              question: t.markets?.question ?? "Unknown market",
              direction: t.direction,
              entry_price: t.entry_price ?? 0,
              pnl,
              status: t.status,
              created_at: t.created_at,
            };
          }),
        };
      }

      return results;
    },
  });
}

// --- Equity Curve ---
export function useEquityCurve() {
  return useQuery({
    queryKey: ["equity-curve"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_snapshots")
        .select("timestamp, bankroll")
        .order("timestamp", { ascending: true });

      return (data ?? []).map((row) => ({
        date: row.timestamp,
        equity: row.bankroll,
      }));
    },
  });
}

// --- Model Accuracy ---
export function useModelAccuracy() {
  return useQuery({
    queryKey: ["model-accuracy"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // model_estimates has 'model' column (not model_id)
      // predictions table has no resolved_outcome column, so we use
      // calibration_data which tracks actual outcomes per model
      const { data: calibrationData } = await supabase
        .from("calibration_data")
        .select("model_id, predicted_probability, actual_outcome");

      if (!calibrationData || calibrationData.length === 0) return [];

      const byModel: Record<string, { correct: number; total: number }> = {};

      for (const row of calibrationData) {
        const modelId = row.model_id;
        if (!byModel[modelId]) byModel[modelId] = { correct: 0, total: 0 };
        byModel[modelId].total++;

        const predictedYes = row.predicted_probability >= 0.5;
        const actualYes = row.actual_outcome === 1;
        if (predictedYes === actualYes) byModel[modelId].correct++;
      }

      return Object.entries(byModel).map(([model, stats]) => ({
        model,
        accuracy: Math.round((stats.correct / stats.total) * 100),
        trades: stats.total,
      }));
    },
  });
}

// --- P&L History ---
export function usePnlHistory() {
  return useQuery({
    queryKey: ["pnl-history"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // trades table uses settled_at and pnl (not exited_at / realized_pnl)
      const { data } = await supabase
        .from("trades")
        .select("settled_at, pnl")
        .eq("status", "settled")
        .not("settled_at", "is", null)
        .not("pnl", "is", null)
        .order("settled_at", { ascending: true });

      if (!data || data.length === 0) return [];

      let cumulative = 0;
      return data.map((trade) => {
        cumulative += trade.pnl ?? 0;
        return {
          date: trade.settled_at,
          pnl: Math.round(cumulative * 100) / 100,
        };
      });
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

// --- Risk Data ---
export function useRiskData() {
  return useQuery({
    queryKey: ["risk-data"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        { data: latestRisk },
        { data: activeTrades },
        { data: settledToday },
        { data: killSwitchConfig },
        { data: maxPosSizeConfig },
        { data: dailyLossConfig },
        { data: maxConcurrentConfig },
      ] = await Promise.all([
        supabase
          .from("risk_snapshots")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(1),
        supabase
          .from("trades")
          .select("platform, position_size")
          .in("status", ["pending", "filled", "partial"]),
        supabase
          .from("trades")
          .select("pnl")
          .eq("status", "settled")
          .gte("settled_at", todayStart.toISOString()),
        supabase
          .from("system_config")
          .select("value")
          .eq("key", "kill_switch_active")
          .single(),
        supabase
          .from("system_config")
          .select("value")
          .eq("key", "max_position_size_pct")
          .single(),
        supabase
          .from("system_config")
          .select("value")
          .eq("key", "daily_loss_limit_pct")
          .single(),
        supabase
          .from("system_config")
          .select("value")
          .eq("key", "max_concurrent_positions")
          .single(),
      ]);

      const risk = latestRisk?.[0];

      // Group active trades by platform — sum position_size (dollar exposure)
      const exposureByPlatform: Record<string, number> = {};
      if (activeTrades) {
        for (const trade of activeTrades) {
          const p = trade.platform ?? "unknown";
          exposureByPlatform[p] = (exposureByPlatform[p] ?? 0) + (Number(trade.position_size) || 0);
        }
      }

      // Sum today's P&L from settled trades
      const dailyPnl =
        settledToday?.reduce((sum, t) => sum + (t.pnl ?? 0), 0) ?? 0;

      // Determine kill switch state from system_config or risk snapshot
      // system_config stores kill_switch_active as JSONB (e.g. 'true' or 'false')
      let killSwitchActive = risk?.kill_switch_active ?? false;
      if (killSwitchConfig?.value !== undefined && killSwitchConfig?.value !== null) {
        const raw = killSwitchConfig.value;
        if (typeof raw === "boolean") {
          killSwitchActive = raw;
        } else if (typeof raw === "string") {
          killSwitchActive = raw === "true";
        } else if (typeof raw === "object" && raw !== null && "active" in (raw as Record<string, unknown>)) {
          killSwitchActive = Boolean((raw as Record<string, unknown>).active);
        }
      }

      // Parse config values from system_config (stored as JSONB)
      const parseConfigNum = (config: { value: unknown } | null, fallback: number): number => {
        if (!config?.value) return fallback;
        const val = typeof config.value === "string" ? parseFloat(config.value) : Number(config.value);
        return isNaN(val) ? fallback : val;
      };

      return {
        bankroll: risk?.bankroll ?? 0,
        dailyPnl,
        dailyPnlPct: risk?.bankroll ? (dailyPnl / risk.bankroll) * 100 : 0,
        openPositions: activeTrades?.length ?? 0,
        totalExposure: risk?.total_exposure ?? 0,
        varValue: risk?.var_value ?? 0,
        exposureByPlatform,
        exposureByCategory: (risk?.exposure_by_category ?? {}) as Record<
          string,
          number
        >,
        killSwitchActive,
        maxConcurrentPositions: parseConfigNum(maxConcurrentConfig, 15),
        maxPositionSizePct: parseConfigNum(maxPosSizeConfig, 0.05),
        dailyLossLimitPct: parseConfigNum(dailyLossConfig, 0.15),
      };
    },
  });
}

// --- System Config ---

// Maps DB snake_case keys to camelCase keys used by the frontend
const DB_KEY_TO_CAMEL: Record<string, string> = {
  scan_interval_min: "scanIntervalMin",
  min_market_volume: "minMarketVolume",
  max_expiry_days: "maxExpiryDays",
  edge_threshold: "edgeThreshold",
  kelly_fraction: "kellyFraction",
  max_position_size_pct: "maxPositionSizePct",
  max_concurrent_positions: "maxConcurrentPositions",
  daily_loss_limit_pct: "dailyLossLimitPct",
  slippage_abort_pct: "slippageAbortPct",
  ai_daily_budget_usd: "aiDailyBudgetUsd",
  paper_trading_mode: "paperTradingMode",
  model_weights: "modelWeights",
  kill_switch_active: "killSwitchActive",
  bankroll: "bankroll",
  worker_heartbeat: "workerHeartbeat",
};

const CAMEL_TO_DB_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(DB_KEY_TO_CAMEL).map(([db, camel]) => [camel, db])
);

export function useSystemConfig() {
  return useQuery({
    queryKey: ["system-config"],
    queryFn: async () => {
      const { data } = await supabase.from("system_config").select("*");
      const configMap: Record<string, unknown> = {};
      if (data) {
        for (const row of data) {
          // Map snake_case DB key to camelCase for frontend consumption
          const camelKey = DB_KEY_TO_CAMEL[row.key] ?? row.key;
          configMap[camelKey] = row.value;
        }
      }
      return configMap;
    },
  });
}

// --- Save Config Mutation ---
export function useSaveConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: { key: string; value: unknown }[]) => {
      for (const entry of entries) {
        // Convert camelCase key to snake_case DB key
        const dbKey = CAMEL_TO_DB_KEY[entry.key] ?? entry.key;
        const { error } = await supabase
          .from("system_config")
          .upsert(
            { key: dbKey, value: entry.value },
            { onConflict: "key" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

// --- Kill Switch Toggle ---
export function useToggleKillSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (active: boolean) => {
      const res = await fetch("/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to toggle kill switch");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["risk-data"] });
    },
  });
}
