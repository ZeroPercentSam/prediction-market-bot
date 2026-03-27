import { createServerClient } from "./client";
import type { Market, Anomaly, PipelineRun } from "@/types";

// ============================================
// Market Queries
// ============================================

export async function upsertMarkets(
  markets: Array<{
    platform: string;
    platformMarketId: string;
    question: string;
    description: string;
    category: string;
    currentYesPrice: number;
    currentNoPrice: number;
    volume24h: number;
    totalVolume: number;
    liquidity: number;
    expiryDate: string;
    spreadCents: number;
    priceChange1h: number;
    priceChange24h: number;
    anomalyFlags: string[];
    isActive: boolean;
  }>
) {
  const supabase = createServerClient();

  const rows = markets.map((m) => ({
    platform: m.platform,
    platform_market_id: m.platformMarketId,
    question: m.question,
    description: m.description,
    category: m.category,
    current_yes_price: m.currentYesPrice,
    current_no_price: m.currentNoPrice,
    volume_24h: m.volume24h,
    total_volume: m.totalVolume,
    liquidity: m.liquidity,
    expiry_date: m.expiryDate || null,
    spread_cents: m.spreadCents,
    price_change_1h: m.priceChange1h,
    price_change_24h: m.priceChange24h,
    anomaly_flags: m.anomalyFlags,
    is_active: m.isActive,
    last_scanned: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("markets")
    .upsert(rows, { onConflict: "platform,platform_market_id" })
    .select();

  if (error) throw new Error(`Upsert markets failed: ${error.message}`);
  return data;
}

export async function getActiveMarkets() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("is_active", true)
    .order("volume_24h", { ascending: false });

  if (error) throw new Error(`Fetch markets failed: ${error.message}`);
  return data;
}

export async function getMarketById(id: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Fetch market failed: ${error.message}`);
  return data;
}

// ============================================
// Market Snapshots
// ============================================

export async function insertMarketSnapshots(
  snapshots: {
    marketId: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
  }[]
) {
  const supabase = createServerClient();

  const rows = snapshots.map((s) => ({
    market_id: s.marketId,
    yes_price: s.yesPrice,
    no_price: s.noPrice,
    volume: s.volume,
    liquidity: s.liquidity,
  }));

  const { error } = await supabase.from("market_snapshots").insert(rows);
  if (error) throw new Error(`Insert snapshots failed: ${error.message}`);
}

// ============================================
// Anomalies
// ============================================

export async function insertAnomalies(
  anomalies: Omit<Anomaly, "id" | "detectedAt">[]
) {
  const supabase = createServerClient();

  const rows = anomalies.map((a) => ({
    market_id: a.marketId,
    type: a.type,
    severity: a.severity,
    description: a.description,
    value: a.value,
    threshold: a.threshold,
  }));

  const { error } = await supabase.from("anomalies").insert(rows);
  if (error) throw new Error(`Insert anomalies failed: ${error.message}`);
}

export async function getRecentAnomalies(limit: number = 50) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("anomalies")
    .select("*, markets(question, platform)")
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Fetch anomalies failed: ${error.message}`);
  return data;
}

// ============================================
// Pipeline Runs
// ============================================

export async function startPipelineRun(
  stage: PipelineRun["stage"]
): Promise<string> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({ stage, status: "running" })
    .select("id")
    .single();

  if (error) throw new Error(`Start pipeline run failed: ${error.message}`);
  return data.id;
}

export async function completePipelineRun(
  id: string,
  result: {
    status: "success" | "error";
    marketsProcessed: number;
    durationMs: number;
    error?: string;
  }
) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("pipeline_runs")
    .update({
      status: result.status,
      markets_processed: result.marketsProcessed,
      duration_ms: result.durationMs,
      error: result.error || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error)
    throw new Error(`Complete pipeline run failed: ${error.message}`);
}

export async function getRecentPipelineRuns(limit: number = 20) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Fetch pipeline runs failed: ${error.message}`);
  return data;
}

// ============================================
// System Config
// ============================================

export async function getConfig(key: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", key)
    .single();

  if (error) throw new Error(`Fetch config failed: ${error.message}`);
  return data.value;
}

export async function setConfig(key: string, value: unknown) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("system_config")
    .upsert(
      { key, value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) throw new Error(`Set config failed: ${error.message}`);
}

export async function isKillSwitchActive(): Promise<boolean> {
  const value = await getConfig("kill_switch_active");
  return value === true || value === "true";
}
