import { runExecution } from "@/lib/pipeline/executor";
import {
  startPipelineRun,
  completePipelineRun,
  isKillSwitchActive,
  getConfig,
} from "@/lib/supabase/queries";

export const runtime = "edge";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isKillSwitchActive()) {
    return Response.json({
      status: "skipped",
      pipeline: "execute",
      reason: "Kill switch active",
    });
  }

  const runId = await startPipelineRun("execute");
  const startTime = Date.now();

  try {
    // Load execution config
    const [
      kellyFraction,
      maxPositionSizePct,
      maxConcurrentPositions,
      dailyLossLimitPct,
      slippageAbortPct,
      paperTradingMode,
      bankroll,
    ] = await Promise.all([
      getConfig("kelly_fraction").catch(() => 0.25),
      getConfig("max_position_size_pct").catch(() => 0.05),
      getConfig("max_concurrent_positions").catch(() => 15),
      getConfig("daily_loss_limit_pct").catch(() => 0.15),
      getConfig("slippage_abort_pct").catch(() => 0.02),
      getConfig("paper_trading_mode").catch(() => true),
      getConfig("bankroll").catch(() => 10000),
    ]);

    const result = await runExecution({
      kellyFraction: Number(kellyFraction),
      maxPositionSizePct: Number(maxPositionSizePct),
      maxConcurrentPositions: Number(maxConcurrentPositions),
      dailyLossLimitPct: Number(dailyLossLimitPct),
      slippageAbortPct: Number(slippageAbortPct),
      paperTradingMode: paperTradingMode === true || paperTradingMode === "true",
      bankroll: Number(bankroll),
    });

    const duration = Date.now() - startTime;

    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: result.signalsProcessed,
      durationMs: duration,
    });

    return Response.json({
      status: "success",
      pipeline: "execute",
      ...result,
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

    console.error("[Cron:Execute] Pipeline error:", error);
    return Response.json(
      { status: "error", pipeline: "execute", error: errorMsg },
      { status: 500 }
    );
  }
}
