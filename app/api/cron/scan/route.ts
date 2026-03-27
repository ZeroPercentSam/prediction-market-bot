import { runMarketScan } from "@/lib/pipeline/scanner";
import {
  startPipelineRun,
  completePipelineRun,
  getConfig,
  isKillSwitchActive,
} from "@/lib/supabase/queries";

export const runtime = "edge";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check kill switch
  if (await isKillSwitchActive()) {
    return Response.json({
      status: "skipped",
      pipeline: "scan",
      reason: "Kill switch active",
      timestamp: new Date().toISOString(),
    });
  }

  const runId = await startPipelineRun("scan");
  const startTime = Date.now();

  try {
    // Load config
    const minVolume = await getConfig("min_market_volume");
    const maxExpiryDays = await getConfig("max_expiry_days");

    // Run the scan
    const result = await runMarketScan({
      minVolume: Number(minVolume) || 200,
      maxExpiryDays: Number(maxExpiryDays) || 30,
    });

    const duration = Date.now() - startTime;

    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: result.passedFilters,
      durationMs: duration,
    });

    return Response.json({
      status: "success",
      pipeline: "scan",
      totalScanned: result.totalScanned,
      polymarket: result.polymarketCount,
      kalshi: result.kalshiCount,
      passedFilters: result.passedFilters,
      anomaliesDetected: result.anomaliesDetected,
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

    console.error("[Cron:Scan] Pipeline error:", error);
    return Response.json(
      {
        status: "error",
        pipeline: "scan",
        error: errorMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
