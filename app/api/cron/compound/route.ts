import { runCompound } from "@/lib/pipeline/compounder";
import {
  startPipelineRun,
  completePipelineRun,
  isKillSwitchActive,
} from "@/lib/supabase/queries";

export const runtime = "edge";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Compound analysis runs even if kill switch is active (it's read-only analysis)
  const runId = await startPipelineRun("compound");
  const startTime = Date.now();

  try {
    const result = await runCompound();
    const duration = Date.now() - startTime;

    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: result.tradesAnalyzed,
      durationMs: duration,
    });

    return Response.json({
      status: "success",
      pipeline: "compound",
      tradesAnalyzed: result.tradesAnalyzed,
      winRate: result.winRate,
      sharpeRatio: result.sharpeRatio,
      maxDrawdown: result.maxDrawdown,
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

    console.error("[Cron:Compound] Pipeline error:", error);
    return Response.json(
      { status: "error", pipeline: "compound", error: errorMsg },
      { status: 500 }
    );
  }
}
