/**
 * Worker configuration and Supabase client
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("[config] NEXT_PUBLIC_SUPABASE_URL is not set — cannot start worker");
}
if (!serviceRoleKey) {
  throw new Error("[config] SUPABASE_SERVICE_ROLE_KEY is not set — cannot start worker");
}

export const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function isKillSwitchActive(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "kill_switch_active")
      .single();
    if (error) {
      console.error("[config] Kill switch check failed (defaulting to ACTIVE for safety):", error.message);
      return true;
    }
    return data?.value === true || data?.value === "true";
  } catch (e) {
    console.error("[config] Kill switch check threw (defaulting to ACTIVE for safety):", e instanceof Error ? e.message : e);
    return true;
  }
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
      value: new Date().toISOString(),
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
