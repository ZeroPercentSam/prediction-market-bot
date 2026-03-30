import { supabase } from "./client";

/**
 * Client-side queries for dashboard pages.
 * Uses the anon key (public) — no service role needed.
 */

export async function fetchDashboardMarkets(limit: number = 50) {
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("is_active", true)
    .order("volume_24h", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchDashboardMarkets failed: ${error.message}`);
  return data ?? [];
}

export async function fetchMarketById(id: string) {
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`fetchMarketById failed: ${error.message}`);
  return data;
}

export async function fetchRecentAnomalies(limit: number = 20) {
  const { data, error } = await supabase
    .from("anomalies")
    .select("*, markets(question, platform)")
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchRecentAnomalies failed: ${error.message}`);
  return data ?? [];
}

export async function fetchPipelineRuns(limit: number = 20) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchPipelineRuns failed: ${error.message}`);
  return data ?? [];
}

export async function fetchDashboardStats() {
  const [
    { count: activeMarkets },
    { count: openTrades },
    { data: latestRisk },
    { data: latestPerf },
  ] = await Promise.all([
    supabase
      .from("markets")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "filled", "partial"]),
    supabase
      .from("risk_snapshots")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(1),
    supabase
      .from("performance_metrics")
      .select("*")
      .eq("period", "30d")
      .order("calculated_at", { ascending: false })
      .limit(1),
  ]);

  const risk = latestRisk?.[0];
  const perf = latestPerf?.[0];

  return {
    activeMarkets: activeMarkets ?? 0,
    openPositions: openTrades ?? 0,
    bankroll: risk?.bankroll ?? 10000,
    dailyPnl: risk?.daily_pnl ?? 0,
    dailyPnlPct: risk?.daily_pnl_pct ?? 0,
    winRate: perf?.win_rate ?? 0,
    sharpeRatio: perf?.sharpe_ratio ?? 0,
    maxDrawdown: perf?.max_drawdown ?? 0,
    killSwitchActive: risk?.kill_switch_active ?? false,
  };
}

export async function fetchTrades(status?: string, limit: number = 50) {
  let query = supabase
    .from("trades")
    .select("*, markets(question, platform)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchTrades failed: ${error.message}`);
  return data ?? [];
}

export async function fetchPredictions(limit: number = 50) {
  const { data, error } = await supabase
    .from("predictions")
    .select("*, markets(question, platform), model_estimates(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchPredictions failed: ${error.message}`);
  return data ?? [];
}

export async function fetchResearchSummaries(limit: number = 20) {
  const { data, error } = await supabase
    .from("research_summaries")
    .select("*, markets(question, platform)")
    .order("last_updated", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchResearchSummaries failed: ${error.message}`);
  return data ?? [];
}

export async function fetchResearchItems(
  marketId?: string,
  limit: number = 50
) {
  let query = supabase
    .from("research_items")
    .select("*, markets(question)")
    .order("analyzed_at", { ascending: false })
    .limit(limit);

  if (marketId) {
    query = query.eq("market_id", marketId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchResearchItems failed: ${error.message}`);
  return data ?? [];
}
