import { runResearch } from "@/lib/pipeline/researcher";
import {
  startPipelineRun,
  completePipelineRun,
  isKillSwitchActive,
} from "@/lib/supabase/queries";
import { createServerClient } from "@/lib/supabase/client";

export const runtime = "edge";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isKillSwitchActive()) {
    return Response.json({
      status: "skipped",
      pipeline: "research",
      reason: "Kill switch active",
    });
  }

  const runId = await startPipelineRun("research");
  const startTime = Date.now();

  try {
    const supabase = createServerClient();

    // Get markets that need research (recently scanned, high volume, or with anomalies)
    const { data: markets } = await supabase
      .from("markets")
      .select("id, question, current_yes_price, category")
      .eq("is_active", true)
      .order("volume_24h", { ascending: false })
      .limit(10); // Research top 10 markets per cycle

    if (!markets || markets.length === 0) {
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - startTime,
      });
      return Response.json({
        status: "success",
        pipeline: "research",
        marketsResearched: 0,
      });
    }

    const results = await runResearch(markets);

    const totalSources = results.reduce(
      (sum, r) => sum + r.items.length,
      0
    );
    const duration = Date.now() - startTime;

    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: results.length,
      durationMs: duration,
    });

    return Response.json({
      status: "success",
      pipeline: "research",
      marketsResearched: results.length,
      sourcesAnalyzed: totalSources,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error";

    await completePipelineRun(runId, {
      status: "error",
      marketsProcessed: 0,
      durationMs: duration,
      error: errorMsg,
    });

    console.error("[Cron:Research] Pipeline error:", error);
    return Response.json(
      { status: "error", pipeline: "research", error: errorMsg },
      { status: 500 }
    );
  }
}
