/**
 * Worker configuration and Supabase client
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function isKillSwitchActive(): Promise<boolean> {
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  return data?.value === true || data?.value === "true";
}

export async function getConfig(key: string): Promise<unknown> {
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value;
}

export async function writeHeartbeat(): Promise<void> {
  await supabase.from("system_config").upsert(
    {
      key: "worker_heartbeat",
      value: JSON.parse(JSON.stringify(new Date().toISOString())),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

export async function startPipelineRun(stage: string): Promise<string> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({ stage, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
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
): Promise<void> {
  await supabase
    .from("pipeline_runs")
    .update({
      status: result.status,
      markets_processed: result.marketsProcessed,
      duration_ms: result.durationMs,
      error: result.error || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}
